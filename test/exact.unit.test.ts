import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  toHex,
  type Hash,
  type TransactionReceipt,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { usdcAddressFor } from "../src/lib/env";
import {
  TREASURY_ADDRESS,
  decodeExactPaymentHeader,
  verifyExactPayment,
  settleExactPayment,
  ExactPaymentFormatError,
  ExactPaymentRejectedError,
  SettlementUnconfirmedError,
  SettlementGasCapError,
  exactRequirementFor,
  recoverExactSettlement,
  type RecoveryDeps,
  type SettlementStore,
  type ExactPaymentPayloadV2,
  type SettleDeps,
  type VerifyContext,
  type VerifiedExactAuthorization,
} from "../src/server/exact";
import * as exactModule from "../src/server/exact";
import { createApp } from "../src/server/app";

/**
 * Unit tests for the standard x402 `exact` scheme's hard requirements
 * (DECISION_LOG.md, "Standard x402 `exact` scheme"). No network, no real
 * funds: payers are throwaway in-memory keys that only ever sign
 * typed data here, and the nonce lookup plus the simulate/send/receipt
 * steps are injected, so each rejection is proven without an RPC.
 */

const NET = "base-sepolia" as const;
const USDC = getAddress(usdcAddressFor(NET));
const PRICE = 10_000n; // 0.01 USDC
const NOW = 1_900_000_000;
const SIGNER = privateKeyToAccount(generatePrivateKey()).address;
const payer = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

interface MakeOpts {
  from?: PrivateKeyAccount;
  signWith?: PrivateKeyAccount;
  to?: `0x${string}`;
  value?: bigint;
  validAfter?: bigint;
  validBefore?: bigint;
  domain?: Partial<{ name: string; version: string; chainId: number; verifyingContract: `0x${string}` }>;
  accepted?: Partial<ExactPaymentPayloadV2["accepted"]>;
  network?: "base" | "base-sepolia";
}

function randomNonce(): `0x${string}` {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

async function makePayment(opts: MakeOpts = {}): Promise<ExactPaymentPayloadV2> {
  const network = opts.network ?? NET;
  const asset = getAddress(usdcAddressFor(network));
  const from = (opts.from ?? payer).address;
  const message = {
    from,
    to: opts.to ?? TREASURY_ADDRESS,
    value: opts.value ?? PRICE,
    validAfter: opts.validAfter ?? 0n,
    validBefore: opts.validBefore ?? BigInt(NOW + 300),
    nonce: randomNonce(),
  };
  const domain = {
    name: network === "base" ? "USD Coin" : "USDC",
    version: "2",
    chainId: network === "base" ? 8453 : 84532,
    verifyingContract: asset,
    ...opts.domain,
  };
  const signature = await (opts.signWith ?? opts.from ?? payer).signTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });
  return {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: network === "base" ? "eip155:8453" : "eip155:84532",
      asset,
      amount: PRICE.toString(),
      payTo: TREASURY_ADDRESS,
      ...opts.accepted,
    },
    payload: {
      signature,
      authorization: {
        from: message.from,
        to: message.to,
        value: message.value.toString(),
        validAfter: message.validAfter.toString(),
        validBefore: message.validBefore.toString(),
        nonce: message.nonce,
      },
    },
  };
}

function ctx(overrides: Partial<VerifyContext> = {}): VerifyContext {
  return {
    now: NOW,
    priceAtomic: PRICE,
    signerAddress: SIGNER,
    configuredPayTo: TREASURY_ADDRESS,
    isNonceUsed: async () => false,
    ...overrides,
  };
}

async function expectRejected(p: Promise<unknown>, message: RegExp) {
  await expect(p).rejects.toBeInstanceOf(ExactPaymentRejectedError);
  await expect(p).rejects.toThrow(message);
}

