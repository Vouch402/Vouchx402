import crypto from "node:crypto";
import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  isAddress,
  parseSignature,
  parseUnits,
  recoverTypedDataAddress,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { env, chainIdFor, payToFor, usdcAddressFor, type NetworkName } from "../lib/env";
import { publicClientFor } from "../lib/chain";
import { getEasSigner } from "../lib/eas";
import {
  markPaymentProcessed,
  insertPendingExactSettlement,
  getExactSettlement,
  transitionExactSettlement,
} from "../lib/db";
import { QUOTE_TTL_SECONDS } from "./x402";
import type { VerifiedPayment } from "./payment";

/**
 * Standard x402 v2 `exact` scheme (EIP-3009 `transferWithAuthorization`),
 * accepted alongside `exact-direct`. The payer signs an authorization
 * moving exactly the quoted USDC amount from their wallet to Vouch402's own
 * treasury; the server settles the payer's signed payment to our own
 * treasury by submitting that authorization itself and paying the gas.
 * Nothing else: this module has no way to move funds anywhere except
 * `TREASURY_ADDRESS`, and it only ever runs inside a paid request for
 * `/v1/risk-score/:address` (see DECISION_LOG.md, "Standard x402 `exact`
 * scheme").
 *
 * Wire format verified against the published `@x402/core`/`@x402/evm`
 * 2.27.0 source, not written from memory: the 402 carries a base64 JSON
 * `PAYMENT-REQUIRED` header, the client retries with a base64 JSON
 * `PAYMENT-SIGNATURE` header, and a successful response carries a
 * `PAYMENT-RESPONSE` header.
 */

/**
 * Vouch402's treasury on Base mainnet (DECISION_LOG.md, "Mainnet
 * treasury address confirmed and set"). Pinned here as a constant rather
 * than read from `payToFor()`, deliberately: on Base Sepolia `payToFor()`
 * falls back to the signer wallet itself, and this scheme must never make
 * the signer the recipient of anything. So `exact` pays the treasury on
 * both networks, and on mainnet the configured `payTo` is additionally
 * required to equal this constant before anything is settled.
 */
export const TREASURY_ADDRESS = "0xb440b82Fb537A56eD8FC045Da622B469E88Fd2bB" as const;

export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";
export const JURISDICTION_ATTESTATION_HEADER = "X-Jurisdiction-Attestation";

/** CAIP-2 network ids, the v2 `network` format. */
const CAIP2_NETWORK: Record<NetworkName, string> = {
  base: "eip155:8453",
  "base-sepolia": "eip155:84532",
};

/**
 * USDC's EIP-712 domain, read on-chain via `name()`/`version()` on
 * 2026-09-29: mainnet is "USD Coin" (not "USDC", which is only what the
 * existing `exact-direct` quote uses as a display label), Sepolia is
 * "USDC". A wrong name here makes every client signature recover to a
 * different address and fail, so this is not cosmetic.
 */
const USDC_EIP712: Record<NetworkName, { name: string; version: string }> = {
  base: { name: "USD Coin", version: "2" },
  "base-sepolia": { name: "USDC", version: "2" },
};

/**
 * Same safety margin the reference `@x402/evm` verifier applies to
 * `validBefore` (it rejects anything expiring within 6 seconds): a
 * window that closes before the settlement tx can be included would just
 * revert on-chain after we paid its gas.
 */
const VALID_BEFORE_MARGIN_SECONDS = 6;
const RECEIPT_TIMEOUT_MS = 90_000;

const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const usdcEip3009Abi = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** A request-level rejection: nothing was submitted on-chain. */
export class ExactPaymentRejectedError extends Error {}
/** The payment header itself isn't a well-formed v2 payload (a 400, not a 402). */
export class ExactPaymentFormatError extends Error {}

