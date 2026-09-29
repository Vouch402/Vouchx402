import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { isAddress, formatUnits } from "viem";
import { defaultNetwork } from "../lib/chain";
import { computeRiskScore } from "../scoring/score";
import { issueQuote, decodePaymentHeader } from "./x402";
import { verifyPayment, PaymentVerificationError, type VerifiedPayment } from "./payment";
import {
  decodeExactPaymentHeader,
  defaultVerifyContext,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  verifyExactPayment,
  settleExactPayment,
  recoverExactSettlement,
  ExactPaymentFormatError,
  ExactPaymentRejectedError,
  SettlementUnconfirmedError,
  SettlementGasCapError,
  JURISDICTION_ATTESTATION_HEADER,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  type RecoveryDeps,
  type SettleDeps,
  type VerifyContext,
} from "./exact";
import { recordRequestServed, recordPublicResult, getMetrics, getRecentActivity } from "../lib/db";
import { attestFulfillment, FulfillmentStatus } from "../attestation/middleware";
import { submitDispute, DisputeError, DisputeReasonCode } from "../attestation/dispute";
import { easExplorerAttestationUrl, type NetworkName } from "../lib/env";
import { DEV_WALLET_ADDRESS } from "../constants/devWallet";
import { checkTier1 } from "../lib/geoBlock";

// No anchor fragment: the heading's generated id differs by language
// (rehype-slug slugifies the actual rendered heading text, "Restricted
// Jurisdictions" vs "Jurisdicciones Restringidas"), and this string is
// a fixed API error message with no way to know which language a given
// caller's browser (if any) is currently showing. Landing on the page
// itself is enough; the section is short and in the table of contents.
const RESTRICTED_JURISDICTIONS_URL = "https://www.vouch402.xyz/legal";

/**
 * Returned alongside every successful risk-score response, matching the
 * site's `disclaimers` messages (web/messages/*.json) in substance. Kept
 * outside `responsePayload` on purpose: the attested `responseHash` is
 * keccak256 of `{ address, score, signals }` only, so adding this field
 * doesn't change what an existing verifier recomputes.
 */
export const RISK_SCORE_DISCLAIMER =
  "Informational only. Vouch402 does not approve, reject or recommend any transaction. The caller decides. " +
  "On-chain activity data, not a credit report or credit history. " +
  "Facts about on-chain holdings and interactions, not investment advice or a recommendation to buy, sell or hold.";

/**
 * Technical layer of the Tier 1 restriction (see `src/lib/geoBlock.ts`
 * and web/content/legal-*.md, "Restricted Jurisdictions"). Scoped to
 * the routes that actually deliver the paid service or its dispute
 * mechanism — not `/v1/metrics`/`/v1/activity`, which are public,
 * unpaid, aggregate information with nothing delivered to a specific
 * requester. `req.ip` relies on `trust proxy` below to read
 * the real client address from Fly's forwarded headers rather than
 * Fly's own edge IP.
 */
function tier1GeoBlock(req: Request, res: Response, next: NextFunction) {
  const match = req.ip ? checkTier1(req.ip) : null;
  if (match) {
    res.status(403).json({
      error: `Vouch402 cannot serve requests from ${match.countryName} (Tier 1 restricted jurisdiction, no exception). See ${RESTRICTED_JURISDICTIONS_URL} for the legal basis.`,
    });
    return;
  }
  next();
}

/**
 * Shared by both payment schemes, once a payment is confirmed on-chain
 * and marked processed. Every remaining failure path still owes the
 * payer an honest, on-chain record of what happened
 * (docs/TECHNICAL_SPEC.md: "including of our own failures"), since
 * there's no way to "un-charge" them at this point. That record is what
 * the dispute flow exists to be checked against.
 */