describe("exact: verifyExactPayment (hard requirement 1: settle only an exact match)", () => {
  it("accepts a correct authorization (positive control)", async () => {
    const payment = await makePayment();
    const v = await verifyExactPayment(NET, payment, ctx());
    expect(v.from).toBe(payer.address);
    expect(v.to).toBe(getAddress(TREASURY_ADDRESS));
    expect(v.value).toBe(PRICE);
  });

  it("compares `to` by checksum, not by string: an all-lowercase treasury is the same address", async () => {
    const payment = await makePayment();
    payment.payload.authorization.to = TREASURY_ADDRESS.toLowerCase();
    await expect(verifyExactPayment(NET, payment, ctx())).resolves.toBeDefined();
  });

  it("rejects `to` that is not the treasury", async () => {
    const payment = await makePayment({ to: stranger.address });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /Recipient mismatch/);
  });

  it("rejects a treasury `to` with a broken EIP-55 checksum", async () => {
    const payment = await makePayment();
    // Flip the case of one letter: same bytes, invalid checksum.
    payment.payload.authorization.to = TREASURY_ADDRESS.replace("b440b82F", "b440b82f");
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /Invalid to address/);
  });

  it("rejects a value below the quoted price", async () => {
    const payment = await makePayment({ value: PRICE - 1n });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /Amount mismatch/);
  });

  it("rejects a value above the quoted price (exactly the price, not at least)", async () => {
    const payment = await makePayment({ value: PRICE + 1n });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /Amount mismatch/);
  });

  it("rejects a token other than Base USDC in `accepted`", async () => {
    const payment = await makePayment({ accepted: { asset: stranger.address } });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /only Base USDC/);
  });

  it("rejects a signature made for a different token contract", async () => {
    const payment = await makePayment({ domain: { verifyingContract: stranger.address } });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /does not recover/);
  });

  it("rejects a network other than the configured one", async () => {
    const payment = await makePayment({ accepted: { network: "eip155:8453" } });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /Network mismatch/);
  });

  it("rejects a signature made for a different chain id", async () => {
    const payment = await makePayment({ domain: { chainId: 8453 } });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /does not recover/);
  });

  it("rejects an authorization that is not valid yet", async () => {
    const payment = await makePayment({ validAfter: BigInt(NOW + 60) });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /not yet valid/);
  });

  it("rejects an expired authorization", async () => {
    const payment = await makePayment({ validBefore: BigInt(NOW - 1) });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /expired/);
  });

  it("rejects an authorization expiring within the inclusion margin", async () => {
    const payment = await makePayment({ validBefore: BigInt(NOW + 3) });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /expired or expiring/);
  });

  it("rejects a nonce USDC already marks as used (authorizationState)", async () => {
    const payment = await makePayment();
    const isNonceUsed = vi.fn(async () => true);
    await expectRejected(verifyExactPayment(NET, payment, ctx({ isNonceUsed })), /nonce already used/);
    expect(isNonceUsed).toHaveBeenCalledWith(payer.address, payment.payload.authorization.nonce);
  });

  it("rejects a signature that does not recover to `from`", async () => {
    const payment = await makePayment({ signWith: stranger });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /does not recover/);
  });

  it("rejects a malformed signature", async () => {
    const payment = await makePayment();
    payment.payload.signature = "0x" + "00".repeat(65);
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /Invalid signature|does not recover/);
  });

  it("rejects a non-65-byte (smart-wallet style) signature instead of half-supporting it", async () => {
    const payment = await makePayment();
    payment.payload.signature = payment.payload.signature + "00".repeat(32);
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /65-byte/);
  });

  it("rejects a scheme other than exact", async () => {
    const payment = await makePayment({ accepted: { scheme: "exact-direct" } });
    await expectRejected(verifyExactPayment(NET, payment, ctx()), /Unsupported scheme/);
  });

  it("never reaches the nonce lookup when an earlier check already failed", async () => {
    const payment = await makePayment({ to: stranger.address });
    const isNonceUsed = vi.fn(async () => false);
    await expect(verifyExactPayment(NET, payment, ctx({ isNonceUsed }))).rejects.toThrow();
    expect(isNonceUsed).not.toHaveBeenCalled();
  });
});