export interface ExactRequirement {
  scheme: "exact";
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

export interface PaymentRequiredV2 {
  x402Version: 2;
  error?: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: ExactRequirement[];
}

export interface ExactAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface ExactPaymentPayloadV2 {
  x402Version: 2;
  accepted: { scheme: string; network: string; asset: string; amount: string; payTo: string };
  payload: { signature: string; authorization: ExactAuthorization };
}

function priceAtomic(): bigint {
  return parseUnits(env.priceUsdc, 6);
}

export function exactRequirementFor(network: NetworkName): ExactRequirement {
  return {
    scheme: "exact",
    network: CAIP2_NETWORK[network],
    asset: getAddress(usdcAddressFor(network)),
    amount: priceAtomic().toString(),
    payTo: TREASURY_ADDRESS,
    maxTimeoutSeconds: QUOTE_TTL_SECONDS,
    extra: { ...USDC_EIP712[network] },
  };
}

/**
 * The v2 `PAYMENT-REQUIRED` header value. Carried alongside, not instead
 * of, the existing v1-shaped `exact-direct` JSON body: `@x402/fetch` reads
 * this header first and only falls back to the body when it's absent,
 * while `vouch402-sdk`, the CLI, the MCP server and the website all read
 * `body.accepts[0]` and never look at this header.
 */
export function encodePaymentRequiredHeader(network: NetworkName, resourceUrl: string, error?: string): string {
  const body: PaymentRequiredV2 = {
    x402Version: 2,
    ...(error ? { error } : {}),
    resource: {
      url: resourceUrl,
      description: "Vouch402 on-chain risk score for a Base address",
      mimeType: "application/json",
    },
    accepts: [exactRequirementFor(network)],
  };
  return Buffer.from(JSON.stringify(body)).toString("base64");
}

export function encodePaymentResponseHeader(network: NetworkName, txHash: string, payer: string): string {
  return Buffer.from(
    JSON.stringify({ success: true, transaction: txHash, network: CAIP2_NETWORK[network], payer })
  ).toString("base64");
}

const DECIMAL = /^[0-9]{1,78}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const SIG65 = /^0x[0-9a-fA-F]{130}$/;

/** Parses the `PAYMENT-SIGNATURE` header into a shape-checked v2 payload. */
export function decodeExactPaymentHeader(headerValue: string): ExactPaymentPayloadV2 {
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
  } catch {
    throw new ExactPaymentFormatError("Malformed PAYMENT-SIGNATURE header: expected base64 JSON");
  }
  const auth = parsed?.payload?.authorization;
  if (
    parsed?.x402Version !== 2 ||
    typeof parsed?.accepted !== "object" ||
    parsed.accepted === null ||
    typeof parsed?.payload?.signature !== "string" ||
    typeof auth !== "object" ||
    auth === null ||
    !["from", "to", "value", "validAfter", "validBefore", "nonce"].every((k) => typeof auth[k] === "string")
  ) {
    throw new ExactPaymentFormatError(
      "Malformed PAYMENT-SIGNATURE header: expected an x402 v2 exact payload { x402Version: 2, accepted, payload: { signature, authorization } }"
    );
  }
  return parsed as ExactPaymentPayloadV2;
}

export interface VerifyContext {
  /** Unix seconds. */
  now: number;
  priceAtomic: bigint;
  /** Vouch402's own signer: never allowed to be the recipient. */
  signerAddress: string;
  /** `payToFor(network)`; on mainnet it must equal TREASURY_ADDRESS. */
  configuredPayTo: string;
  /** USDC `authorizationState(from, nonce)`: true once a nonce is used or cancelled. */
  isNonceUsed: (from: `0x${string}`, nonce: Hex) => Promise<boolean>;
}

/** Only `verifyExactPayment` produces this; `settleExactPayment` only accepts it. */
export interface VerifiedExactAuthorization {
  readonly __verified: unique symbol;
  network: NetworkName;
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
}

function checksum(value: string, field: string): `0x${string}` {
  // viem's isAddress is strict by default: a mixed-case address with a
  // wrong EIP-55 checksum is rejected, all-lowercase is accepted.
  if (!isAddress(value)) throw new ExactPaymentRejectedError(`Invalid ${field} address`);
  return getAddress(value);
}

/**
 * Every check that can be made without sending anything. Throws
 * ExactPaymentRejectedError on the first failure; nothing is submitted
 * on-chain unless every one of these passes.
 *
 * `mode: "recover"` is only for recoverExactSettlement: it keeps every
 * authenticity check (scheme, network, asset, treasury, exact price,
 * signature recovers to `from`) and skips only the validity window and
 * the nonce-unused check, both of which are expected to fail once our
 * own settlement tx has already used this nonce.
 */
