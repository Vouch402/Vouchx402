---
name: grants-track-record
description: >
  Research real past winners/beneficiaries of hackathons, grants,
  accelerators, and foundation programs for a given ecosystem, verified
  against primary sources, extracting real patterns (team composition,
  technical depth, stated vs. revealed judging criteria) — never served
  as a stale snapshot. Use before deciding whether to apply to a
  program, before sizing an ask, when asked "who usually wins this," or
  before citing a program's track record in a submission.
---

# Grants track record — real winners, real patterns, always re-verified

## Non-negotiables

- **Primary source only.** The program's own announcement, its GitHub
  org's real repos, its own winners page — never a secondary aggregator
  or a blog post summarizing "notable winners." Aggregators get names,
  amounts, and dates wrong.
- **A past research pass is dated the moment it's written.** State the
  verification date on every finding. When asked something forward-
  looking ("who's likely to win now," "is this still the right fit"),
  re-verify live — don't serve last month's pass as current.
- **"Won" and "participated" are different claims — verify which one is
  true.** A project listed on a hackathon's public roster may not have
  won anything; check the actual results/winners announcement, not the
  entrants list.

## Step 1 — Identify the real programs for this ecosystem

Name them explicitly, verified — don't assume a well-known network has
exactly one flagship program. Check the network's own foundation site,
its GitHub org, and its official Discord/Twitter for anything
hackathon/grant/accelerator-shaped currently or previously run.

## Step 2 — For each program, find real past cohorts

```bash
gh api orgs/<program-org>/repos --jq '.[].name' --paginate
WebSearch: "<program name> winners <year>" / "<program name> results announcement"
```
Prefer the program's own results page or announcement post over a
recap article. If a winner's project has a public repo, confirm it's
real (not archived immediately after winning, has actual commits from
before the deadline, not just a README).

## Step 3 — Extract patterns, stated as mechanisms not adjectives

For each program, after 3+ verified past winners:
- Team size at time of winning (solo vs. multi-person)
- Technical maturity at submission (a working demo vs. a pitch deck)
- What the judging criteria *say* they value vs. what actually won
  repeatedly (these diverge often — note both, separately)
- Whether winners tend to be pre-existing projects extending into the
  program's thesis, or genuinely built during the window — this
  directly informs whether reusing existing work is normal practice for
  this specific program or would read as gaming it (see
  `hackathon-fit-check`).

## Step 4 — Track "what didn't win and why," when available

Often more informative than the winner list — if a program publishes
runner-ups or gives public feedback, capture the stated reason for not
winning. A pattern of "strong tech, weak team story" across several
non-winners is a real, actionable signal.

## Step 5 — Never present a rebrand/win's financial impact without a source

If asked "which wins are worth the most," the honest answer is prize
amount (verified) plus relationship value (real, but not a dollar
figure) — never invent a follow-on-funding or valuation claim tied to a
specific win unless independently sourced and cited.

## Output

One file per ecosystem/program, structured: program name, real prize
history (amount + date + source), 3+ verified past winners with what
they built, extracted patterns (Step 3), and a **"Last verified"**
date at the top. Re-run Steps 1-4 before any decision leans on this
file if the date is more than a few weeks old.
