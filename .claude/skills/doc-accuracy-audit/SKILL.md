---
name: doc-accuracy-audit
description: >
  Systematically check a project's docs, README, and public site against
  live reality — real published package versions, real deployed
  endpoints, real merged PRs — before citing any of it in a submission,
  public post, or new contributor's first read. Use before a grant/SCF
  submission leans on documented claims, periodically as hygiene, or
  when a doc hasn't been touched in a while but keeps getting cited.
---

# Doc accuracy audit — what the docs say vs. what's actually true

## Non-negotiables

- **A doc describing a feature is not evidence the feature exists.**
  Check every documented endpoint/method against the actual deployed
  API or actual exported code, not just against the doc's own internal
  consistency.
- **A version number in a doc is a claim, not a fact, until checked
  against the real registry.** `npm view <pkg> version`, `pip index
  versions <pkg>`, `cargo search <pkg>` — the doc's stated version can
  drift the moment a new one publishes and nobody updates every file
  that cites it.
- **The same fact stated differently in two files is a real bug**, not
  a stylistic inconsistency — one of them is wrong, find out which.

## Step 1 — Inventory every doc file that makes a factual claim

README, quickstart, any page describing an API/SDK surface, any public
site page with a specific number/version/capability claim.

## Step 2 — Verify every version claim against the real registry

```bash
npm view <package> version
pip index versions <package>
cargo search <package>
```
Flag any doc stating a version that doesn't match — including
"historically dated" mentions that were true when written (those stay,
noted as historical) vs. current-state claims that are just stale.

## Step 3 — Verify every endpoint/feature claim against the real deployed surface

```bash
curl -s <endpoint> -o /dev/null -w "%{http_code}\n"
```
For anything described as "available now," confirm it actually
responds as documented — not 404, not a stub. For SDK method claims,
grep the actual exported source for the method name, don't trust the
doc's own type signature as proof it's implemented.

## Step 4 — Verify every integration/partnership claim against a real merged artifact

```bash
gh pr view <number> --repo <owner>/<repo> --json state,mergedAt,merged
```
A claimed integration needs a real merged PR, a real transaction, or
equivalent — not just a doc saying it exists.

## Step 5 — Cross-file contradiction sweep

Grep the same fact (a fee amount, a network name, a supported asset)
across every doc file and diff the results — don't assume one canonical
file is right just because it looks more official; check which one
matches live reality.

## Output

A list of every stale/false/contradictory claim found, each with what
it said, what's actually true (with the verification command's result),
and the fix applied directly (not just flagged) — not left as a bare
finding.