describe("exact: decodeExactPaymentHeader", () => {
  it("rejects garbage and non-v2 payloads as a format error (400), before any verification", () => {
    expect(() => decodeExactPaymentHeader("not base64 json")).toThrow(ExactPaymentFormatError);
    const v1 = Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", payload: {} })).toString("base64");
    expect(() => decodeExactPaymentHeader(v1)).toThrow(ExactPaymentFormatError);
  });

  it("round-trips a well-formed v2 payload", async () => {
    const payment = await makePayment();
    const header = Buffer.from(JSON.stringify(payment)).toString("base64");
    expect(decodeExactPaymentHeader(header)).toEqual(payment);
  });
});

describe("exact: hard requirement 4 (the signer only pays gas, never receives)", () => {
  it("refuses to settle at all if the treasury were ever configured as the signer", async () => {
    const payment = await makePayment();
    await expect(verifyExactPayment(NET, payment, ctx({ signerAddress: TREASURY_ADDRESS }))).rejects.toThrow(
      /treasury equals the signer/
    );
  });

  it("on mainnet, refuses to settle if the configured payTo drifted from the pinned treasury", async () => {
    const payment = await makePayment({ network: "base" });
    await expect(verifyExactPayment("base", payment, ctx({ configuredPayTo: SIGNER }))).rejects.toThrow(
      /does not equal the pinned treasury/
    );
  });

  it("on mainnet, accepts when configured payTo equals the pinned treasury (positive control)", async () => {
    const payment = await makePayment({ network: "base" });
    await expect(verifyExactPayment("base", payment, ctx())).resolves.toBeDefined();
  });
});

// ---- settlement: requirement 3 (confirm on-chain before serving) and 6 ----

const transferTopic = (from: string, to: string) =>
  encodeEventTopics({
    abi: [
      {
        type: "event",
        name: "Transfer",
        inputs: [
          { name: "from", type: "address", indexed: true },
          { name: "to", type: "address", indexed: true },
          { name: "value", type: "uint256", indexed: false },
        ],
      },
    ],
    eventName: "Transfer",
    args: { from: from as `0x${string}`, to: to as `0x${string}` },
  });

function receipt(status: "success" | "reverted", transfer?: { from: string; to: string; value: bigint }): TransactionReceipt {
  return {
    status,
    logs: transfer
      ? [
          {
            address: USDC,
            topics: transferTopic(transfer.from, transfer.to),
            data: encodeAbiParameters([{ type: "uint256" }], [transfer.value]),
          },
        ]
      : [],
  } as unknown as TransactionReceipt;
}

const TX = ("0x" + "ab".repeat(32)) as Hash;

/** In-memory stand-in for the sqlite exact_settlements table, same semantics. */
function memStore(calls: string[] = []): SettlementStore & { rows: Map<string, any> } {
  const rows = new Map<string, any>();
  const k = (p: string, n: string, net: string) => `${p}|${n}|${net}`;
  return {
    rows,
    insertPending: (r) => {
      calls.push("insertPending");
      const existing = rows.get(k(r.payer, r.nonce, r.network));
      if (!existing || existing.status === "failed") rows.set(k(r.payer, r.nonce, r.network), { ...r, status: "pending" });
    },
    get: (p, n, net) => rows.get(k(p, n, net)) ?? null,
    transition: (p, n, net, from, to) => {
      const row = rows.get(k(p, n, net));
      if (!row || row.status !== from) return false;
      row.status = to;
      if (to === "served") calls.push("claim");
      return true;
    },
  };
}

const ADDR = "0x53a79B109fa77c05B043e73A284a22b57c6263b0";

