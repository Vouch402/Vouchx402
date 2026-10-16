---
name: mainnet-payment-handoff
description: >
  How to run a real Base mainnet payment against Vouch402's production API
  (https://vouch402.fly.dev) when the Claude Code auto-mode classifier
  blocks a direct fund-moving command (cast send, sending USDC/ETH). Use
  when you need a real x402 quote/pay/fetch cycle completed on mainnet —
  generating example attestations, reproducing a production bug, adding
  real rows to the live activity feed — and the classifier denies you
  running `cast send` yourself. Covers why Invoke-RestMethod breaks on
  this API's own 402 response, why scratchpad file paths don't work for
  handoff scripts, and how to safely complete the flow once the user pays.
---

# Mainnet payment handoff (Vouch402)

Real fund-moving commands against Base mainnet (`cast send`, or anything
that submits a signed transaction moving real USDC/ETH) are reliably
blocked by the Claude Code auto-mode classifier in this environment.
This has been confirmed repeatedly, never a fluke. **Don't try to route
around it with another tool** (writing a raw signed tx via viem/ethers
to bypass `cast`, for example) — that defeats the purpose of the block.
The user runs the fund-moving step themselves; you prepare everything
around it and complete the flow once they hand back a result.

## Step 1: Confirm the block, don't assume it

Try the actual command once yourself first. If it's genuinely a
read-only action (a `curl` against the unpaid quote endpoint, a `cast
receipt` lookup), it usually isn't blocked — only the real transfer is.
Don't skip straight to the handoff script without checking; the
classifier's scope can be narrower than expected, and confirming it live
is more honest than assuming.

## Step 2: Get the real quote yourself first

```bash
curl -s https://vouch402.fly.dev/v1/risk-score/<ADDRESS>
```

Returns the real 402 body: `payTo`, `maxAmountRequired` (atomic USDC,
6 decimals), `asset` (USDC contract), and `extra.resourceId`. Confirm
these before handing anything to the user — don't make them discover a
stale quote.

## Step 3: Hand off a PowerShell script, not a bash one

The user's real shell is Windows PowerShell 5.1, confirmed by the
`PS C:\...>` prompt in their pasted output — even when they've also
shown they can invoke Git Bash explicitly. Default to PowerShell unless
they've shown you they're already in a bash session.

**Two PowerShell-specific traps, both hit in practice:**

1. **Never reference a path inside your own scratchpad/temp directory.**
   That tree only exists in this session's own sandboxed filesystem —
   a path like `C:\Users\...\AppData\Local\Temp\claude\<session>\...`
   looks like a real Windows path but resolves to nothing in the user's
   real shell ("No such file or directory"). Always paste the full
   script content inline for them to copy-paste directly.

2. **`Invoke-RestMethod` throws on any non-2xx HTTP status**, losing the
   response body by default in Windows PowerShell 5.1 (no
   `-SkipHttpErrorCheck`, that's PS7+ only). This API's own quote
   endpoint deliberately returns `402` as its *normal* response —
   exactly the case `Invoke-RestMethod` mishandles, corrupting the
   parsed quote into `$null` and producing a confusing downstream error
   (empty positional args silently reordering into `cast`'s own
   argument list, e.g. "odd number of digits" when a function signature
   string lands in the `[TO]` position). **Use `curl.exe` explicitly**
   (not the bare `curl` alias, which maps to `Invoke-WebRequest` and has
   the identical problem):

```powershell
$quoteJson = curl.exe -s "https://vouch402.fly.dev/v1/risk-score/$ADDRESS"
$quote = $quoteJson | ConvertFrom-Json
$accept = $quote.accepts[0]
if (-not $accept.payTo) {
  Write-Host "ERROR: couldn't parse quote. Raw response:" -ForegroundColor Red
  Write-Host $quoteJson
} else {
  # ... proceed with cast send using $accept.asset / $accept.payTo / $accept.maxAmountRequired
}
```

Always add the `if (-not $accept.payTo)` guard before calling `cast
send` — a silently-null quote otherwise produces a confusing unrelated
error instead of a clear "couldn't parse the quote" failure.

## Step 4: Never print or ask for the keystore password

Not even to the account's own owner — it decrypts a wallet holding real
funds, and there's no reason to put it in the conversation transcript.
Point them at their own local `.env` instead:

```powershell
Select-String -Path .env -Pattern "^DEPLOYER_KEYSTORE_PASSWORD="
```

`cast send --account <name>` without `--password-file` prompts
interactively on its own, which is the right UX for the user's own real
terminal (their environment isn't sandboxed non-interactive like this
session's Bash tool).

## Step 5: One payment per script run, keep it simple

Earlier attempts at looping 2-3 payments in one script made password
typos (which happen) harder to recover from cleanly and harder to debug
when something failed partway. Prefer handing off one payment at a
time — regenerate a fresh quote for each — unless the user explicitly
asks for a batch.

## Step 6: Once they hand back `resourceId` + `txHash`

1. Verify the transaction on-chain yourself before trusting it:
   ```bash
   cast receipt <txHash> --rpc-url https://mainnet.base.org --json
   ```
   Confirm `status: 0x1` and `to` matches the expected contract (USDC
   for a plain payment).
2. Have the user sign the payment proof message with the **same** keystore
   account that sent the payment (proves they control `payer`; the API
   rejects the request without this — see DECISION_LOG.md for the
   theft-of-service bug this closes):
   ```bash
   cast wallet sign --account <name> "Vouch402 payment proof
   network: base
   resourceId: <resourceId>
   txHash: <txHash>"
   ```
   `network` here is always the literal `base` for a mainnet handoff
   (never `base-sepolia` — a signature made for one network is rejected
   on the other).
   `cast wallet sign` prompts for the keystore password interactively,
   same as `cast send` in Step 4 — don't ask the user for the password
   directly.
3. Submit the `X-PAYMENT` proof against production:
   ```bash
   PROOF=$(node -e "console.log(JSON.stringify({resourceId:'<resourceId>',txHash:'<txHash>',payer:'<address>',signature:'<signature from step 2>',jurisdictionAttestation:true}))")
   XPAYMENT=$(printf '%s' "$PROOF" | base64 -w0)
   curl -s -i "https://vouch402.fly.dev/v1/risk-score/<address>" -H "X-PAYMENT: $XPAYMENT"
   ```
4. Independently re-verify the resulting attestation via EAS's own
   GraphQL API (`base.easscan.org/graphql`) — don't just trust the
   API's own JSON response. Confirm the decoded `x402PaymentRef`/
   `resourceId` match, and (if relevant) that the payment ref is a real,
   `eth_getTransactionReceipt`-resolvable hash, not something else
   (Base Pay's smart-wallet flow can hand back a userOp hash instead of
   a real tx hash — a real, previously-shipped bug; verify, don't
   assume the value you're given is what it claims to be).

## Related

- `DECISION_LOG.md`, entries dated 2026-09-08/09 for the real incidents
  this recipe was learned from (a QuickNode rate-limit bug, a Blockscout
  flake, and the Base Pay userOp-hash bug were all found via exactly
  this kind of real-payment verification).
