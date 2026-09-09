"use client";

import { useCallback, useState } from "react";
import { pay, getPaymentStatus } from "@base-org/account";
import {
  fetchRiskScoreQuote,
  fetchRiskScoreWithProof,
  formatUsdcAtomic,
  resolveUserOpTransactionHash,
  toApiNetwork,
  type RiskScoreResult,
} from "@/lib/vouch402";

export type DemoPhase =
  | { status: "idle" }
  | { status: "quoting" }
  | { status: "awaiting-payment"; amount: string; payTo: string }
  | { status: "confirming"; txHash: string }
  | { status: "fulfilling"; txHash: string }
  | { status: "done"; result: RiskScoreResult; txHash: string }
  | { status: "error"; message: string };

const PAYMENT_POLL_INTERVAL_MS = 1500;
const PAYMENT_POLL_MAX_ATTEMPTS = 20; // ~30s ceiling before surfacing an error

/**
 * Orchestrates one real, live x402 round trip end to end:
 *   1. GET /v1/risk-score/:address (no proof) -> real 402 quote
 *   2. @base-org/account's pay() -> a real on-chain USDC transfer via the
 *      user's Base Account, to the exact quoted payTo/amount. `pay()`
 *      returns `id`, which for a passkey-based Coinbase Smart Wallet
 *      (an ERC-4337 account) is the *userOp hash*, not a real,
 *      independently-resolvable transaction hash -- a real-payment test
 *      found this live, correcting an earlier read of the package's own
 *      source that concluded otherwise from variable naming alone
 *      without an actual end-to-end run against a real smart wallet; see
 *      DECISION_LOG.md, 2026-09-09.
 *   3. getPaymentStatus() polled until the transfer is confirmed, which
 *      is also the only place the payer's address is available (`sender`)
 *   4. resolveUserOpTransactionHash() recovers the real settlement
 *      transaction hash from the same bundler getPaymentStatus() already
 *      talks to internally (it just never surfaces that field) -- see
 *      that function's own comment in lib/vouch402.ts.
 *   5. GET /v1/risk-score/:address again, this time with the real
 *      { resourceId, txHash, payer, makePublic, jurisdictionAttestation }
 *      proof, using the *resolved* transaction hash, not `payment.id`:
 *      Vouch402's own backend independently re-verifies this against the
 *      actual chain before releasing anything; nothing here is taken on
 *      faith, and it only ever accepts a real transaction hash by design
 *      (src/server/payment.ts). `makePublic` just carries through
 *      whatever the caller passed in; it opts this one result into the
 *      public activity feed, same opt-in the SDK/CLI/MCP server expose
 *      (see DECISION_LOG.md). `jurisdictionAttestation` must already be
 *      `true` by the time this runs: try-it.tsx gates the Pay button on
 *      the checkbox itself, this hook doesn't re-decide it, only carries
 *      it through (see web/content/legal-*.md, "Restricted
 *      Jurisdictions").
 */
export function useRiskScoreDemo() {
  const [phase, setPhase] = useState<DemoPhase>({ status: "idle" });

  const run = useCallback(
    async (address: string, uiNetwork: "testnet" | "mainnet", makePublic: boolean, jurisdictionAttestation: boolean) => {
      const testnet = uiNetwork === "testnet";
      try {
        setPhase({ status: "quoting" });
        const requirement = await fetchRiskScoreQuote(toApiNetwork(uiNetwork), address);
        const amount = formatUsdcAtomic(requirement.maxAmountRequired);

        setPhase({ status: "awaiting-payment", amount, payTo: requirement.payTo });
        const payment = await pay({ amount, to: requirement.payTo, testnet });

        setPhase({ status: "confirming", txHash: payment.id });
        let paymentStatus = await getPaymentStatus({ id: payment.id, testnet });
        let attempts = 0;
        while (paymentStatus.status === "pending" && attempts < PAYMENT_POLL_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, PAYMENT_POLL_INTERVAL_MS));
          paymentStatus = await getPaymentStatus({ id: payment.id, testnet });
          attempts++;
        }
        if (paymentStatus.status !== "completed" || !paymentStatus.sender) {
          throw new Error(
            paymentStatus.reason ?? `Payment ${paymentStatus.status === "pending" ? "did not confirm in time" : paymentStatus.status}`
          );
        }

        // payment.id is a userOp hash, not the real on-chain transaction
        // hash (see the doc comment above and resolveUserOpTransactionHash
        // in lib/vouch402.ts) -- resolve the real one before Vouch402's
        // own API ever sees it, since it only accepts a real tx hash.
        const realTxHash = await resolveUserOpTransactionHash(payment.id, toApiNetwork(uiNetwork));

        setPhase({ status: "fulfilling", txHash: realTxHash });
        const result = await fetchRiskScoreWithProof(address, {
          resourceId: requirement.extra.resourceId,
          txHash: realTxHash,
          payer: paymentStatus.sender,
          makePublic,
          jurisdictionAttestation,
        });

        setPhase({ status: "done", result, txHash: realTxHash });
      } catch (err) {
        setPhase({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    []
  );

  const reset = useCallback(() => setPhase({ status: "idle" }), []);

  return { phase, run, reset };
}