function deps(overrides: Partial<SettleDeps> = {}): SettleDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    store: memStore(calls),
    simulate: vi.fn(async () => {
      calls.push("simulate");
    }),
    // ~Base mainnet today: 100k gas at 0.006 gwei = 6e11 wei, under the 1e12 cap.
    quoteFees: vi.fn(async () => {
      calls.push("quoteFees");
      return { gasLimit: 100_000n, maxFeePerGas: 6_000_000n, maxPriorityFeePerGas: 1_000_000n };
    }),
    maxCostWei: 1_000_000_000_000n,
    send: vi.fn(async () => {
      calls.push("send");
      return TX;
    }),
    waitForReceipt: vi.fn(async () => {
      calls.push("waitForReceipt");
      return receipt("success", { from: payer.address, to: TREASURY_ADDRESS, value: PRICE });
    }),
    markProcessed: vi.fn(() => {
      calls.push("markProcessed");
    }),
    ...overrides,
  };
}

async function verified(): Promise<VerifiedExactAuthorization> {
  return verifyExactPayment(NET, await makePayment(), ctx());
}

describe("exact: settleExactPayment", () => {
  it("settles in order simulate -> quote fees -> send -> persist pending -> confirmed receipt -> claim -> mark processed, returning the tx hash and `from` (requirement 6)", async () => {
    const d = deps();
    const result = await settleExactPayment(await verified(), ADDR, d);
    expect(d.calls).toEqual(["simulate", "quoteFees", "send", "insertPending", "waitForReceipt", "claim", "markProcessed"]);
    // x402PaymentRef and payer for the attestation come from here.
    expect(result.txHash).toBe(TX);
    expect(result.payer).toBe(payer.address.toLowerCase());
    expect(result.payTo).toBe(TREASURY_ADDRESS.toLowerCase());
    expect(d.markProcessed).toHaveBeenCalledWith(
      expect.objectContaining({ txHash: TX, payer: payer.address.toLowerCase(), payTo: TREASURY_ADDRESS.toLowerCase(), amountAtomic: "10000" })
    );
  });

  it("submits nothing when the dry run reverts", async () => {
    const d = deps({
      simulate: vi.fn(async () => {
        throw new Error("execution reverted: FiatTokenV2: authorization is used or canceled");
      }),
    });
    await expectRejected(settleExactPayment(await verified(), ADDR, d), /nothing was submitted/);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.markProcessed).not.toHaveBeenCalled();
  });

  it("does not treat a reverted settlement as paid", async () => {
    const d = deps({ waitForReceipt: vi.fn(async () => receipt("reverted")) });
    await expectRejected(settleExactPayment(await verified(), ADDR, d), /reverted/);
    expect(d.markProcessed).not.toHaveBeenCalled();
  });

  it("does not treat a successful tx without the exact Transfer(from -> treasury, price) log as paid", async () => {
    const d = deps({
      waitForReceipt: vi.fn(async () => receipt("success", { from: payer.address, to: stranger.address, value: PRICE })),
    });
    await expect(settleExactPayment(await verified(), ADDR, d)).rejects.toThrow(/without the expected USDC Transfer/);
    expect(d.markProcessed).not.toHaveBeenCalled();
  });

  it("does not serve when the receipt can't be confirmed in time (never on a signature alone)", async () => {
    const d = deps({
      waitForReceipt: vi.fn(async () => {
        throw new WaitForTransactionReceiptTimeoutError({ hash: TX });
      }),
    });
    await expect(settleExactPayment(await verified(), ADDR, d)).rejects.toBeInstanceOf(SettlementUnconfirmedError);
    expect(d.markProcessed).not.toHaveBeenCalled();
  });

  it("settles one authorization for exactly one request: a concurrent second use is rejected before sending", async () => {
    const auth = await verified();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = deps({
      waitForReceipt: vi.fn(async () => {
        await gate;
        return receipt("success", { from: payer.address, to: TREASURY_ADDRESS, value: PRICE });
      }),
    });
    const first = settleExactPayment(auth, ADDR, d);
    await expectRejected(settleExactPayment(auth, ADDR, d), /already being settled/);
    release();
    await first;
    expect(d.send).toHaveBeenCalledTimes(1);
  });
});

