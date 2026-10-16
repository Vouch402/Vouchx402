import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createWalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { createApp, RISK_SCORE_DISCLAIMER } from "../src/server/app";
import { loadDeployerAccount } from "../src/lib/keystore";
import { erc20Abi, publicClientFor, httpTransport } from "../src/lib/chain";
import { env, explorerBaseFor } from "../src/lib/env";
import { paymentProofMessage, type X402PaymentRequiredBody } from "../src/server/x402";

/**
 * Full x402 flow against Base Sepolia, per docs/TECHNICAL_SPEC.md "Testing":
 * unpaid request -> 402 -> real testnet USDC payment -> retried request ->
 * 200 with score + attestation UID field (attestation itself lands in
 * Phase 2). No mocked payment verification: this sends a real Base Sepolia
 * transaction and verifies the server accepts it server-side.
 *
 * Requires the deployer wallet (DEPLOYER_KEYSTORE_ACCOUNT) to hold Base
 * Sepolia ETH (gas) and USDC (>= PRICE_USDC). See README "Funding the
 * testnet wallet".
 */
describe("GET /v1/risk-score/:address (Base Sepolia)", () => {
  let server: Server;
  let baseUrl: string;
  let lastProof:
    | { resourceId: string; txHash: string; payer: string; signature: string; jurisdictionAttestation: boolean }
    | undefined;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 402 with x402 payment requirements when unpaid", async () => {
    const targetAddress = env.payTo; // scoring an arbitrary address; reuse deployer addr for convenience
    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`);
    expect(res.status).toBe(402);

    const body = (await res.json()) as X402PaymentRequiredBody;
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0].network).toBe("base-sepolia");
    expect(body.accepts[0].payTo.toLowerCase()).toBe(env.payTo.toLowerCase());
  });

  it("pays with real testnet USDC and returns 200 with a real score", async () => {
    const { account } = loadDeployerAccount();
    const targetAddress = env.payTo;

    // 1. Unpaid request -> 402 quote.
    const quoteRes = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`);
    expect(quoteRes.status).toBe(402);
    const quote = (await quoteRes.json()) as X402PaymentRequiredBody;
    const requirement = quote.accepts[0];

    // 2. Agent pays: a real USDC transfer on Base Sepolia to payTo.
    //    v0 note (see DECISION_LOG.md): direct on-chain settlement, not
    //    the EIP-3009 facilitator-relay scheme. Payer == payTo here only
    //    because this test uses a single funded wallet to prove the
    //    mechanism; production usage involves two distinct parties.
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: httpTransport(env.baseSepoliaRpcUrl),
    });

    const txHash = await walletClient.writeContract({
      address: requirement.asset as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [requirement.payTo as `0x${string}`, BigInt(requirement.maxAmountRequired)],
    });

    console.log(`[Phase 1] Base Sepolia payment tx: ${explorerBaseFor("base-sepolia")}/tx/${txHash}`);

    // writeContract returns as soon as the tx is submitted, not once it's
    // mined; wait for a real confirmation before presenting proof, same
    // as a real agent would.
    const receipt = await publicClientFor("base-sepolia").waitForTransactionReceipt({ hash: txHash });
    expect(receipt.status).toBe("success");

    // 3. Retry with proof, signed over (resourceId, txHash) to prove the
    // retrying party actually controls `payer` (see payment.ts step 2).
    const signature = await account.signMessage({
      message: paymentProofMessage(requirement.network, requirement.extra.resourceId, txHash),
    });
    const proof = {
      resourceId: requirement.extra.resourceId,
      txHash,
      payer: account.address,
      signature,
      jurisdictionAttestation: true,
    };
    lastProof = proof;
    const xPayment = Buffer.from(JSON.stringify(proof)).toString("base64");

    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });

    const body = await res.json();
    if (res.status !== 200) {
      console.error("[Phase 1] Unexpected response:", res.status, body);
    }
    expect(res.status).toBe(200);
    expect(body.address.toLowerCase()).toBe(targetAddress.toLowerCase());
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.signals).toBeDefined();
    expect(body.disclaimer).toBe(RISK_SCORE_DISCLAIMER);

    console.log(`[Phase 1] Gate met: 200 response for a real settled payment. tx=${txHash} score=${body.score}`);
  }, 60_000);

  it("rejects a paid retry missing the required jurisdiction attestation", async () => {
    // No real payment needed: the attestation check runs before payment
    // verification (fail fast), so a garbage resourceId/txHash/payer is
    // enough to prove the gate itself, distinct from "payment invalid".
    const targetAddress = env.payTo;
    const fakeProof = { resourceId: "0xfake", txHash: "0xfake", payer: "0xfake", signature: "0xfake" };
    const xPayment = Buffer.from(JSON.stringify(fakeProof)).toString("base64");

    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/jurisdiction attestation/i);
  });

  it("still rejects with jurisdictionAttestation explicitly false, not silently treated as true", async () => {
    const targetAddress = env.payTo;
    const fakeProof = {
      resourceId: "0xfake",
      txHash: "0xfake",
      payer: "0xfake",
      signature: "0xfake",
      jurisdictionAttestation: false,
    };
    const xPayment = Buffer.from(JSON.stringify(fakeProof)).toString("base64");

    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });
    expect(res.status).toBe(403);
  });

  it("passes the attestation gate with jurisdictionAttestation:true, fails later for an unrelated real reason", async () => {
    // Proves the gate doesn't over-block a properly-attested request: a
    // fake resourceId still fails, but with payment.ts's own "unknown
    // resourceId" 402, not the attestation 403 — confirming attested
    // requests actually reach payment verification.
    const targetAddress = env.payTo;
    const fakeProof = {
      resourceId: "0xfake",
      txHash: "0xfake",
      payer: "0xfake",
      signature: "0xfake",
      jurisdictionAttestation: true,
    };
    const xPayment = Buffer.from(JSON.stringify(fakeProof)).toString("base64");

    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });
    const body = await res.json();
    expect(res.status).toBe(402);
    expect(body.error).toMatch(/unknown or expired resourceid/i);
  });

  it("rejects replaying the same payment proof", async () => {
    if (!lastProof) throw new Error("Previous test did not produce a settled payment to replay");
    const targetAddress = env.payTo;
    const xPayment = Buffer.from(JSON.stringify(lastProof)).toString("base64");

    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });

    // Quote already consumed and/or tx hash already processed; either
    // way, replay must be rejected, never a second 200.
    expect(res.status).toBe(402);
  });

  /**
   * Reproduces a real theft-of-service bug reported against this file:
   * `verifyPayment` never binds `txHash` to the specific `resourceId` the
   * caller is trying to redeem it against. It only checks that the
   * claimed `payer` matches the on-chain Transfer's `from`, and `payer`
   * is attacker-controlled (public on-chain info, not proven ownership).
   * Since every quote on a given network shares the same `payTo` and the
   * same flat price, an attacker who merely observes someone else's
   * public settlement tx can mint their own resourceId (for whatever
   * address they want scored) and redeem the victim's payment against
   * it, before the victim's own retry gets a chance to. The victim's
   * genuine retry then dies on "already processed" for a resourceId that
   * was never actually fulfilled for them.
   *
   * This must fail closed: an attacker who does not hold the victim's
   * private key must not be able to consume the victim's payment against
   * a resourceId the victim never authorized.
   */
  it("rejects redeeming another payer's settled tx against a different resourceId (theft-of-service)", async () => {
    const { account } = loadDeployerAccount();
    const victimTargetAddress = env.payTo;
    // Any other valid address works to show the attacker can redirect the
    // victim's payment toward a completely different scored address.
    const attackerTargetAddress = "0x000000000000000000000000000000000000dEaD";

    // 1. "Victim" gets their own quote and settles it with a real tx.
    const victimQuoteRes = await fetch(`${baseUrl}/v1/risk-score/${victimTargetAddress}`);
    expect(victimQuoteRes.status).toBe(402);
    const victimQuote = (await victimQuoteRes.json()) as X402PaymentRequiredBody;
    const victimRequirement = victimQuote.accepts[0];

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: httpTransport(env.baseSepoliaRpcUrl),
    });
    const victimTxHash = await walletClient.writeContract({
      address: victimRequirement.asset as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [victimRequirement.payTo as `0x${string}`, BigInt(victimRequirement.maxAmountRequired)],
    });
    await publicClientFor("base-sepolia").waitForTransactionReceipt({ hash: victimTxHash });

    // 2. "Attacker" never pays. They request their own quote for a
    // different target address, then submit the victim's publicly
    // observable txHash + payer address against their own resourceId,
    // before the victim ever redeems it.
    const attackerQuoteRes = await fetch(`${baseUrl}/v1/risk-score/${attackerTargetAddress}`);
    expect(attackerQuoteRes.status).toBe(402);
    const attackerQuote = (await attackerQuoteRes.json()) as X402PaymentRequiredBody;
    const attackerRequirement = attackerQuote.accepts[0];

    // The attacker does not hold the victim's private key, so they
    // cannot produce a signature that recovers to `account.address` over
    // this (resourceId, txHash) pair. A well-formed-but-bogus signature
    // stands in for "whatever an attacker without the key could submit".
    const attackerProof = {
      resourceId: attackerRequirement.extra.resourceId,
      txHash: victimTxHash,
      payer: account.address, // publicly visible on-chain, not proven by the attacker
      signature: `0x${"00".repeat(65)}`,
      jurisdictionAttestation: true,
    };
    const attackerXPayment = Buffer.from(JSON.stringify(attackerProof)).toString("base64");

    const attackerRes = await fetch(`${baseUrl}/v1/risk-score/${attackerTargetAddress}`, {
      headers: { "X-PAYMENT": attackerXPayment },
    });

    // The fix must reject this: the attacker has no proof they control
    // `account.address`, only that it appears as the Transfer's `from`.
    expect(attackerRes.status).not.toBe(200);

    // 3. The victim's own legitimate retry against their own resourceId,
    // properly signed, must still be redeemable -- the fix must not have
    // burned their payment on the rejected attacker attempt above.
    const victimSignature = await account.signMessage({
      message: paymentProofMessage(victimRequirement.network, victimRequirement.extra.resourceId, victimTxHash),
    });
    const victimProof = {
      resourceId: victimRequirement.extra.resourceId,
      txHash: victimTxHash,
      payer: account.address,
      signature: victimSignature,
      jurisdictionAttestation: true,
    };
    const victimXPayment = Buffer.from(JSON.stringify(victimProof)).toString("base64");

    const victimRes = await fetch(`${baseUrl}/v1/risk-score/${victimTargetAddress}`, {
      headers: { "X-PAYMENT": victimXPayment },
    });
    expect(victimRes.status).toBe(200);
  }, 60_000);

  /**
   * `network` is part of the signed message specifically so a signature
   * cannot be lifted from one network and replayed on the other -- both
   * mint resourceId/txHash out of the same bytes32 space, so without this
   * a signature produced for a Base Sepolia (resourceId, txHash) pair
   * would also verify for the numerically identical pair on Base
   * mainnet. No real on-chain payment is needed here: the signature
   * check runs before the receipt lookup, so a syntactically valid but
   * unsettled txHash is enough to exercise it.
   */
  it("rejects a signature produced for a different network", async () => {
    const { account } = loadDeployerAccount();
    const targetAddress = env.payTo;

    const quoteRes = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`);
    expect(quoteRes.status).toBe(402);
    const quote = (await quoteRes.json()) as X402PaymentRequiredBody;
    const requirement = quote.accepts[0];
    expect(requirement.network).toBe("base-sepolia");

    const fakeTxHash = `0x${"11".repeat(32)}`;
    const wrongNetworkSignature = await account.signMessage({
      message: paymentProofMessage("base", requirement.extra.resourceId, fakeTxHash),
    });
    const proof = {
      resourceId: requirement.extra.resourceId,
      txHash: fakeTxHash,
      payer: account.address,
      signature: wrongNetworkSignature,
      jurisdictionAttestation: true,
    };
    const xPayment = Buffer.from(JSON.stringify(proof)).toString("base64");

    const res = await fetch(`${baseUrl}/v1/risk-score/${targetAddress}`, {
      headers: { "X-PAYMENT": xPayment },
    });
    const body = await res.json();
    expect(res.status).toBe(402);
    expect(body.error).toMatch(/invalid payer signature/i);
  });
});
