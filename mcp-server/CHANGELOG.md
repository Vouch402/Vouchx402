# Changelog

## 1.0.0 — 2026-10-07

### Breaking

- `fetch_risk_score` now requires a new `signature` input: an EIP-191
  personal-sign signature (or an EIP-1271/ERC-6492 equivalent for a
  smart-contract wallet) from `payer`, over the exact string
  `` `Vouch402 payment proof\nnetwork: ${network}\nresourceId: ${resourceId}\ntxHash: ${txHash}` ``.
  The Vouch402 API now rejects any `X-PAYMENT` payload without a valid
  one — see "Why" below. This server still never holds a wallet or
  signs anything itself; the calling agent must produce this signature
  with its own wallet tooling, same as it already produces `txHash`.
- Requires `vouch402-sdk@^1.0.0`.

### Why

Every quote on a given network previously shared the same `payTo` and
flat price, and `payer` was accepted as a bare claim rather than proof
of control over that address. An observer of someone else's public
settlement transaction could mint their own quote and redeem that
payment against it, obtaining a result for an address of their own
choosing while the original payer's own retry failed on "already
processed." The new `signature` closes this. Full writeup in the main
repo's `DECISION_LOG.md`, 2026-10-07.

### Migration

Whatever wallet tooling your MCP client already uses to submit the
on-chain transfer for `get_payment_quote` must also produce a
`personal_sign`-style signature over the message above, and pass it as
`fetch_risk_score`'s new `signature` argument.

## 0.3.2 and earlier

Not tracked in this file; see the main repo's `DECISION_LOG.md` for the
history up to this point.