async function fulfillPaidRequest(
  res: Response,
  network: NetworkName,
  address: string,
  verified: VerifiedPayment,
  makePublic: boolean
): Promise<void> {
  try {
    const { score, signals } = await computeRiskScore(network, address);
    const responsePayload = { address, score, signals };

    const { uid: attestationUid } = await attestFulfillment({
      network,
      payer: verified.payer,
      payee: verified.payTo,
      x402PaymentRef: verified.txHash,
      resourceId: verified.resourceId,
      status: FulfillmentStatus.Fulfilled,
      responsePayload,
    });

    recordRequestServed({
      resourceId: verified.resourceId,
      address: address.toLowerCase(),
      payer: verified.payer,
      txHash: verified.txHash,
      score,
      network,
    });

    // Public by default only for the team's own dev wallet; every
    // other payer stays attestation-only unless they explicitly set
    // makePublic on their X-PAYMENT payload. See DECISION_LOG.md.
    const isDevWallet = verified.payer.toLowerCase() === DEV_WALLET_ADDRESS.toLowerCase();
    if (isDevWallet || makePublic) {
      recordPublicResult({
        attestationUid,
        address: address.toLowerCase(),
        score,
        signals,
        network,
      });
    }

    res.status(200).json({ ...responsePayload, attestationUid, disclaimer: RISK_SCORE_DISCLAIMER });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Fulfillment failed after payment was verified:", err);
    try {
      await attestFulfillment({
        network,
        payer: verified.payer,
        payee: verified.payTo,
        x402PaymentRef: verified.txHash,
        resourceId: verified.resourceId,
        status: FulfillmentStatus.Error,
        responsePayload: { error: "Internal error" },
      });
    } catch (attestErr) {
      // eslint-disable-next-line no-console
      console.error("Additionally failed to record the error attestation:", attestErr);
    }
    res.status(500).json({ error: "Internal error" });
  }
}

function isNetworkName(v: unknown): v is NetworkName {
  return v === "base" || v === "base-sepolia";
}

/**
 * Test seams for the `exact` route: route-level tests inject fake chain
 * access here instead of an RPC. Omitted in production, where every
 * one falls back to its real default.
 */