describe("exact: hard requirement 7 (gas cap on settlement)", () => {
  it("submits nothing when the worst-case gas cost exceeds the cap", async () => {
    // 100k gas at 20 gwei = 2e15 wei, far above the 1e12 cap.
    const d = deps({
      quoteFees: vi.fn(async () => ({ gasLimit: 100_000n, maxFeePerGas: 20_000_000_000n, maxPriorityFeePerGas: 1_000_000n })),
    });
    const err = await settleExactPayment(await verified(), ADDR, d).catch((e) => e);
    expect(err).toBeInstanceOf(SettlementGasCapError);
    expect(err.message).toMatch(/nothing was submitted/);
    expect(err.worstCaseWei).toBe(2_000_000_000_000_000n);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.markProcessed).not.toHaveBeenCalled();
  });

  it("allows a settlement exactly at the cap (the cap is inclusive)", async () => {
    const d = deps({
      quoteFees: vi.fn(async () => ({ gasLimit: 100_000n, maxFeePerGas: 10_000_000n, maxPriorityFeePerGas: 1_000_000n })),
    });
    await settleExactPayment(await verified(), ADDR, d);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it("sends with exactly the gas limit and fees it checked, so the tx can't spend past the cap", async () => {
    const fees = { gasLimit: 90_000n, maxFeePerGas: 7_000_000n, maxPriorityFeePerGas: 1_000_000n };
    const d = deps({ quoteFees: vi.fn(async () => fees) });
    await settleExactPayment(await verified(), ADDR, d);
    expect(d.send).toHaveBeenCalledWith(expect.any(String), fees);
  });

  it("defaults the cap to 2e12 wei when EXACT_SETTLEMENT_MAX_COST_WEI is unset", async () => {
    const { env } = await import("../src/lib/env");
    if (process.env.EXACT_SETTLEMENT_MAX_COST_WEI === undefined) {
      expect(env.exactSettlementMaxCostWei).toBe(2_000_000_000_000n);
    } else {
      expect(env.exactSettlementMaxCostWei).toBe(BigInt(process.env.EXACT_SETTLEMENT_MAX_COST_WEI));
    }
  });
});

describe("exact: hard requirement 2 (no generic relaying)", () => {
  it("exports no raw submit/relay function: settlement only accepts a verified authorization", () => {
    const functions = Object.entries(exactModule)
      .filter(([, v]) => typeof v === "function" && !/Error$/.test((v as { name: string }).name))
      .map(([k]) => k)
      .sort();
    expect(functions).toEqual(
      [
        "decodeExactPaymentHeader",
        "defaultVerifyContext",
        "encodePaymentRequiredHeader",
        "encodePaymentResponseHeader",
        "exactRequirementFor",
        // Reads a receipt and updates a stored row; submits nothing.
        "recoverExactSettlement",
        "settleExactPayment",
        "verifyExactPayment",
      ].sort()
    );
  });

  it("transferWithAuthorization is only ever encoded in src/server/exact.ts, and settlement is only called from the paid route", () => {
    const roots = ["src", "sdk/src", "cli/src", "mcp-server/src"].map((r) => path.join(__dirname, "..", r));
    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(p);
      }
    };
    roots.forEach(walk);

    const rel = (p: string) => path.relative(path.join(__dirname, ".."), p).replace(/\\/g, "/");
    const mentioning = files.filter((f) => fs.readFileSync(f, "utf8").includes("transferWithAuthorization")).map(rel);
    expect(mentioning).toEqual(["src/server/exact.ts"]);

    const callers = files.filter((f) => /settleExactPayment\(/.test(fs.readFileSync(f, "utf8"))).map(rel).sort();
    expect(callers).toEqual(["src/server/app.ts", "src/server/exact.ts"]);
    const appSrc = fs.readFileSync(path.join(__dirname, "..", "src/server/app.ts"), "utf8");
    expect(appSrc.match(/settleExactPayment\(/g)).toHaveLength(1);
    // ...and that one call lives inside the /v1/risk-score/:address handler.
    const routeStart = appSrc.indexOf('app.get("/v1/risk-score/:address"');
    const routeEnd = appSrc.indexOf('app.get("/v1/metrics"');
    const callAt = appSrc.indexOf("settleExactPayment(");
    expect(routeStart).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(routeStart);
    expect(callAt).toBeLessThan(routeEnd);

    const recoverCallers = files.filter((f) => /recoverExactSettlement\(/.test(fs.readFileSync(f, "utf8"))).map(rel).sort();
    expect(recoverCallers).toEqual(["src/server/app.ts", "src/server/exact.ts"]);
    expect(appSrc.match(/recoverExactSettlement\(/g)).toHaveLength(1);
    const recoverAt = appSrc.indexOf("recoverExactSettlement(");
    expect(recoverAt).toBeGreaterThan(routeStart);
    expect(recoverAt).toBeLessThan(routeEnd);
  });
});

describe("exact: route-level gates (requirement 5: jurisdiction attestation stays mandatory)", () => {
  let server: Server;
  let baseUrl: string;
  const target = "0x53a79B109fa77c05B043e73A284a22b57c6263b0";

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

  async function paidRequest(jurisdictionHeader?: string) {
    const payment = await makePayment();
    const headers: Record<string, string> = {
      "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payment)).toString("base64"),
    };
    if (jurisdictionHeader !== undefined) headers["X-Jurisdiction-Attestation"] = jurisdictionHeader;
    return fetch(`${baseUrl}/v1/risk-score/${target}`, { headers });
  }

  it("rejects an exact payment with no X-Jurisdiction-Attestation header (403), before any settlement", async () => {
    const res = await paidRequest();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/X-Jurisdiction-Attestation: true/);
  });

  it("rejects X-Jurisdiction-Attestation values other than the literal \"true\"", async () => {
    for (const value of ["false", "1", "yes", "TRUE ", ""]) {
      const res = await paidRequest(value);
      expect(res.status, `header value ${JSON.stringify(value)}`).toBe(403);
    }
  });

  it("rejects a request carrying both X-PAYMENT and PAYMENT-SIGNATURE", async () => {
    const payment = await makePayment();
    const res = await fetch(`${baseUrl}/v1/risk-score/${target}`, {
      headers: {
        "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payment)).toString("base64"),
        "X-PAYMENT": Buffer.from("{}").toString("base64"),
        "X-Jurisdiction-Attestation": "true",
      },
    });
    expect(res.status).toBe(400);
  });

  it("unpaid 402 keeps the exact-direct body unchanged and adds a v2 exact PAYMENT-REQUIRED header paying the treasury", async () => {
    const res = await fetch(`${baseUrl}/v1/risk-score/${target}`);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0].scheme).toBe("exact-direct");
    expect(body.accepts[0].network).toBe("base-sepolia");

    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header).toBeTruthy();
    const v2 = JSON.parse(Buffer.from(header!, "base64").toString("utf8"));
    expect(v2.x402Version).toBe(2);
    expect(v2.accepts).toEqual([
      {
        scheme: "exact",
        network: "eip155:84532",
        asset: USDC,
        amount: "10000",
        payTo: TREASURY_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      },
    ]);
    expect(res.headers.get("Access-Control-Expose-Headers")).toMatch(/PAYMENT-REQUIRED/);
  });
});

