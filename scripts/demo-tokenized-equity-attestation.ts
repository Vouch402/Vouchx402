/**
 * Prototype walkthrough for the TokenizedEquityInteraction attestation
 * (src/attestation/tokenized-equity.ts): register the schema (idempotent,
 * usually a no-op after the first run), then attest that a real,
 * independently-verified Base-mainnet address really does hold one of
 * Coinbase's tokenized-equity tokens.
 *
 * Deliberately attests on whatever `env.network` is configured to
 * (normally base-sepolia in this project's own .env) even though the
 * *fact* being recorded — the subject holding NVDAc — was independently
 * confirmed live against Base *mainnet* (see DECISION_LOG.md, the
 * 2026-08-29 tokenizedEquityExposure entry). The attestation
 * infrastructure being on testnet doesn't make the underlying fact any
 * less real; it's exactly what "prototype, not production-complete" is
 * meant to allow. `sourceTxHash` is left as ZERO_BYTES32 since this
 * came from a balance check, not one specific transfer.
 */
import { ZERO_BYTES32 } from "@ethereum-attestation-service/eas-sdk";
import { env, easExplorerAttestationUrl, explorerBaseFor } from "../src/lib/env";
import { registerTokenizedEquitySchema, attestTokenizedEquityInteraction } from "../src/attestation/tokenized-equity";
import tokenizedEquities from "../src/scoring/tokenized-equities.json";

// Real Base-mainnet address, independently confirmed (not guessed) to
// hold NVDAc via Blockscout's own token-holders endpoint, then
// re-verified with a direct balanceOf call — see DECISION_LOG.md.
const SUBJECT = "0xb5ef91ce939F2C390cff462bb231E74bb228deB4";
const TICKER = "NVDAc";

async function main() {
  const network = env.network;
  console.log(`TokenizedEquityInteraction attestation prototype, network=${network}`);

  console.log("\n[1] Registering schema (idempotent)");
  const schemaUid = await registerTokenizedEquitySchema(network);
  console.log(`    schemaUid=${schemaUid}`);

  const token = tokenizedEquities.tokens.find((t) => t.ticker === TICKER);
  if (!token) throw new Error(`${TICKER} not found in tokenized-equities.json`);

  console.log(`\n[2] Attesting: ${SUBJECT} holds ${TICKER} (${token.address})`);
  const { uid } = await attestTokenizedEquityInteraction({
    network,
    subject: SUBJECT,
    tokenContract: token.address,
    ticker: TICKER,
    sourceTxHash: ZERO_BYTES32,
  });
  console.log(`    attestationUid=${uid}`);
  console.log(`    resolve independently: ${easExplorerAttestationUrl(network, uid)}`);
  console.log(`    subject on Base mainnet: ${explorerBaseFor("base")}/address/${SUBJECT}`);

  console.log("\nDone. Anyone can resolve this attestation via the URL above, without trusting Vouch402's word for it.");
}

main().catch((err) => {
  console.error("\nDemo failed:", err);
  process.exit(1);
});