export async function verifyExactPayment(
  network: NetworkName,
  payment: ExactPaymentPayloadV2,
  ctx: VerifyContext,
  mode: "settle" | "recover" = "settle"
): Promise<VerifiedExactAuthorization> {
  const expected = exactRequirementFor(network);
  const usdc = getAddress(usdcAddressFor(network));
  const treasury = getAddress(TREASURY_ADDRESS);

  if (payment.x402Version !== 2) throw new ExactPaymentRejectedError("Unsupported x402Version");
  const { accepted } = payment;
  if (accepted.scheme !== "exact") throw new ExactPaymentRejectedError("Unsupported scheme");
  if (accepted.network !== expected.network) {
    throw new ExactPaymentRejectedError(`Network mismatch: this server settles on ${expected.network} only`);
  }
  if (typeof accepted.asset !== "string" || !isAddress(accepted.asset) || getAddress(accepted.asset) !== usdc) {
    throw new ExactPaymentRejectedError("Asset mismatch: only Base USDC is accepted");
  }

  // Server-side configuration guards (hard requirement 4: the signer
  // only ever pays gas, never receives funds).
  const signer = getAddress(ctx.signerAddress);
  if (treasury === signer) throw new Error("Refusing to settle: treasury equals the signer wallet");
  if (network === "base" && getAddress(ctx.configuredPayTo) !== treasury) {
    throw new Error("Refusing to settle: configured mainnet payTo does not equal the pinned treasury address");
  }

  const auth = payment.payload.authorization;
  const from = checksum(auth.from, "from");
  const to = checksum(auth.to, "to");
  if (to !== treasury) {
    throw new ExactPaymentRejectedError("Recipient mismatch: authorization must pay Vouch402's own treasury");
  }

  if (![auth.value, auth.validAfter, auth.validBefore].every((v) => DECIMAL.test(v))) {
    throw new ExactPaymentRejectedError("Malformed authorization amount or validity window");
  }
  const value = BigInt(auth.value);
  if (value !== ctx.priceAtomic) {
    throw new ExactPaymentRejectedError(
      `Amount mismatch: authorization is for ${value.toString()}, price is exactly ${ctx.priceAtomic.toString()}`
    );
  }

  const validAfter = BigInt(auth.validAfter);
  const validBefore = BigInt(auth.validBefore);
  if (mode === "settle") {
    if (validAfter > BigInt(ctx.now)) throw new ExactPaymentRejectedError("Authorization not yet valid (validAfter)");
    if (validBefore < BigInt(ctx.now + VALID_BEFORE_MARGIN_SECONDS)) {
      throw new ExactPaymentRejectedError("Authorization expired or expiring (validBefore)");
    }
  }

  if (!BYTES32.test(auth.nonce)) throw new ExactPaymentRejectedError("Malformed authorization nonce");
  const nonce = auth.nonce as Hex;

  // EOA signatures only: the requirement is that the signature recovers
  // to `from`. Smart-wallet (ERC-1271/ERC-6492) signatures don't recover
  // and are rejected here, not half-supported.
  if (!SIG65.test(payment.payload.signature)) {
    throw new ExactPaymentRejectedError("Signature must be a 65-byte ECDSA signature");
  }
  const signature = payment.payload.signature as Hex;
  let recovered: `0x${string}`;
  try {
    recovered = await recoverTypedDataAddress({
      domain: { ...USDC_EIP712[network], chainId: chainIdFor(network), verifyingContract: usdc },
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization",
      message: { from, to, value, validAfter, validBefore, nonce },
      signature,
    });
  } catch {
    throw new ExactPaymentRejectedError("Invalid signature");
  }
  if (getAddress(recovered) !== from) {
    throw new ExactPaymentRejectedError("Signature does not recover to the authorization's from address");
  }

  if (mode === "settle" && (await ctx.isNonceUsed(from, nonce))) {
    throw new ExactPaymentRejectedError("Authorization nonce already used");
  }

  return { network, from, to, value, validAfter, validBefore, nonce, signature } as VerifiedExactAuthorization;
}

/** Production verify context: live price, signer, config, and an on-chain nonce read. */
export function defaultVerifyContext(network: NetworkName): VerifyContext {
  const client = publicClientFor(network);
  const usdc = getAddress(usdcAddressFor(network));
  return {
    now: Math.floor(Date.now() / 1000),
    priceAtomic: priceAtomic(),
    // The cached signer instance, not loadDeployerAccount(): that one
    // re-runs the keystore's scrypt decryption on every call.
    signerAddress: getEasSigner(network).address,
    configuredPayTo: payToFor(network),
    isNonceUsed: (from, nonce) =>
      client.readContract({ address: usdc, abi: usdcEip3009Abi, functionName: "authorizationState", args: [from, nonce] }),
  };
}