export interface AppOptions {
  exact?: {
    verifyContext?: (network: NetworkName) => VerifyContext;
    settleDeps?: (network: NetworkName) => SettleDeps;
    recoveryDeps?: (network: NetworkName) => RecoveryDeps;
  };
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  // Fly (and most PaaS) terminate TLS at the edge and forward plain HTTP
  // internally: without this, req.protocol always reads "http", so the
  // `resource` field in the 402 body would claim an insecure URL even
  // when the actual request came in over HTTPS. Confirmed live on the
  // Fly deployment before this was added, not a hypothetical.
  app.set("trust proxy", true);
  // x402 is an open, agent-to-agent protocol over plain HTTP: every route
  // here is meant to be called by arbitrary clients (including a browser),
  // and none of them rely on cookies/session auth (payment proof and
  // dispute signatures are the actual authority, not ambient credentials),
  // so a wildcard origin carries no CSRF-style risk. Added specifically
  // because the Phase 7 frontend calls this API directly from the browser
  // (no proxy layer of its own): verified live before this fix that the
  // API sent no Access-Control-Allow-Origin header at all, which would
  // have silently blocked every one of those calls.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    // PAYMENT-SIGNATURE / X-Jurisdiction-Attestation: the standard x402
    // v2 `exact` retry. Access-Control-Expose-Headers is listed too
    // because @x402/fetch sets it as a *request* header on its retry
    // (seen in its source), which a browser preflight would otherwise
    // reject. Expose-Headers lets browser clients read the v2 headers.
    res.setHeader(
      "Access-Control-Allow-Headers",
      `Content-Type, X-PAYMENT, ${PAYMENT_SIGNATURE_HEADER}, ${JURISDICTION_ATTESTATION_HEADER}, Access-Control-Expose-Headers`
    );
    res.setHeader("Access-Control-Expose-Headers", `${PAYMENT_REQUIRED_HEADER}, ${PAYMENT_RESPONSE_HEADER}`);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json());

  // Tier 1 technical layer: applied to the endpoints that actually
  // deliver the paid service or its dispute mechanism, both the unpaid
  // quote and the paid retry (blocking only at final payment would let
  // a blocked requester get all the way through the flow before being
  // turned away, which is worse UX for them and no more compliant).
  app.use("/v1/risk-score", tier1GeoBlock);
  app.use("/v1/disputes", tier1GeoBlock);

  app.get("/", (_req, res) => {
    res.status(200).json({
      name: "Vouch402",
      description: "x402-metered on-chain risk intelligence for autonomous agents on Base, with a proof-of-fulfillment attestation layer (x402-SAP).",
      endpoints: {
        "GET /v1/risk-score/:address": "x402-gated risk score",
        "GET /v1/metrics": "public aggregate metrics",
        "POST /v1/disputes": "file a dispute against a fulfillment attestation",
      },
    });
  });

  app.get("/v1/risk-score/:address", async (req, res) => {
    const { address } = req.params;
    if (!isAddress(address)) {
      res.status(400).json({ error: "Invalid address" });
      return;
    }

    const network = defaultNetwork();
    const resourcePath = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    const paymentHeader = req.header("X-PAYMENT");
    const exactHeader = req.header(PAYMENT_SIGNATURE_HEADER);
    if (paymentHeader && exactHeader) {
      res.status(400).json({ error: `Send either X-PAYMENT (exact-direct) or ${PAYMENT_SIGNATURE_HEADER} (exact), not both` });
      return;
    }
    if (!paymentHeader && !exactHeader) {
      // Two schemes on one 402, each where its own clients look: the
      // v1-shaped JSON body is the unchanged exact-direct quote
      // (accepts[0], read by vouch402-sdk/CLI/MCP server/website), and the
      // PAYMENT-REQUIRED header carries the standard x402 v2 `exact`
      // requirement, which @x402/fetch reads in preference to the body.
      const requirements = issueQuote(network, address, resourcePath);
      res.setHeader(PAYMENT_REQUIRED_HEADER, encodePaymentRequiredHeader(network, resourcePath));
      res.setHeader("Cache-Control", "no-store");
      res.status(402).json(requirements);
      return;
    }

    if (exactHeader) {
      let verified: VerifiedPayment;
      let payment;
      try {
        payment = decodeExactPaymentHeader(exactHeader);
      } catch (err) {
        res.status(400).json({ error: err instanceof ExactPaymentFormatError ? err.message : "Malformed PAYMENT-SIGNATURE header" });
        return;
      }

      // Same contractual Tier 1 gate as exact-direct, same strictness:
      // standard x402 clients have no custom payload field, so it rides
      // as a request header instead, and only the literal "true" counts.
      if (req.header(JURISDICTION_ATTESTATION_HEADER) !== "true") {
        res.status(403).json({
          error: `Missing required jurisdiction attestation. Send the request header "${JURISDICTION_ATTESTATION_HEADER}: true" to confirm you are not located in, and are not paying on behalf of, a Tier 1 restricted jurisdiction. See ${RESTRICTED_JURISDICTIONS_URL} for the legal basis.`,
        });
        return;
      }

      // The server settles the payer's signed payment to our own
      // treasury, and only serves once that settlement is confirmed
      // on-chain: every check in verifyExactPayment runs before anything
      // is submitted, and settleExactPayment returns only after the
      // receipt shows the exact USDC Transfer to the treasury.
      // A retry after a receipt timeout (504) is served from our own
      // stored settlement, at most once, instead of being settled again.
      try {
        const recovered = await recoverExactSettlement(network, payment, address, options.exact?.recoveryDeps?.(network));
        if (recovered) {
          verified = { ...recovered, address };
        } else {
          const ctx = options.exact?.verifyContext?.(network) ?? defaultVerifyContext(network);
          const authorization = await verifyExactPayment(network, payment, ctx);
          const settled = await settleExactPayment(authorization, address, options.exact?.settleDeps?.(network));
          verified = { ...settled, address };
        }
      } catch (err) {
        if (err instanceof ExactPaymentRejectedError) {
          res.setHeader(PAYMENT_REQUIRED_HEADER, encodePaymentRequiredHeader(network, resourcePath, err.message));
          res.status(402).json({ error: err.message });
          return;
        }
        if (err instanceof SettlementUnconfirmedError) {
          // eslint-disable-next-line no-console
          console.error(err.message);
          res.status(504).json({ error: err.message, transaction: err.txHash });
          return;
        }
        if (err instanceof SettlementGasCapError) {
          // Nothing was submitted; the payer's authorization is untouched.
          res.setHeader("Retry-After", "60");
          res.status(503).json({ error: err.message });
          return;
        }
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Internal error" });
        return;
      }
      res.setHeader(PAYMENT_RESPONSE_HEADER, encodePaymentResponseHeader(network, verified.txHash, verified.payer));
      // Standard clients have no makePublic field: attestation-only, the
      // same privacy default as an exact-direct payer who doesn't opt in.
      await fulfillPaidRequest(res, network, address, verified, false);
      return;
    }

    // Decoding is a client-input concern (malformed header -> 400), kept
    // separate from payment verification (a domain failure -> 402):
    // previously both landed in one catch block, so a garbage X-PAYMENT
    // header surfaced as a bare 500 "Internal error" instead of a clean
    // 400. The request itself was never broken; the caller's input was.
    let proof;
    try {
      proof = decodePaymentHeader(paymentHeader!);
    } catch {
      res.status(400).json({ error: "Malformed X-PAYMENT header: expected base64 JSON { resourceId, txHash, payer }" });
      return;
    }

    // Contractual layer of the Tier 1 restriction, checked before the
    // on-chain payment verification RPC call (fail fast): this is the
    // only enforcement point that exists for programmatic callers at
    // all, since most callers here are autonomous agents, not a human
    // clicking a "Try It" checkbox. The IP geo-block above is real but
    // structurally weaker for an agent than for a browser: an agent can
    // run from a cloud VPS anywhere regardless of who actually operates
    // it, so this self-certification exists specifically because the
    // technical layer alone can't be airtight here. Stated plainly, not
    // implied otherwise, in web/content/legal-*.md and DECISION_LOG.md.
    if (proof.jurisdictionAttestation !== true) {
      res.status(403).json({
        error: `Missing required jurisdiction attestation. Set jurisdictionAttestation: true on the X-PAYMENT payload to confirm you are not located in, and are not paying on behalf of, a Tier 1 restricted jurisdiction. See ${RESTRICTED_JURISDICTIONS_URL} for the legal basis.`,
      });
      return;
    }

    let verified;
    try {
      verified = await verifyPayment(network, proof);

      if (verified.address.toLowerCase() !== address.toLowerCase()) {
        res.status(400).json({ error: "Payment resourceId does not match the requested address" });
        return;
      }
    } catch (err) {
      if (err instanceof PaymentVerificationError) {
        res.status(402).json({ error: err.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: "Internal error" });
      return;
    }

    await fulfillPaidRequest(res, network, address, verified, proof.makePublic === true);
  });

  app.get("/v1/metrics", (req, res) => {
    // ?network=base|base-sepolia filters to that network; omitted keeps
    // the original all-networks behavior (see getMetrics() doc comment).
    const { network: networkParam } = req.query;
    if (networkParam !== undefined && !isNetworkName(networkParam)) {
      res.status(400).json({ error: "network must be 'base' or 'base-sepolia'" });
      return;
    }
    const m = getMetrics(networkParam);
    res.status(200).json({
      uniquePayers: m.uniquePayers,
      totalRequestsServed: m.totalRequestsServed,
      totalVolumeUsdc: formatUnits(BigInt(m.totalVolumeAtomic), 6),
      attestationCount: m.attestationCount,
      disputeCount: m.disputeCount,
    });
  });

  app.get("/v1/activity", (req, res) => {
    const { network: networkParam, limit: limitParam } = req.query;
    if (networkParam !== undefined && !isNetworkName(networkParam)) {
      res.status(400).json({ error: "network must be 'base' or 'base-sepolia'" });
      return;
    }
    const limit = Math.min(100, Math.max(1, Number(limitParam) || 20));

    const items = getRecentActivity(networkParam, limit);
    res.status(200).json({
      items: items.map((item) => ({
        ...item,
        explorerUrl: easExplorerAttestationUrl(item.network as NetworkName, item.uid),
      })),
    });
  });

  app.post("/v1/disputes", async (req, res) => {
    const { refUID, reasonCode, details, signature } = req.body ?? {};
    if (
      typeof refUID !== "string" ||
      typeof reasonCode !== "number" ||
      typeof details !== "string" ||
      typeof signature !== "string"
    ) {
      res.status(400).json({ error: "Expected { refUID, reasonCode, details, signature }" });
      return;
    }
    if (!(reasonCode in DisputeReasonCode)) {
      res.status(400).json({ error: `Invalid reasonCode: ${reasonCode}` });
      return;
    }

    try {
      const { uid, disputant } = await submitDispute({
        network: defaultNetwork(),
        refUID,
        reasonCode,
        details,
        signature: signature as `0x${string}`,
      });
      res.status(200).json({ disputeUid: uid, disputant });
    } catch (err) {
      if (err instanceof DisputeError) {
        res.status(400).json({ error: err.message });
        return;
      }
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return app;
}
