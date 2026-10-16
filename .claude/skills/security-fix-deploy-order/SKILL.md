---
name: security-fix-deploy-order
description: >
  The order to publish, deploy, and push a fix for a security
  vulnerability in Vouch402 (a protocol-breaking change to the API
  server, affecting vouch402-sdk/vouch402 CLI/vouch402-mcp-server).
  Use whenever a fix changes the X-PAYMENT contract, or any other
  client-server protocol detail, and the corresponding DECISION_LOG
  entry, test, or notice describes or reproduces the vulnerability
  itself. Covers why the GitHub push happens last, not first, and the
  two post-deploy checks (new client works, old client fails cleanly).
---

# Security-fix deploy order (Vouch402)

This repo is **public**. A commit that documents or reproduces a
vulnerability — a `DECISION_LOG.md` entry naming the exploit, a test
that reproduces it, a breaking-change notice — is itself a working
writeup of the hole. Pushing it to GitHub before the fix is live in
production hands anyone a recipe to exploit the still-vulnerable
server. This is now a standing rule in `AGENTS.md` ("A fix for a
security vulnerability waits to be pushed..."); this skill is the
step-by-step for actually doing it.

## The order, and why it can't be reshuffled

1. **Local commit(s) only — no push.** `fly deploy` builds from the
   local checkout, not from GitHub, so a local commit discloses
   nothing. Keep the fix commit separate from any unrelated work
   (branding, docs, etc.) sitting in the same working tree — don't
   let them get mixed into one commit's diff.
2. **Publish dependent npm packages first**, in dependency order
   (`vouch402-sdk` before `vouch402`/`vouch402-mcp-server` — see
   `$npm-publish-handoff` for the actual publish mechanics and
   registry-verification polling). If the fix changes the
   `X-PAYMENT`/`PAYMENT-SIGNATURE` wire contract, this is a breaking
   change: bump these packages' own major version so the break is
   visible in the version number itself, not just in a changelog.
3. **Confirm before touching Fly** if there's any chance another
   session/terminal is using the same Fly account for something
   unrelated — ask, don't assume you have the account to yourself.
4. **Deploy**: `fly deploy --app vouch402`. One shot — never a staged
   rollout, and never a server build that accepts both the old and
   new wire format at once (a dual-accept window defeats the fix: an
   attacker just uses the old format).
5. **Verify a NEW client works** — a real small payment (mainnet
   needs `$mainnet-payment-handoff`, since this environment has no
   fund-moving credentials) through the just-published client,
   expecting `200` and a real, independently-resolvable attestation.
6. **Verify an OLD (pre-fix) client fails *cleanly*, not with a
   `500`.** This doesn't need a real payment — the failure should
   happen at header-decode time, before any chain lookup. Example for
   a fix that requires a new required field:
   ```bash
   PROOF=$(node -e "console.log(JSON.stringify({resourceId:'0x00',txHash:'0x00',payer:'0x0000000000000000000000000000000000000000',jurisdictionAttestation:true}))")
   curl -s -i "https://vouch402.fly.dev/v1/risk-score/0x0000000000000000000000000000000000000000" \
     -H "X-PAYMENT: $(printf '%s' "$PROOF" | base64 -w0)"
   ```
   Expect a `400` with a specific, readable message naming the
   missing field — not a generic `500 Internal error`. A `500` here
   means the old-client failure path itself has a bug worth fixing
   before declaring the deploy done.
7. **Only now**: `git push origin master`. The public repo catching
   up at this point discloses nothing exploitable, because the fix
   it's describing is already live and verified.
8. Record the verification results (steps 5-6) as a follow-up
   `DECISION_LOG.md` entry, written and pushed after step 7.

## Before any of this: the usual two checks

- `git fetch` and compare local `master` against `origin/master`
  (`git rev-parse master origin/master`) — don't build or deploy a fix
  on top of a stale local checkout. See `AGENTS.md`, "Committed is not
  live," reverse case.
- If the fix needs a manual, non-automatable verification step (a
  browser flow, a passkey wallet) before any of the above starts, that
  step blocks everything else in this list — don't publish or deploy
  ahead of it just because the code is ready.

## Related

- `$npm-publish-handoff` — the actual publish commands and
  registry-verification polling this plan's step 2 depends on.
- `$mainnet-payment-handoff` — how to get a real mainnet payment run
  for step 5 when this environment has no funds/keys of its own.
- `AGENTS.md`, "Committed is not live" and "A fix for a security
  vulnerability waits to be pushed..." — the standing rules this
  skill expands on.
- `DECISION_LOG.md`, 2026-10-07 — the real case (a theft-of-service
  bug in payment verification) this skill was written from.