/** Gas limit and EIP-1559 fees the settlement tx is sent with, pinned. */
export interface SettlementFees {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface SettleDeps {
  /** Dry-run the exact call first: a revert here costs no gas. */
  simulate: (data: Hex) => Promise<void>;
  /** Gas estimate (with headroom) and current fees for this exact call. */
  quoteFees: (data: Hex) => Promise<SettlementFees>;
  /** Hard requirement 7: worst-case wei we'll spend on one settlement. */
  maxCostWei: bigint;
  send: (data: Hex, fees: SettlementFees) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<TransactionReceipt>;
  markProcessed: typeof markPaymentProcessed;
  store: SettlementStore;
}

/** Persistence for sent settlements; the sqlite-backed one in production. */
export interface SettlementStore {
  insertPending: typeof insertPendingExactSettlement;
  get: typeof getExactSettlement;
  transition: typeof transitionExactSettlement;
}

const dbSettlementStore: SettlementStore = {
  insertPending: insertPendingExactSettlement,
  get: getExactSettlement,
  transition: transitionExactSettlement,
};

/**
 * Headroom over `estimateGas`: the ERC-8021 attribution suffix
 * AttributedWallet appends adds calldata the estimate didn't see.
 */
const GAS_LIMIT_HEADROOM = (estimate: bigint) => (estimate * 12n) / 10n + 2_000n;

function defaultSettleDeps(network: NetworkName): SettleDeps {
  const client = publicClientFor(network);
  const usdc = getAddress(usdcAddressFor(network));
  const signer = () => getEasSigner(network).address as `0x${string}`;
  return {
    simulate: async (data) => {
      await client.call({ account: signer(), to: usdc, data });
    },
    quoteFees: async (data) => {
      const [gas, fees] = await Promise.all([
        client.estimateGas({ account: signer(), to: usdc, data }),
        client.estimateFeesPerGas(),
      ]);
      return {
        gasLimit: GAS_LIMIT_HEADROOM(gas),
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      };
    },
    maxCostWei: env.exactSettlementMaxCostWei,
    // Same signer (and so the same ERC-8021 attribution and nonce-race
    // retry) as every attestation this server sends: see src/lib/eas.ts.
    // gasLimit and maxFeePerGas are pinned to what was checked against
    // the cap, so the tx itself can't spend more than that on L2 gas.
    send: async (data, fees) =>
      (
        await getEasSigner(network).sendTransaction({
          to: usdc,
          data,
          gasLimit: fees.gasLimit,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        })
      ).hash as Hash,
    waitForReceipt: (hash) => client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS }),
    markProcessed: markPaymentProcessed,
    store: dbSettlementStore,
  };
}

/**
 * Settlement would cost more than EXACT_SETTLEMENT_MAX_COST_WEI right now.
 * Nothing was submitted and the authorization is still unused, so the
 * payer can retry later: a server-side condition (503), not a rejection
 * of their payment (402).
 */
export class SettlementGasCapError extends Error {
  constructor(public readonly worstCaseWei: bigint, public readonly capWei: bigint) {
    super(
      `Settlement would cost up to ${worstCaseWei} wei in gas, above this server's cap of ${capWei} wei; nothing was submitted and your authorization was not used. Retry later.`
    );
  }
}

/** Same shape exact-direct produces, minus the quote's address (the URL carries it). */
export type SettledExactPayment = Omit<VerifiedPayment, "address">;

/** `${from}:${nonce}` of authorizations currently being settled (one request each). */
const inFlight = new Set<string>();

/** Thrown when a settlement tx was sent but its confirmation couldn't be read in time. */
export class SettlementUnconfirmedError extends Error {
  constructor(public readonly txHash: Hash) {
    super(`Settlement ${txHash} was submitted but not confirmed in time; the resource was not served.`);
  }
}

