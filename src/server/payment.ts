import {
  BaseError,
  decodeEventLog,
  HttpRequestError,
  TimeoutError,
  TransactionReceiptNotFoundError,
  type Hash,
} from "viem";
import { publicClientFor, erc20Abi } from "../lib/chain";
import { getQuote, consumeQuote, isPaymentProcessed, markPaymentProcessed } from "../lib/db";
import type { NetworkName } from "../lib/env";
import { paymentProofMessage, type PaymentProof } from "./x402";

export class PaymentVerificationError extends Error {}

export interface VerifiedPayment {
  resourceId: string;
  payer: string;
  payTo: string;
  amountAtomic: bigint;
  txHash: string;
  address: string;
}

/**
 * Server-side payment verification, mandatory before releasing any paid
 * resource (docs/TECHNICAL_SPEC.md "Payment verification"):
 *   1. reject already-processed tx hashes (replay protection)
 *   2. confirm the caller actually controls the claimed payer address
 *   3. confirm the payment settled on-chain
 *   4. confirm the paying address matches the request's claimed payer
 *   5. confirm amount and recipient match the quoted 402 requirements
 *   6. mark processed BEFORE the caller returns the resource
 *
 * Never trusts the client's claim alone: every field is re-derived from
 * the on-chain transaction receipt itself or a signature check.
 *
 * Step 2 exists because every quote on a given network shares the same
 * `payTo` and flat price (see `issueQuote`): without it, a `payer` field
 * is just a public on-chain fact (anyone can read who sent a given
 * Transfer) rather than proof of anything. An attacker who merely
 * observed someone else's public settlement tx could otherwise mint
 * their own resourceId and redeem the victim's payment against it,
 * obtaining a score for whatever address *they* chose while the victim's
 * own genuine retry dies on "already processed" below. The signature
 * binds the proof to the exact (network, resourceId, txHash) tuple, so
 * it cannot be lifted from one resourceId and replayed against another,
 * or from one network and replayed on the other.
 */
export async function verifyPayment(network: NetworkName, proof: PaymentProof): Promise<VerifiedPayment> {
  const quote = getQuote(proof.resourceId);
  if (!quote) throw new PaymentVerificationError("Unknown or expired resourceId");
  if (quote.consumedAt) throw new PaymentVerificationError("Quote already consumed");
  if (Date.now() > quote.expiresAt) throw new PaymentVerificationError("Quote expired");
  if (quote.network !== network) throw new PaymentVerificationError("Network mismatch for quote");

  // 1. Replay protection: reject if this tx was already used to pay for something.
  if (isPaymentProcessed(proof.txHash)) {
    throw new PaymentVerificationError("Payment already processed (replay)");
  }

  const client = publicClientFor(network);

  // 2. The claimed payer must have actually signed this specific
  // (resourceId, txHash) pair -- supports EOA (EIP-191), deployed smart
  // contract wallets (EIP-1271), and not-yet-deployed smart wallets
  // (ERC-6492), all via viem's own fallback chain.
  let signatureValid: boolean;
  try {
    signatureValid = await client.verifyMessage({
      address: proof.payer as `0x${string}`,
      message: paymentProofMessage(network, proof.resourceId, proof.txHash),
      signature: proof.signature as `0x${string}`,
    });
  } catch (err) {
    // An RPC outage must surface as a server error, not be reported to the
    // payer as a bad signature: their proof may be fine, we just couldn't check it.
    if (err instanceof BaseError && err.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError)) {
      throw err;
    }
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new PaymentVerificationError("Invalid payer signature: payer did not sign this resourceId/txHash");
  }

  // 3. Confirm the payment actually settled. A tx that hasn't been mined
  // yet is a client-retry case (402), not a server fault (500).
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: proof.txHash as Hash });
  } catch (err) {
    if (err instanceof TransactionReceiptNotFoundError) {
      throw new PaymentVerificationError("Payment transaction not yet confirmed on-chain; retry shortly.");
    }
    throw err;
  }
  if (receipt.status !== "success") {
    throw new PaymentVerificationError(`Payment transaction did not succeed: status=${receipt.status}`);
  }

  const claimedPayer = proof.payer.toLowerCase();

  // Look for a matching ERC-20 Transfer log on the quoted asset contract.
  let matched: { from: string; to: string; value: bigint } | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== quote.asset.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: "Transfer" });
      const from = (decoded.args.from as string).toLowerCase();
      const to = (decoded.args.to as string).toLowerCase();
      const value = decoded.args.value as bigint;

      // 4. Sender matches the request's claimed (and now signature-verified) payer.
      if (from !== claimedPayer) continue;
      // 5a. Recipient matches what was quoted.
      if (to !== quote.payTo.toLowerCase()) continue;

      matched = { from, to, value };
      break;
    } catch {
      // not a Transfer log on this contract's ABI shape: skip
      continue;
    }
  }

  if (!matched) {
    throw new PaymentVerificationError(
      "No matching USDC Transfer log found from the claimed payer to the quoted payTo address"
    );
  }

  // 5b. Amount matches (>=) what was quoted.
  const required = BigInt(quote.amountAtomic);
  if (matched.value < required) {
    throw new PaymentVerificationError(
      `Payment amount too low: got ${matched.value.toString()}, required ${required.toString()}`
    );
  }

  // 6. Mark processed BEFORE the caller releases the resource.
  markPaymentProcessed({
    txHash: proof.txHash,
    resourceId: proof.resourceId,
    payer: matched.from,
    payTo: matched.to,
    amountAtomic: matched.value.toString(),
    network,
  });
  consumeQuote(proof.resourceId);

  return {
    resourceId: proof.resourceId,
    payer: matched.from,
    payTo: matched.to,
    amountAtomic: matched.value,
    txHash: proof.txHash,
    address: quote.address,
  };
}