// USDC's EIP-712 domain differs per network: read on-chain 2026-09-29,
// Base mainnet name() = "USD Coin", Base Sepolia name() = "USDC",
// version() = "2" on both. A wrong name makes every real signature fail.
describe("exact: USDC EIP-712 domain per network", () => {
  it('advertises "USD Coin" / "2" for Base mainnet', () => {
    expect(exactRequirementFor("base").extra).toEqual({ name: "USD Coin", version: "2" });
  });

  it('advertises "USDC" / "2" for Base Sepolia', () => {
    expect(exactRequirementFor("base-sepolia").extra).toEqual({ name: "USDC", version: "2" });
  });

  it('on mainnet, accepts a signature over the real "USD Coin" domain', async () => {
    const payment = await makePayment({ network: "base" });
    const v = await verifyExactPayment("base", payment, ctx());
    expect(v.from).toBe(payer.address);
  });

  it('on mainnet, rejects a signature made over name "USDC" (the Sepolia name)', async () => {
    const payment = await makePayment({ network: "base", domain: { name: "USDC" } });
    await expectRejected(verifyExactPayment("base", payment, ctx()), /does not recover/);
  });
});

// ---- receipt timeout after send: recover on retry, serve exactly once ----

describe("exact: receipt-timeout recovery (served exactly once)", () => {
  const timeout = () =>
    vi.fn(async () => {
      throw new WaitForTransactionReceiptTimeoutError({ hash: TX });
    });
  const confirmed = () => receipt("success", { from: payer.address, to: TREASURY_ADDRESS, value: PRICE });

  function recoveryDeps(store: SettlementStore, overrides: Partial<RecoveryDeps> = {}): RecoveryDeps {
    return {
      store,
      getReceipt: vi.fn(async () => confirmed()),
      markProcessed: vi.fn(),
      // A late retry: the authorization's window has passed and the
      // nonce is used on-chain (by our own tx). Recovery must not care.
      verifyContext: ctx({ now: NOW + 100_000, isNonceUsed: async () => true }),
      ...overrides,
    };
  }

  /** Runs one settlement that times out waiting for its receipt. */
  async function timedOut(): Promise<{ payment: ExactPaymentPayloadV2; store: SettlementStore & { rows: Map<string, any> } }> {
    const payment = await makePayment();
    const d = deps({ waitForReceipt: timeout() });
    const store = d.store as SettlementStore & { rows: Map<string, any> };
    const auth = await verifyExactPayment(NET, payment, ctx());
    await expect(settleExactPayment(auth, ADDR, d)).rejects.toBeInstanceOf(SettlementUnconfirmedError);
    expect(d.markProcessed).not.toHaveBeenCalled();
    const row = store.get(payer.address.toLowerCase(), payment.payload.authorization.nonce.toLowerCase(), NET);
    expect(row).toMatchObject({ status: "pending", txHash: TX, address: ADDR.toLowerCase() });
    return { payment, store };
  }

  it("timeout, then late confirmation, then retry: served once from our own tx", async () => {
    const { payment, store } = await timedOut();
    const r = recoveryDeps(store);
    const result = await recoverExactSettlement(NET, payment, ADDR, r);
    expect(result).toMatchObject({ txHash: TX, payer: payer.address.toLowerCase(), amountAtomic: PRICE });
    expect(r.getReceipt).toHaveBeenCalledWith(TX);
    expect(r.markProcessed).toHaveBeenCalledTimes(1);
    expect(store.get(payer.address.toLowerCase(), payment.payload.authorization.nonce.toLowerCase(), NET)?.status).toBe("served");
  });

  it("a second retry of the same authorization is rejected", async () => {
    const { payment, store } = await timedOut();
    const r = recoveryDeps(store);
    await recoverExactSettlement(NET, payment, ADDR, r);
    await expectRejected(recoverExactSettlement(NET, payment, ADDR, r), /already used to serve/);
    expect(r.markProcessed).toHaveBeenCalledTimes(1);
  });

  it("a used nonce with no pending record of ours is rejected (not recovered)", async () => {
    const payment = await makePayment();
    const r = recoveryDeps(memStore());
    expect(await recoverExactSettlement(NET, payment, ADDR, r)).toBeNull();
    expect(r.getReceipt).not.toHaveBeenCalled();
    // ...so the route falls through to the normal path, which rejects it as before.
    await expectRejected(verifyExactPayment(NET, payment, ctx({ isNonceUsed: async () => true })), /nonce already used/);
  });

  it("a pending record whose tx reverted is rejected, and marked failed", async () => {
    const { payment, store } = await timedOut();
    const r = recoveryDeps(store, { getReceipt: vi.fn(async () => receipt("reverted")) });
    await expectRejected(recoverExactSettlement(NET, payment, ADDR, r), /reverted; the payer was not charged/);
    expect(r.markProcessed).not.toHaveBeenCalled();
    expect(store.get(payer.address.toLowerCase(), payment.payload.authorization.nonce.toLowerCase(), NET)?.status).toBe("failed");
    // A failed row isn't ours to recover: the nonce is still unused, so the normal path decides.
    expect(await recoverExactSettlement(NET, payment, ADDR, r)).toBeNull();
  });

  it("a retry while our tx still has no receipt stays unconfirmed (504) and consumes nothing", async () => {
    const { payment, store } = await timedOut();
    const r = recoveryDeps(store, { getReceipt: vi.fn(async () => null) });
    await expect(recoverExactSettlement(NET, payment, ADDR, r)).rejects.toBeInstanceOf(SettlementUnconfirmedError);
    expect(store.get(payer.address.toLowerCase(), payment.payload.authorization.nonce.toLowerCase(), NET)?.status).toBe("pending");
    expect(r.markProcessed).not.toHaveBeenCalled();
  });

  it("a retry for a different address than the one paid for is rejected", async () => {
    const { payment, store } = await timedOut();
    const r = recoveryDeps(store);
    await expectRejected(recoverExactSettlement(NET, payment, stranger.address, r), /different address/);
    expect(r.markProcessed).not.toHaveBeenCalled();
  });

  it("if the retry is served first, the original request's late success does not serve again", async () => {
    const payment = await makePayment();
    const auth = await verifyExactPayment(NET, payment, ctx());
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const d = deps({
      waitForReceipt: vi.fn(async () => {
        await gate;
        return confirmed();
      }),
    });
    const original = settleExactPayment(auth, ADDR, d);
    await new Promise((res) => setTimeout(res, 0)); // let it send and persist
    const r = recoveryDeps(d.store);
    await recoverExactSettlement(NET, payment, ADDR, r);
    release();
    await expectRejected(original, /already used to serve/);
    expect(r.markProcessed).toHaveBeenCalledTimes(1);
    expect(d.markProcessed).not.toHaveBeenCalled();
  });
});

