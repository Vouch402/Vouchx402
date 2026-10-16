---
name: public-claim-verify
description: >
  Verify every falsifiable technical claim in a public-facing draft (a
  social post, a Discord/Telegram message, a PR/issue description, a
  README section) against a primary source before it goes out — never
  publish a claim traceable only to memory or "should be right." Use
  before publishing anything with a specific technical assertion in it
  (a protocol mechanism, a named third party, a number, a limit).
---

# Public claim verify — nothing goes out unverified

## Non-negotiables

- **Every falsifiable claim gets its own check.** "Retry is bounded to
  one attempt," "the facilitator is named X," "settles in under 100
  seconds" — each is a separate thing to verify, not covered by
  verifying one of them.
- **A claim that can't be verified gets cut or softened, not published
  on the strength of how confident it sounds.** "We believe" or "in our
  design" is honest framing for something you built but haven't
  independently confirmed against upstream code; a flat assertion is
  not, if you haven't checked.
- **Never state a financial/impact number (revenue impact, valuation
  change, "X% increase") without an independent, citable source.** This
  applies to your own claims and to claims about anyone else (a
  competitor, a platform, a famous rebrand).

## Step 1 — Extract every falsifiable claim from the draft

Read the draft and list each discrete technical assertion separately —
don't evaluate the draft as a whole "does this sound right."

## Step 2 — For each claim, find the primary source

- A code-behavior claim → the actual file:line in your own repo, or the
  actual upstream library's source if you're describing its behavior
  (not your wrapper's assumption about it).
- A "named X" claim (a facilitator, a partner, a standard) → confirm the
  real named entity exists and does what's claimed, via its own docs/API,
  not a paraphrase.
- A numeric/timing claim → a real measured result (a tx hash, a log
  timestamp), not a design target stated as if achieved.
- A "first/only/nobody else" claim → an actual competitive check, not an
  assumption.

## Step 3 — Mark each claim's status explicitly

`[VERIFIED: <file:line or URL, date checked>]` or `[UNVERIFIED — cut or
soften]`. Don't let an unverified claim survive into the final text
just because rewording it felt like enough.

## Step 4 — For anything you can't verify, choose deliberately

Either cut it, soften it to what you actually know ("real financial
mechanism can't be verified" — cut the number, keep it once it's
sourced instead), or ask the one person/system that could confirm it
before publishing.

## Output

The final draft, plus a short internal note (not published) listing
what was verified and against what — so a future edit to the same claim
knows what was already checked.
