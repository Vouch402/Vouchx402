# Changelog

## 1.0.0 — 2026-10-07

### Breaking

- `PaymentProof` now requires a `signature` field, and `fetchScore` takes
  a new required `signature` parameter: `fetchScore(address, quote,
  txHash, payer, signature, options)` (previously `fetchScore(address,
  quote, txHash, payer, options)`). The Vouch402 API rejects any
  `X-PAYMENT` payload without a valid one — see "Why" below. Produce it
  with the new `signPaymentProof(quote, signer, txHash)` export, or call
  `getRiskScore` (unchanged signature), which now does this internally.
- New export: `signPaymentProof(quote, signer, txHash)` — signs an
  EIP-191 personal-sign message (EIP-1271/ERC-6492-compatible for
  smart-contract wallets) proving `signer` controls the paying address
  for this exact `(network, resourceId, txHash)`.
- New export: `paymentProofMessage(network, resourceId, txHash)` — the
  exact string `signPaymentProof` signs over, for callers constructing
  the signature themselves (e.g. `mcp-server`, which never holds a
  wallet and relies on its caller to sign).

### Why

Every quote on a given network previously shared the same `payTo` and
flat price, and `PaymentProof.payer` was accepted as a bare claim — a
public on-chain fact (anyone can read who sent a given USDC `Transfer`
from a block explorer), not proof of control over that address. An
observer of someone else's public settlement transaction could mint
their own `resourceId` and redeem that payment against it, obtaining a
result for an address of their own choosing while the original payer's
own retry failed on "already processed." `signature` closes this: the
server recovers the signer from it and rejects the request unless it
matches the claimed `payer`. Full writeup in the main repo's
`DECISION_LOG.md`, 2026-10-07.

### Migration

Update any direct `fetchScore` call site to pass a `signature` (sign
with `signPaymentProof` before calling it, or switch to `getRiskScore`
which handles this automatically). No change needed if you only ever
called `getRiskScore`.

## 0.3.2 and earlier

Not tracked in this file; see the main repo's `DECISION_LOG.md` for the
history up to this point.