describe("exact: route-level gas cap (requirement 7)", () => {
  let server: Server;
  let baseUrl: string;
  const settle = deps({
    quoteFees: vi.fn(async () => ({ gasLimit: 100_000n, maxFeePerGas: 50_000_000_000n, maxPriorityFeePerGas: 1_000_000n })),
  });
  const recovery: RecoveryDeps = {
    store: settle.store,
    getReceipt: vi.fn(async () => null),
    markProcessed: vi.fn(),
    verifyContext: ctx(),
  };

  beforeAll(async () => {
    const app = createApp({
      exact: { verifyContext: () => ctx(), settleDeps: () => settle, recoveryDeps: () => recovery },
    });
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

  it("an over-cap settlement returns 503 with Retry-After and submits nothing", async () => {
    const payment = await makePayment();
    const res = await fetch(`${baseUrl}/v1/risk-score/${ADDR}`, {
      headers: {
        "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payment)).toString("base64"),
        "X-Jurisdiction-Attestation": "true",
      },
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect((await res.json()).error).toMatch(/nothing was submitted/);
    expect(settle.simulate).toHaveBeenCalledTimes(1);
    expect(settle.quoteFees).toHaveBeenCalledTimes(1);
    expect(settle.send).not.toHaveBeenCalled();
    expect(settle.markProcessed).not.toHaveBeenCalled();
    expect(settle.calls).not.toContain("insertPending");
  });
});