/** True if the receipt carries USDC Transfer(from -> treasury, exactly value). */
function hasExactTransfer(receipt: TransactionReceipt, network: NetworkName, from: string, value: bigint): boolean {
  const usdc = getAddress(usdcAddressFor(network));
  return receipt.logs.some((log) => {
    if (getAddress(log.address) !== usdc) return false;
    try {
      const decoded = decodeEventLog({ abi: usdcEip3009Abi, data: log.data, topics: log.topics, eventName: "Transfer" });
      return (
        getAddress(decoded.args.from) === getAddress(from) &&
        getAddress(decoded.args.to) === getAddress(TREASURY_ADDRESS) &&
        decoded.args.value === value
      );
    } catch {
      return false;
    }
  });
}

/**
 * The single point where a confirmed settlement becomes "used": moves
 * the stored row pending -> served (compare-and-set, so exactly one
 * request wins even if two race), then marks the tx processed.
 */
function claimAndMarkProcessed(
  deps: Pick<SettleDeps, "store" | "markProcessed">,
  network: NetworkName,
  from: string,
  nonce: string,
  txHash: Hash,
  value: bigint,
  recorded: boolean
): SettledExactPayment {
  const payer = from.toLowerCase();
  if (recorded && !deps.store.transition(payer, nonce.toLowerCase(), network, "pending", "served")) {
    throw new ExactPaymentRejectedError("This payment was already used to serve a request");
  }
  const resourceId = ("0x" + crypto.randomBytes(32).toString("hex")) as `0x${string}`;
  const payTo = getAddress(TREASURY_ADDRESS).toLowerCase();
  deps.markProcessed({ txHash, resourceId, payer, payTo, amountAtomic: value.toString(), network });
  return { resourceId, payer, payTo, amountAtomic: value, txHash };
}

/**
 * Submits a verified authorization and returns only once its receipt is
 * confirmed on-chain with a matching USDC Transfer(from -> treasury,
 * exact value). The caller serves the paid response only after this
 * resolves: never on a signature alone.
 *
 * `address` is the resource the payment is for. It's stored with the
 * pending settlement so a retry after a receipt timeout can only be
 * served for that same address (see recoverExactSettlement).
 */
