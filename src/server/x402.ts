import crypto from "node:crypto";
import { parseUnits } from "viem";
import { env, usdcAddressFor, payToFor, type NetworkName } from "../lib/env";
import { insertQuote } from "../lib/db";

/** How long an issued 402 quote stays payable before it expires. */
export const QUOTE_TTL_SECONDS = 300;

export interface X402Requirement {
  scheme: string;
  network: NetworkName;
  maxAmountRequired: string; // atomic units, string per x402 convention (avoids JSON number precision issues)
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; resourceId: string };
}

export interface X402PaymentRequiredBody {
  x402Version: 1;
  accepts: X402Requirement[];
}

/**
 * Issues a fresh payment quote for a resource request and persists it so
 * the retried request can be matched back to exactly this quote (price,
 * payTo, resourceId) rather than trusting whatever the client claims.
 *
 * This is the `exact-direct` quote: the agent sends a plain USDC
 * transfer itself, then retries with the tx hash as proof. It stays the
 * JSON body (and `accepts[0]`) unchanged for vouch402-sdk, the CLI, the
 * MCP server and the website. The standard x402 v2 `exact` scheme (a
 * signed EIP-3009 authorization that the server settles to our own
 * treasury) is offered alongside it in the PAYMENT-REQUIRED header; see
 * ./exact.ts and DECISION_LOG.md.
 */
export function issueQuote(network: NetworkName, address: string, resourcePath: string): X402PaymentRequiredBody {
  const payTo = payToFor(network);
  if (!payTo) {
    throw new Error("No payTo address configured for this network");
  }

  const resourceId = ("0x" + crypto.randomBytes(32).toString("hex")) as `0x${string}`;
  const amountAtomic = parseUnits(env.priceUsdc, 6).toString();
  const asset = usdcAddressFor(network);
  const now = Date.now();

  insertQuote({
    resourceId,
    address: address.toLowerCase(),
    network,
    payTo: payTo.toLowerCase(),
    amountAtomic,
    asset: asset.toLowerCase(),
    createdAt: now,
    expiresAt: now + QUOTE_TTL_SECONDS * 1000,
  });

  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact-direct",
        network,
        maxAmountRequired: amountAtomic,
        resource: resourcePath,
        description: `Vouch402 on-chain risk score for ${address}`,
        mimeType: "application/json",
        payTo,
        maxTimeoutSeconds: QUOTE_TTL_SECONDS,
        asset,
        extra: { name: "USDC", resourceId },
      },
    ],
  };
}

/**
 * The exact message a payer must EIP-191-sign (or EIP-1271/ERC-6492
 * equivalent for a smart-contract wallet) to prove they, not merely
 * someone who observed their public on-chain transfer, are presenting
 * this payment proof. Binds `network` (so a signature for a Base Sepolia
 * resourceId/txHash can't be replayed on mainnet, or vice versa -- both
 * networks can mint the same bytes32 resourceId/txHash space), `resourceId`
 * (which quote this redeems), and `txHash` (which settlement it points
 * to): without this, any observer of a public USDC transfer to the
 * shared `payTo` address could mint their own resourceId and redeem
 * someone else's payment against it -- see `verifyPayment`'s doc comment
 * in `payment.ts` and DECISION_LOG.md for the real exploit this closes.
 */
export function paymentProofMessage(network: NetworkName, resourceId: string, txHash: string): string {
  return `Vouch402 payment proof\nnetwork: ${network}\nresourceId: ${resourceId}\ntxHash: ${txHash}`;
}

export interface PaymentProof {
  resourceId: string;
  txHash: string;
  payer: string;
  /**
   * EIP-191 personal-sign signature (or an EIP-1271/ERC-6492 equivalent
   * for a smart-contract wallet) over `paymentProofMessage(network,
   * resourceId, txHash)`, produced by the `payer` address. Proves the
   * caller actually controls `payer` rather than just having observed
   * its address in a public Transfer log.
   */
  signature: string;
  /**
   * Opt-in only: makes this specific result (address, score, signals)
   * visible on the public activity feed. Defaults to private (see
   * DECISION_LOG.md "dev wallet / opt-in public results") regardless of
   * what the client sends unless this is the literal boolean `true`, so
   * a truthy-but-wrong value (a string, a typo) can never accidentally
   * publish someone's result.
   */
  makePublic?: boolean;
  /**
   * Required self-certification: the caller confirms it is not located
   * in, and is not paying on behalf of, a Tier 1 restricted jurisdiction
   * (see `src/lib/geoBlock.ts` and web/content/legal-*.md, "Restricted
   * Jurisdictions"). The IP-based geo-block is the technical layer; this
   * is the contractual layer, and the only one that exists at all for
   * programmatic callers of this endpoint — most callers are autonomous
   * agents, not a human clicking a checkbox in a browser, so this field
   * *is* the checkbox for that flow. Same strict-boolean pattern as
   * `makePublic`: only the literal `true` counts, missing or falsy is
   * treated as "not attested" and rejected, never defaulted to passing.
   */
  jurisdictionAttestation?: boolean;
}

/** Decodes the `X-PAYMENT` header: base64 JSON, per x402 convention. */
export function decodePaymentHeader(headerValue: string): PaymentProof {
  const json = Buffer.from(headerValue, "base64").toString("utf8");
  const parsed = JSON.parse(json);
  if (!parsed.resourceId || !parsed.txHash || !parsed.payer || !parsed.signature) {
    throw new Error("Malformed X-PAYMENT header: expected { resourceId, txHash, payer, signature }");
  }
  return {
    ...parsed,
    makePublic: parsed.makePublic === true,
    jurisdictionAttestation: parsed.jurisdictionAttestation === true,
  };
}
