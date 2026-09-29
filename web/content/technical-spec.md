# Vouch402: Technical Specification

x402-metered on-chain risk intelligence for autonomous agents on Base, with
a built-in proof-of-fulfillment attestation layer.

## Problem

x402 (HTTP 402-based payments for machine-to-machine commerce) defines how
an agent pays for a resource. It does not define how anyone (the payer, the
seller, or a third party) can later verify whether the paid resource was
actually delivered. Once a payment settles, there is no portable, queryable
record connecting that payment to a fulfillment outcome. That leaves other
systems that might want to consume such a record, such as agent-reputation or
dispute-resolution tools built by third parties, with no fulfillment data to
read for agent-to-agent commerce on top of x402 today.

Vouch402 addresses one instance of this problem directly (it is itself an
x402-paid data service), and ships a small, reusable protocol layer,
**x402-SAP (Service Attestation Protocol)**, that any x402 resource server
could adopt to close this gap generally.

## Architecture overview

```
┌─────────────┐   402 + requirements    ┌───────────────────┐
│  AI Agent   │ ───────────────────────▶│   Vouch402 API    │
│  (payer)    │◀─────────────────────── │  (resource server) │
└─────────────┘   pay, retry w/ proof    └────────┬───────────┘
                                                    │ verify payment
                                                    │ (server-side)
                                                    ▼
                                          ┌───────────────────┐
                                          │  Risk scoring      │
                                          │  (reads Base RPC)  │
                                          └────────┬───────────┘
                                                    │ on success
                                                    ▼
                                          ┌───────────────────┐
                                          │  EAS attestation    │
                                          │  (fulfillment proof)│
                                          └───────────────────┘
```

## Network

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | `8453` | `84532` (Base Sepolia) |
| RPC | `https://mainnet.base.org` | `https://sepolia.base.org` |
| Explorer | basescan.org | sepolia.basescan.org |

## API

### `GET /v1/risk-score/:address`

x402-gated. First request without payment proof returns `402` carrying
two payment options, each where its own clients look for it:

- **`exact-direct`** (JSON body, `x402Version: 1`, `accepts[0]`): price,
  `payTo`, asset = USDC on Base, a `resourceId`. The caller sends a plain
  USDC `transfer` itself, then retries with header
  `X-PAYMENT: base64({ resourceId, txHash, payer, jurisdictionAttestation: true })`.
  This is what `vouch402-sdk`, the CLI, the MCP server and the website use,
  unchanged.
- **Standard x402 v2 `exact`** (`PAYMENT-REQUIRED` header, base64 JSON,
  `x402Version: 2`): network `eip155:8453` (`eip155:84532` on Base
  Sepolia), asset = USDC, `amount` = the price in atomic units, `payTo` =
  Vouch402's treasury (`0xb440b82Fb537A56eD8FC045Da622B469E88Fd2bB`),
  `extra` = USDC's EIP-712 domain (`name`/`version`). Any off-the-shelf
  x402 v2 client can pay it: the payer signs an EIP-3009
  `transferWithAuthorization` for exactly the price, the client retries
  with the `PAYMENT-SIGNATURE` header, and the server settles the payer's
  signed payment to our own treasury (it submits the authorization and
  pays the gas), then responds with a `PAYMENT-RESPONSE` header carrying
  the settlement transaction hash. The jurisdiction attestation is sent
  as a request header, the one line a standard client needs on top of
  its defaults:

  ```ts
  await fetchWithPayment(url, { headers: { "X-Jurisdiction-Attestation": "true" } });
  ```

  Only EOA (65-byte ECDSA) signatures are accepted on this path. x402 v1
  `exact` clients are not supported: the v1 client library validates
  every entry in the body's `accepts` array against a schema whose
  `scheme` is `"exact"` only, so it rejects the `exact-direct` entry that
  existing clients rely on (see `DECISION_LOG.md`).

A retried request with valid payment proof returns:

```json
{
  "address": "0x...",
  "score": 0-100,
  "signals": {
    "walletAgeDays": 0,
    "txCount": 0,
    "uniqueContractInteractions": 0,
    "flagged": false,
    "tokenizedEquityExposure": []
  },
  "attestationUid": "0x...",
  "disclaimer": "Informational only. Vouch402 does not approve, reject or recommend any transaction. The caller decides. ..."
}
```

`disclaimer` is a fixed string returned with every successful response.
It is not part of the attested payload: `responseHash` covers
`{ address, score, signals }` only, so existing verifiers are unaffected.

`score` is derived from public on-chain signals (wallet age, transaction
count, unique contract-interaction diversity, and membership on a bundled,
versioned flag list). This is a v0 heuristic, documented as such, not
presented as a complete risk model. `attestationUid` points to the
`X402ServiceFulfillment` record created for this specific response (see
below), letting any party independently verify what was returned via its
`responseHash`.

`tokenizedEquityExposure` is a list of tickers (e.g. `["NVDAc", "TSLAc"]`,
`[]` if none) among Coinbase's Base-mainnet tokenized-equity tokens (see
`src/scoring/tokenized-equities.json` for the full, independently-verified
contract list) this address currently holds a nonzero balance of, or has
ever sent/received a transaction with. Base mainnet only — always `[]` on
Base Sepolia, since these tokens don't exist there. No balance, share
count, or dollar amount is ever included, only the ticker and the bare
fact of exposure, and it never affects `score`: it's a named fact, not a
risk input, same discipline as every other signal here.

### Public results (`makePublic`)

Every fulfillment is attested on-chain either way, but the address, score,
and signals are shown on Vouch402's public activity feed only when the
payer opts in. By default a fulfillment shows on the feed as just that: a
fulfillment happened, with no address or outcome attached. Setting
`makePublic: true` on the payment proof opts that specific result into
being shown in full.

Reachable through any of the three client packages: `{ makePublic: true }`
on `vouch402-sdk`'s `getRiskScore`/`fetchScore`, `--public` on the CLI, or
the `makePublic` argument on the MCP server's `fetch_risk_score` tool. One
exception: Vouch402's own dev/test wallet shows full results by default,
without needing the flag, since its results have already been used as
public proof-of-concept data throughout this project.

### `GET /v1/metrics`

Public. Aggregate, real (not estimated) counters: unique payers, total
requests served, total volume (USDC), attestation count, dispute count.

### `POST /v1/disputes`

```json
{ "refUID": "0x...", "reasonCode": 0, "details": "string" }
```

`reasonCode`: `0 = non-delivery`, `1 = malformed-response`,
`2 = stale-data`, `3 = other`. The caller must be the original payer on the
referenced fulfillment attestation (verified via signature, not a claimed
address). Files an `X402ServiceDispute` attestation linked to the original.

## Client packages

Three thin wrappers over the same API above, none reimplementing its
logic:

- **[`vouch402-sdk`](https://www.npmjs.com/package/vouch402-sdk)**: a
  TypeScript client library (`getQuote`, `pay`, `fetchScore`,
  `verifyAttestation`, and a composed `getRiskScore`). The CLI and the
  MCP server both depend on it rather than duplicating its payment-flow
  code.
- **[`vouch402`](https://www.npmjs.com/package/vouch402)**: a CLI,
  `npx vouch402 score <address>`, for checking a single address from a
  terminal. Pays with a locally-held Foundry keystore, never a raw
  private key.
- **[`vouch402-mcp-server`](https://www.npmjs.com/package/vouch402-mcp-server)**:
  a standalone [MCP](https://modelcontextprotocol.io) server. Never
  holds a wallet or signs a transaction itself: one tool returns an
  unsigned payment quote, a second tool takes the resulting transaction
  hash from whatever wallet tooling the calling agent already has and
  completes the flow, matching this spec's "Non-custodial by
  construction" section below.

## Payment verification (server-side, mandatory)

Every paid request is verified server-side before the resource is released:

1. Reject if the payment/transaction ID has already been processed (replay
   protection).
2. Confirm the payment status is settled/completed.
3. Confirm the paying address matches the request's claimed payer.
4. Confirm amount and recipient match what was quoted in the `402` response.
5. Mark the payment as processed **before** returning the resource.

For the standard `exact` scheme, the server settles the payer's signed
payment to our own treasury only if every one of these holds, all checked
before anything is submitted: the authorization's `to` equals the treasury
(checksum-compared), `value` equals exactly the quoted price, the token is
Base USDC and the chain is the configured network (both also bound by the
EIP-712 domain the signature is recovered against), the validity window
is current, the nonce is unused (USDC `authorizationState`), and the
signature recovers to `from`. The call is then dry-run, and refused with a
`503` (nothing submitted, the authorization left unused) if its worst-case
gas cost, gas limit × max fee per gas, exceeds `EXACT_SETTLEMENT_MAX_COST_WEI`
(default `2000000000000` wei). Otherwise it is submitted with exactly those
limits pinned by Vouch402's own signer (which only ever pays gas; it is
never the recipient), and the resource is served only after the receipt confirms a
USDC `Transfer` from the payer to the treasury for exactly the price.
The settlement transaction hash becomes `x402PaymentRef` and
`authorization.from` becomes `payer`, exactly as with `exact-direct`.
There is no endpoint or tool that submits an authorization for anything
other than a paid request for this resource: one authorization pays for
exactly one request.

Frontend-reported payment confirmation is never trusted on its own.

## x402-SAP: attestation schemas (EAS, deployed on Base)

### `X402ServiceFulfillment`

```
address payer
address payee
bytes32 x402PaymentRef
bytes32 resourceId
uint8   status        // 0=fulfilled, 1=timeout, 2=error
bytes32 responseHash  // keccak256 of the exact response payload
uint64  fulfilledAt
```

Emitted automatically by the resource server immediately after a successful
(or failed) fulfillment of a paid request. Attestations are immutable by
design (EAS), so outcomes are never edited after the fact: a disagreement
is expressed as a separate, linked attestation instead (below).

### `X402ServiceDispute`

```
bytes32 refUID       // UID of the disputed X402ServiceFulfillment attestation
address disputant
uint8   reasonCode    // 0=non-delivery, 1=malformed-response, 2=stale-data, 3=other
string  details
```

### Known v0 limitation

Fulfillment attestations in this version are self-attested by the resource
server (the seller), not by a neutral third party. This is an intentional,
explicitly-scoped starting point: it establishes the data format and
produces a real, queryable fulfillment history, while decentralized or
neutral-party verification (e.g. staking/slashing, multi-attester
consensus) is left as a deliberately separate, future layer built on top of
this data, not solved by this specification.

## Builder Code attribution

All outgoing onchain transactions carry ERC-8021 attribution
(`ox/erc8021`), configured at the client level so no transaction is sent
unattributed.

## Non-custodial by construction

Vouch402 never holds, custodies, or transmits funds belonging to a third
party. It sells data for a fee paid directly to its own receiving address.
It is not an intermediary between any two other parties' funds, and it does
not offer custody, exchange, or transfer of virtual assets to its users.
On the standard `exact` path the server submits the payer's own signed
transfer, whose only possible recipient is Vouch402's treasury, as payment
for this one request; the signer wallet that submits it pays the gas and
never receives or holds the funds.

## Testing

Integration tests exercise the full flow against Base Sepolia: unpaid
request -> `402` -> real testnet USDC payment -> retried request -> `200` with
score + attestation UID -> attestation independently resolvable via EAS.
The standard `exact` scheme is exercised end-to-end with the official
x402 v2 client (`@x402/fetch` + `@x402/evm`) paying a local server, and
every rejection rule above has its own unit test.
Disputes are tested by filing one against a known fulfillment attestation
and confirming the `refUID` link resolves correctly.

## Roadmap (technical)

The attestation data this service produces, a growing, queryable graph of
`(payer, payee, outcome, dispute)` records, is designed to be consumable
by future systems that need agent reputation or dispute-resolution
signals, without requiring those systems to re-instrument every individual
x402 resource server themselves.
