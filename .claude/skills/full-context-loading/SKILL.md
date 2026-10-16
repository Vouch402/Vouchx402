---
name: full-context-loading
description: >
  How every answer in this project should already reflect the full
  stack of available context — this project's CLAUDE.md/AGENTS.md,
  persistent memory, this project's own hand-built skills, Claude's
  global skills, and any installed community/network skill packages —
  without re-reading everything on every turn or bloating token usage.
  Covers what already loads automatically for free, what the actual
  discipline fix is (checking what exists before answering from
  scratch), what NOT to do (force full preload of every skill body),
  and a live inventory of what exists in this project so a fresh
  session doesn't have to rediscover it. Use at the start of a new
  session, when asked "do you have full context," or whenever an
  answer risks being generic instead of grounded in what this project
  already knows.
---

# Full context loading — every answer grounded, without re-reading everything

## What already loads automatically, every session, at zero extra cost

No action needed for these — verify they're actually true for this
project, then treat them as given:

- **`CLAUDE.md` (and any file it imports, e.g. `AGENTS.md`)** — injected
  as project instructions automatically at session start. This is where
  this project's hard rules and file map should already live.
- **The persistent memory system**, if this project has one — its
  index file (commonly `MEMORY.md`) loads automatically every session;
  the full content of any individual memory entry loads only when
  read. Check the index before answering something it might already
  cover — don't re-derive a fact memory already has.
- **Every installed Skill's name + description** — Claude Code shows
  this list automatically at session start, at a cost of tens of tokens
  per skill. The **full body** of a skill loads only when a task
  matches its description (via the `Skill` tool) or is loaded here
  explicitly. **This is already the token-saving mechanism this project
  needs — it does not need to be rebuilt.**

## The real fix: actively check before answering, don't wait to be told

The gap this skill exists to close isn't a missing preload — it's a
session answering a non-trivial request as if none of the above
existed, when a quick check would have surfaced something directly
relevant. Before answering anything beyond a trivial or purely
conversational request, run this check:

1. **Does an available Skill's description match this task?** If yes,
   invoke it (`Skill` tool) instead of reasoning from scratch what it
   already documents.
2. **Does this project's memory index name something relevant?** Read
   that entry before asserting a fact "from nothing" — a past
   correction, a verified figure, a standing decision may already be
   there.
3. **Does a playbook or reusable-process doc this project actually
   has** (only if one exists — don't assume a `playbooks/` folder
   exists just because another project has one) **already cover this
   kind of task?**
4. **Is there a community/network skill package installed** that's more
   current than what's in memory or in a hand-built skill? Skill
   packages get updated independently of this project's own memory.

This is a discipline to apply every time, not a one-time setup step —
don't answer from a blank slate what an already-available resource
already covers.

## What NOT to do — don't force full preload

Loading every skill's entire body and every memory entry into context
on every session start would cost real tokens for content irrelevant
to most requests — this directly fights the goal of not wasting
tokens, not serves it. The name+description-only preload already IS
the correct mechanism for exactly this tradeoff: cheap awareness that
something exists, full cost only when it's actually used. Don't try to
route around it by dumping full content somewhere it'll be re-read
every turn.

## Inventory — what exists in THIS project right now

Verified 2026-09-17 directly against the real filesystem/tool output —
not copied from another project.

- **Claude's own global skills** (`~/.claude/skills/`) — this machine
  is shared with other, unrelated projects (mostly Hedera- and
  Stellar-focused; dozens of the global skills are theirs, not
  Vouch402's — check a skill's actual description before trusting it
  here). Ones that genuinely match this project's own domain
  (Express + TypeScript API, Next.js/React/Tailwind frontend on
  Vercel, vitest tests):
  - `nextjs-react-typescript` — Next.js App Router / React / Shadcn /
    Tailwind, matches `web/`'s real stack.
  - `express-typescript` — matches the root API's real stack.
  - `vitest-testing-patterns` — matches `sdk`/`cli`/`mcp-server`'s real
    test runner.
  - `deploy-to-vercel` — matches `web`'s real deploy target.
  - `playwright` — relevant if real browser/E2E verification of `web/`
    is ever needed (this project has hit that exact gap before — no
    browser tool available in some sessions, verification had to fall
    back to build/typecheck output instead).
  - **`x402-payments` exists globally but is a name trap — it's
    Hedera's x402 scheme** (native HBAR payments, a self-hosted Hedera
    facilitator), unrelated to Vouch402's own "exact-direct" x402
    scheme on Base (a plain on-chain USDC transfer + tx-hash proof, no
    facilitator at all). Do not consult it for anything x402-related
    here — same kind of same-name-different-project trap as
    `@base-ui/react` (MUI's "Base UI," unrelated to Coinbase Base) —
    see `DECISION_LOG.md`, 2026-09-11.
  - `solidity-security` exists globally but doesn't apply — this
    project has no custom Solidity contracts (`contracts/` in this
    repo means EAS schemas registered via the SDK, not deployed
    contracts; see `AGENTS.md`).
- **This project's own hand-built skills** (`.claude/skills/` in this
  repo):
  - `mainnet-payment-handoff` — real Base mainnet payment handoff
    recipe (no fund-moving credentials in this environment).
  - `npm-publish-handoff` — real npm publish handoff recipe (no npm
    credentials in this environment).
  - `teammate-commit-identity` — how to commit under a real teammate's
    own GitHub identity safely in this shared environment.
  - `claude-antigravity-setup` — session/config setup notes.
  - `full-context-loading` — this file.
