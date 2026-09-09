# For reviewers — read this in 3 minutes

Everything below is independently verifiable. Don't take our word for
any of it — click the links, run the commands.

## The product, live right now

- Site: https://www.vouch402.xyz (Docs, Try It demo, live activity feed)
- API: https://vouch402.fly.dev (Base mainnet)
- `curl https://vouch402.fly.dev/v1/metrics` — real counters, updated
  per transaction, not estimated.

## Real proof, not claims — click these

| | |
|---|---|
| Settled USDC payment (Base mainnet) | https://basescan.org/tx/0x6e44081aa3f05c73f6c9c32dc456f0231c3a690a33159765917ff096d138659c |
| Fulfillment attestation, Builder-Code-attributed | https://basescan.org/tx/0xe2b5002c923bd9b49afce698f9d0f7ebef66d24f8c1eafd22c0a64e7c5f7ebb7 |
| X402ServiceFulfillment schema (mainnet) | https://base.easscan.org/schema/view/0xfbd6000caf2aaa6f7e269c74b45a0f891ddfe3381356d8ebaefc46b1a524abac |
| X402ServiceDispute schema (mainnet) | https://base.easscan.org/schema/view/0x1920040cef7ce73e197d5a104e1c72e21d4787c8c095e9dba0584a8fee94fa18 |

## Ship velocity and engineering discipline, same day as this review

Three real production bugs found and fixed on 2026-09-09 alone, each
verified with a real mainnet payment, not just a passing test:

1. **RPC rate-limit data loss** — QuickNode's per-second ceiling could
   silently drop a real paid request's on-chain record. Ruled out the
   wrong fix (swapping RPC endpoints, same ceiling either way) before
   committing to a real one (transport-level retry). Found a second bug
   along the way: an external API (Blockscout) failing transiently was
   being silently read as "empty," which could mis-score an established
   wallet as brand new.
2. **Base Pay integration bug, live for ~1 month before being caught** —
   the site's Base Pay button sent the wrong hash type; no payment
   through it could ever be verified. A prior investigation had
   concluded this was fine without testing a real payment end-to-end —
   we corrected that conclusion on the record (see `DECISION_LOG.md`)
   rather than leave it buried, and verified the fix with a real
   completed payment.

Full detail on all three (and everything else) in `DECISION_LOG.md` —
76 dated entries total, not required reading, just proof this exists
if you want to dig in.

## Verify the code yourself

```bash
git clone https://github.com/Vouch402/Vouchx402.git
cd Vouchx402
npm install
npm run build   # clean production build
npm test        # real integration tests against Base Sepolia
```

## Ecosystem contributions

While building this, found and reported a real security vulnerability
in eas-sdk — the attestation library this project depends on for
every attestation it emits. Fixed and shipped upstream:
https://github.com/ethereum-attestation-service/eas-sdk/issues/132

## Newest feature — built in the days since Base Batches 004 opened

`tokenizedEquityExposure`: reports whether a scored address holds or
interacted with any of Coinbase's 13 tokenized US-equity tokens on
Base, launched 2026-08-24. Contract addresses independently verified
on-chain, not copied from press coverage. See the "Tokenized-equity
risk signal" section of README.md and the live demo section on the
site's Actividad en vivo page.

## Client packages, published

- vouch402-sdk — https://www.npmjs.com/package/vouch402-sdk
- vouch402 (CLI) — https://www.npmjs.com/package/vouch402
- vouch402-mcp-server — https://www.npmjs.com/package/vouch402-mcp-server