export async function settleExactPayment(
  verified: VerifiedExactAuthorization,
  address: string,
  deps: SettleDeps = defaultSettleDeps(verified.network)
): Promise<SettledExactPayment> {
  const key = `${verified.from.toLowerCase()}:${verified.nonce.toLowerCase()}`;
  if (inFlight.has(key)) {
    throw new ExactPaymentRejectedError("This authorization is already being settled for another request");
  }
  inFlight.add(key);
  try {
    const { r, s, v, yParity } = parseSignature(verified.signature);
    const data = encodeFunctionData({
      abi: usdcEip3009Abi,
      functionName: "transferWithAuthorization",
      args: [
        verified.from,
        verified.to,
        verified.value,
        verified.validAfter,
        verified.validBefore,
        verified.nonce,
        Number(v ?? BigInt(yParity + 27)),
        r,
        s,
      ],
    });

    try {
      await deps.simulate(data);
    } catch (err) {
      const reason = (err as { shortMessage?: string })?.shortMessage ?? "call reverted";
      throw new ExactPaymentRejectedError(`Authorization would not settle (${reason}); nothing was submitted`);
    }

    // Hard requirement 7: check the worst-case gas spend against the cap
    // before sending, then send with exactly these limits pinned.
    const fees = await deps.quoteFees(data);
    const worstCaseWei = fees.gasLimit * fees.maxFeePerGas;
    if (worstCaseWei > deps.maxCostWei) {
      throw new SettlementGasCapError(worstCaseWei, deps.maxCostWei);
    }

    const txHash = await deps.send(data, fees);

    // Persist before waiting: if the receipt wait times out and the tx
    // confirms later, the payer's retry finds this row and is served
    // exactly once (recoverExactSettlement). A failed write must not
    // abandon a tx that's already out, so it's logged, not thrown.
    const payer = verified.from.toLowerCase();
    const nonce = verified.nonce.toLowerCase();
    let recorded = false;
    try {
      deps.store.insertPending({ payer, nonce, network: verified.network, txHash, address: address.toLowerCase() });
      recorded = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Could not record pending settlement ${txHash}; a receipt timeout would not be recoverable:`, err);
    }

    let receipt: TransactionReceipt;
    try {
      receipt = await deps.waitForReceipt(txHash);
    } catch (err) {
      if (err instanceof WaitForTransactionReceiptTimeoutError || err instanceof TransactionReceiptNotFoundError) {
        // Row stays `pending`: this is exactly the case recovery exists for.
        throw new SettlementUnconfirmedError(txHash);
      }
      throw err;
    }
    if (receipt.status !== "success") {
      if (recorded) deps.store.transition(payer, nonce, verified.network, "pending", "failed");
      throw new ExactPaymentRejectedError(`Settlement transaction ${txHash} reverted; the payer was not charged`);
    }

    if (!hasExactTransfer(receipt, verified.network, verified.from, verified.value)) {
      // Should be impossible for a successful transferWithAuthorization
      // on USDC itself; if it ever happens, don't serve on it.
      if (recorded) deps.store.transition(payer, nonce, verified.network, "pending", "failed");
      throw new Error(`Settlement ${txHash} confirmed without the expected USDC Transfer log`);
    }

    return claimAndMarkProcessed(deps, verified.network, verified.from, verified.nonce, txHash, verified.value, recorded);
  } finally {
    inFlight.delete(key);
  }
}

export interface RecoveryDeps {
  store: SettlementStore;
  /** null while the tx has no receipt yet. */
  getReceipt: (hash: Hash) => Promise<TransactionReceipt | null>;
  markProcessed: typeof markPaymentProcessed;
  verifyContext: VerifyContext;
}

function defaultRecoveryDeps(network: NetworkName): RecoveryDeps {
  const client = publicClientFor(network);
  return {
    store: dbSettlementStore,
    getReceipt: async (hash) => {
      try {
        return await client.getTransactionReceipt({ hash });
      } catch (err) {
        if (err instanceof TransactionReceiptNotFoundError) return null;
        throw err;
      }
    },
    markProcessed: markPaymentProcessed,
    verifyContext: defaultVerifyContext(network),
  };
}

/**
 * The retry path after a receipt timeout (504). Returns null when this
 * server never sent a settlement for this authorization, so the caller
 * falls through to the normal path (which rejects a used nonce exactly
 * as before). Otherwise it serves the stored settlement at most once:
 *
 *  - the retry must carry the same authentic authorization (same
 *    checks as a fresh payment except validity window / nonce state),
 *    for the same address the settlement was stored with;
 *  - our own tx must have a successful receipt with the exact USDC
 *    Transfer(payer -> treasury, price) log;
 *  - the row must still be `pending`, and moving it to `served` is a
 *    compare-and-set, so a second retry is rejected.
 *
 * Submits nothing: it only reads a receipt and updates the stored row.
 */
export async function recoverExactSettlement(
  network: NetworkName,
  payment: ExactPaymentPayloadV2,
  address: string,
  deps: RecoveryDeps = defaultRecoveryDeps(network)
): Promise<SettledExactPayment | null> {
  const auth = payment?.payload?.authorization;
  if (!auth || typeof auth.from !== "string" || !isAddress(auth.from) || !BYTES32.test(auth.nonce)) return null;
  const payer = auth.from.toLowerCase();
  const nonce = auth.nonce.toLowerCase();
  const record = deps.store.get(payer, nonce, network);
  // No row, or a row whose earlier tx reverted (nonce still unused
  // on-chain): not ours to recover, the normal path handles it.
  if (!record || record.status === "failed") return null;

  const verified = await verifyExactPayment(network, payment, deps.verifyContext, "recover");
  if (record.address !== address.toLowerCase()) {
    throw new ExactPaymentRejectedError("This payment was made for a different address");
  }
  if (record.status === "served") {
    throw new ExactPaymentRejectedError("This payment was already used to serve a request");
  }

  const txHash = record.txHash as Hash;
  const receipt = await deps.getReceipt(txHash);
  if (!receipt) throw new SettlementUnconfirmedError(txHash);
  if (receipt.status !== "success") {
    deps.store.transition(payer, nonce, network, "pending", "failed");
    throw new ExactPaymentRejectedError(`Settlement transaction ${txHash} reverted; the payer was not charged`);
  }
  if (!hasExactTransfer(receipt, network, verified.from, verified.value)) {
    deps.store.transition(payer, nonce, network, "pending", "failed");
    throw new Error(`Settlement ${txHash} confirmed without the expected USDC Transfer log`);
  }
  return claimAndMarkProcessed(deps, network, verified.from, verified.nonce, txHash, verified.value, true);
}
