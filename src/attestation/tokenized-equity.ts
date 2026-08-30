import fs from "node:fs";
import path from "node:path";
import { SchemaEncoder, ZERO_ADDRESS, ZERO_BYTES32 } from "@ethereum-attestation-service/eas-sdk";
import { getEas, getSchemaRegistry } from "../lib/eas";
import { env, type NetworkName } from "../lib/env";

/**
 * Prototype attestation, separate from the x402-SAP family
 * (X402ServiceFulfillment/X402ServiceDispute in ./schemas.ts): this one
 * isn't about whether Vouch402 fulfilled a paid request, it's an
 * observability primitive for Base Batches 004's "asset issuance" focus
 * area — a public, third-party-queryable record of *when an address
 * interacted with one of Coinbase's tokenized-equity tokens on Base*
 * (see ../scoring/tokenized-equities.json for the verified contract
 * list this schema's `tokenContract`/`ticker` fields reference).
 *
 * Same read-only, no-verdict, no-transaction-amount discipline as the
 * rest of this API (see DECISION_LOG.md, "Buró de Crédito" and the
 * 2026-08-29 tokenizedEquityExposure entry): this schema carries no
 * balance, no share count, no dollar amount, no counterparty beyond the
 * publicly-known token contract itself. It records a fact, not a
 * judgment, and issuing one doesn't buy, sell, or custody anything.
 *
 * `sourceTxHash` is the specific transaction this observation came from
 * when there is one; `ZERO_BYTES32` when the observation instead came
 * from a point-in-time balance check (no single transaction to cite).
 * Either way it's independently checkable: a real `sourceTxHash` can be
 * looked up on Basescan directly, and `subject`/`tokenContract` can
 * always be checked against the token's own `balanceOf`.
 *
 * Non-revocable, same reasoning as the fulfillment schema: an immutable
 * record of a past observation, not a live status that gets flipped.
 */
export const TOKENIZED_EQUITY_INTERACTION_SCHEMA =
  "address subject,address tokenContract,string ticker,bytes32 sourceTxHash,uint64 observedAt";

const ENV_PATH = path.resolve(__dirname, "..", "..", ".env");
const ENV_KEY = (network: NetworkName) =>
  network === "base" ? "EAS_SCHEMA_UID_TOKENIZED_EQUITY_MAINNET" : "EAS_SCHEMA_UID_TOKENIZED_EQUITY_SEPOLIA";

function readEnvValue(key: string): string {
  return process.env[key] ?? "";
}

function updateEnvFile(key: string, value: string) {
  let contents = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  contents = re.test(contents) ? contents.replace(re, line) : contents.trimEnd() + `\n${line}\n`;
  fs.writeFileSync(ENV_PATH, contents);
  process.env[key] = value;
}

/** Idempotent, same pattern as registerSchemas() in ./schemas.ts. */
export async function registerTokenizedEquitySchema(network: NetworkName): Promise<string> {
  const existing = readEnvValue(ENV_KEY(network));
  if (existing) {
    console.log(`[tokenized-equity] schema already registered on ${network}: ${existing}`);
    return existing;
  }

  const registry = getSchemaRegistry(network);
  console.log(`[tokenized-equity] registering schema on ${network}...`);
  const tx = await registry.register({
    schema: TOKENIZED_EQUITY_INTERACTION_SCHEMA,
    resolverAddress: ZERO_ADDRESS,
    revocable: false,
  });
  const uid = await tx.wait();
  console.log(`[tokenized-equity] registered on ${network}: ${uid}`);
  updateEnvFile(ENV_KEY(network), uid);
  return uid;
}

export interface AttestTokenizedEquityInteractionParams {
  network: NetworkName;
  /** The address the observation is about — never the caller/payer, this isn't tied to any Vouch402 payment. */
  subject: string;
  tokenContract: string;
  ticker: string;
  /** The transaction this was observed from, or ZERO_BYTES32 if it came from a balance check instead. */
  sourceTxHash?: string;
}

/**
 * Issues one TokenizedEquityInteraction attestation. Prototype only:
 * not wired into the paid /v1/risk-score request path (that would mean
 * this resource server spending its own gas on every request that
 * happens to find exposure, a real economic/architecture decision for
 * later, not something to bake in silently). Callable directly (see
 * scripts/demo-tokenized-equity-attestation.ts) or from a future
 * explicit endpoint, once that decision is made.
 */
export async function attestTokenizedEquityInteraction(
  params: AttestTokenizedEquityInteractionParams
): Promise<{ uid: string }> {
  const schemaUid = readEnvValue(ENV_KEY(params.network));
  if (!schemaUid) {
    throw new Error(
      `No TokenizedEquityInteraction schema UID configured for ${params.network}. Run registerTokenizedEquitySchema() first.`
    );
  }

  const encoder = new SchemaEncoder(TOKENIZED_EQUITY_INTERACTION_SCHEMA);
  const data = encoder.encodeData([
    { name: "subject", type: "address", value: params.subject },
    { name: "tokenContract", type: "address", value: params.tokenContract },
    { name: "ticker", type: "string", value: params.ticker },
    { name: "sourceTxHash", type: "bytes32", value: params.sourceTxHash ?? ZERO_BYTES32 },
    { name: "observedAt", type: "uint64", value: BigInt(Math.floor(Date.now() / 1000)) },
  ]);

  const eas = getEas(params.network);
  const tx = await eas.attest({
    schema: schemaUid,
    data: {
      recipient: params.subject,
      expirationTime: 0n,
      revocable: false,
      refUID: ZERO_BYTES32,
      data,
    },
  });
  const uid = await tx.wait();
  return { uid };
}

if (require.main === module) {
  const network = (process.argv[2] as NetworkName | undefined) || env.network;
  registerTokenizedEquitySchema(network)
    .then((uid) => {
      console.log(`[tokenized-equity] done. schemaUid=${uid}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