- **Skills adapted from an external reference implementation, localized
  to Vouch402's own facts on 2026-09-17:**
  - `mexico-legal-check` — the four-test Mexican regtech read
    (IFPE/LFPIORPI/24 Bis 4/LMV), rewritten for Vouch402 specifically:
    points at this project's own `[[project_lfpiorpi_seccion_xvi_date]]`/
    `[[project_jurisdiction_blocklist]]` memory and `web/content/
    legal-en.md`/`legal-es.md` section 4 instead of the (dead-here)
    wikilinks the original reference copy had. Corrects a factual
    overstatement the original made — Vouch402's own `/legal` doc
    leaves the Art. 24 Bis 4 and LMV/CNBV questions (tests #3-4)
    **deliberately open**, not "clean."
  - `grants-track-record`, `hackathon-fit-check`, `public-claim-verify`,
    `repo-security-sweep`, `doc-accuracy-audit` — generic process
    skills, no project-specific content to localize, installed as-is.
- **Community/network skill packages installed** (via `npx skills`,
  vendored in `.agents/skills/`, real (non-symlink) copies in
  `.claude/skills/` — the symlinks that used to connect them were
  found and dereferenced 2026-09-17, see `DECISION_LOG.md`):
  - `base-mcp`, `build-on-base` — from `base/skills` (the official
    Coinbase/Base repo — confirmed via `gh api` that this repo only
    has 3 skills total, no more; several skill names circulated
    outside this project, like `base-account`/`x402`/`builder-codes`/
    `deployment`/`migrations`, do **not** actually exist in it).
    **`build-on-base` was stale as of 2026-09-17** — upstream removed
    its Base Account and migration content that same day (`base/skills`
    PR #162); re-synced to match upstream exactly.
  - `vibenet` — also from `base/skills`; Base's experimental devnet
    for native account abstraction (EIP-8130) and gas sponsorship
    (ERC-8168). Reviewed in full before trusting it (a scanner flagged
    "Med Risk" on install): its one script clones and builds a
    third-party fork of `viem` (`chunter-cb/viem`, the same branch
    backing open PR `wevm/viem#5004`) because the feature isn't in
    published `viem` yet — legitimate and well-documented, but a real
    thing to be aware of if it's ever actually run (trusts a fork, not
    the official npm package). Not currently used anywhere in this
    project. Confirmed still matches upstream exactly (2026-09-17).
  - `base` — from `bytesagain/ai-skills`, a large, unrelated-content,
    community-aggregated skill marketplace (hundreds of skills on
    everything from cooking to crypto tax); its `base` entry is not a
    curated Base-ecosystem resource, just one folder among hundreds.
    Treat with lower trust than the two `base/skills` entries above.
- **Playbooks** (`playbooks/` in this repo, referenced from
  `AGENTS.md`'s "Session hygiene" section):
  - `playbooks/continue.md`
  - `playbooks/images.md`
- **Persistent memory** — the real index is
  `C:\Users\vaios\.claude\projects\c--DaAps-Vouch402\memory\MEMORY.md`
  (loads automatically every session). **Name collision to watch for**:
  this repo also has `DECISION_LOG.md` at its root — a *different*
  thing with a *different* purpose. `DECISION_LOG.md` is a public,
  git-tracked, narrative engineering record for humans (reviewers,
  teammates) — every non-trivial decision/bug/finding, dated, with how
  it was verified (mandatory per `AGENTS.md`). The memory index above
  is private, session-to-session operational memory for Claude
  specifically (facts, standing corrections, gotchas). Both matter;
  neither substitutes for the other. When in doubt about "does this
  count as memory," it's `MEMORY.md`'s index — `DECISION_LOG.md` is
  the project's own documentation, not this mechanism.

## Verifying anything date-sensitive — always fresh, never from training memory

A memory entry or a skill's own text can be stale by the time it's
read. When a task needs external, current information (a price, a
version, a legal deadline, a repo's live state), verify it live via
WebSearch/WebFetch/`gh api`/`npm view` on the day it's asked, every
time — regardless of how confidently a prior memory or skill states it.

## Related

- [[project-vouch402-overview]] (memory) — architecture/deploy facts
  this inventory assumes.
- `mainnet-payment-handoff`, `npm-publish-handoff`,
  `teammate-commit-identity` — this project's own hand-built skills,
  listed above.
