import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createWalletClient, getAddress, type Hash } from "viem";
import { baseSepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { createApp } from "../src/server/app";
import { loadDeployerAccount } from "../src/lib/keystore";
import { erc20Abi, publicClientFor, httpTransport } from "../src/lib/chain";
import { env, explorerBaseFor, usdcAddressFor } from "../src/lib/env";
import { getEas, getAttestationWithRetry } from "../src/lib/eas";
import { registerSchemas, FULFILLMENT_SCHEMA } from "../src/attestation/schemas";
import { TREASURY_ADDRESS } from "../src/server/exact";

/**
 * End-to-end on Base Sepolia with the official x402 v2 client
 * (`@x402/fetch` + `@x402/evm`), unmodified: a standard client pays for
 * `/v1/risk-score/:address` and the server settles the payer's signed
 * payment to our own treasury, confirming it on-chain before serving.
 *
 * The payer is a throwaway in-memory key (never written anywhere) funded
 * with exactly the price by the deployer wallet as test setup, holding
 * zero ETH throughout: that's what proves the signer, not the payer,
 * paid the settlement gas, and that the USDC went payer -> treasury
 * without passing through the signer.
 */
describe("standard x402 v2 exact via @x402/fetch (Base Sepolia)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await registerSchemas("base-sepolia");
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

  it("pays with the official v2 client (+ jurisdiction header), settles to the treasury, serves 200 with a matching attestation", async () => {
    const pub = publicClientFor("base-sepolia");
    const usdc = usdcAddressFor("base-sepolia");
    const { account: deployer } = loadDeployerAccount();
    const payer = privateKeyToAccount(generatePrivateKey());
    const price = 10_000n;
    const balance = (who: `0x${string}`, blockNumber?: bigint) =>
      pub.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [who], blockNumber });

    // Test setup only: fund the throwaway payer with exactly the price.
    const wallet = createWalletClient({ account: deployer, chain: baseSepolia, transport: httpTransport(env.baseSepoliaRpcUrl) });
    const fundTx = await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: "transfer", args: [payer.address, price] });
    const fundReceipt = await pub.waitForTransactionReceipt({ hash: fundTx });
    console.log(`[exact e2e] funding tx (setup): ${explorerBaseFor("base-sepolia")}/tx/${fundTx}`);
    // The receipt alone isn't enough: the load-balanced RPC can serve the
    // server's dry-run `eth_call` from a node that hasn't seen this block
    // yet, which reverts with "transfer amount exceeds balance" (seen on
    // the first real run). Wait until the balance reads back at `latest`
    // and two more blocks have passed before paying.
    for (let i = 0; i < 30; i++) {
      const [bal, head] = await Promise.all([balance(payer.address), pub.getBlockNumber()]);
      if (bal === price && head >= fundReceipt.blockNumber + 2n) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(await pub.getBalance({ address: payer.address })).toBe(0n);

    // The official client, as any third party would use it. The only
    // Vouch402-specific line is the jurisdiction header on the request.
    const client = new x402Client();
    registerExactEvmScheme(client, { signer: payer });
    let sentPaymentSignature: string | null = null;
    const recordingFetch: typeof fetch = async (input, init) => {
      const req = new Request(input as RequestInfo, init);
      sentPaymentSignature ??= req.headers.get("PAYMENT-SIGNATURE");
      return fetch(req);
    };
    const fetchWithPayment = wrapFetchWithPayment(recordingFetch, client);

    const target = deployer.address;
    const res = await fetchWithPayment(`${baseUrl}/v1/risk-score/${target}`, {
      headers: { "X-Jurisdiction-Attestation": "true" },
    });
    const body = await res.json();
    if (res.status !== 200) console.error("[exact e2e] unexpected response:", res.status, body);
    expect(res.status).toBe(200);
    expect(sentPaymentSignature).toBeTruthy();
    expect(body.address.toLowerCase()).toBe(target.toLowerCase());
    expect(body.disclaimer).toMatch(/^Informational only\./);

    const settle = decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE")!);
    expect(settle.success).toBe(true);
    expect(settle.network).toBe("eip155:84532");
    const settleTx = settle.transaction as Hash;
    console.log(`[exact e2e] settlement tx: ${explorerBaseFor("base-sepolia")}/tx/${settleTx}`);

    // On-chain: our signer sent it (paid gas) to USDC, and the only
    // USDC movement is payer -> treasury for exactly the price.
    const [tx, receipt] = await Promise.all([pub.getTransaction({ hash: settleTx }), pub.getTransactionReceipt({ hash: settleTx })]);
    expect(receipt.status).toBe("success");
    expect(getAddress(tx.from)).toBe(getAddress(deployer.address));
    expect(getAddress(tx.to!)).toBe(getAddress(usdc));
    const before = receipt.blockNumber - 1n;
    expect(await balance(payer.address, receipt.blockNumber)).toBe(0n);
    expect((await balance(TREASURY_ADDRESS, receipt.blockNumber)) - (await balance(TREASURY_ADDRESS, before))).toBe(price);
    expect(await balance(deployer.address, receipt.blockNumber)).toBe(await balance(deployer.address, before));
    expect(await pub.getBalance({ address: payer.address })).toBe(0n);

    // Attestation: payer = authorization.from, x402PaymentRef = settlement tx.
    const eas = getEas("base-sepolia");
    const attestation = await getAttestationWithRetry(eas, body.attestationUid);
    const decoded = new SchemaEncoder(FULFILLMENT_SCHEMA).decodeData(attestation.data);
    const field = (name: string) => decoded.find((i) => i.name === name)?.value.value as string;
    expect(field("payer").toLowerCase()).toBe(payer.address.toLowerCase());
    expect(field("payee").toLowerCase()).toBe(TREASURY_ADDRESS.toLowerCase());
    expect(field("x402PaymentRef").toLowerCase()).toBe(settleTx.toLowerCase());
    console.log(`[exact e2e] attestation: https://base-sepolia.easscan.org/attestation/view/${body.attestationUid}`);

    // One authorization pays for exactly one request: replaying the same
    // signed payment is rejected, not served. Our stored settlement is
    // now `served`, so recovery rejects it first, with no RPC involved.
    const replay = await fetch(`${baseUrl}/v1/risk-score/${target}`, {
      headers: { "PAYMENT-SIGNATURE": sentPaymentSignature!, "X-Jurisdiction-Attestation": "true" },
    });
    expect(replay.status).toBe(402);
    expect((await replay.json()).error).toMatch(/already used to serve a request/);
  }, 180_000);
});
