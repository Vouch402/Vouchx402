---
name: repo-security-sweep
description: >
  Audit a GitHub account or org's real repos for exposure — leaked
  emails in commit history, the "Activity overview" setting publicly
  naming private repos, secrets committed despite a later .gitignore
  (history still has them), registry tokens without 2FA, and
  .gitignore rules broad enough to hide real tracked files from git
  entirely (the opposite failure). Use before making an account/org
  public-facing (a profile going out in an application), periodically
  as hygiene, or after any incident involving a leaked credential.
---

# Repo security sweep — real exposure, not a checklist for its own sake

## Non-negotiables

- **Inside any project repo, a skill must always be a real, tracked
  copy — never a symlink to a gitignored folder. This is a mandatory
  default here, not a case-by-case judgment call**, because every
  project in this operator's workflow gets pushed to GitHub and cloned
  elsewhere — there is no "local-only, never leaves this machine"
  project to make an exception for. A skill symlinked from
  `.claude/skills/<name>` to `.agents/skills/<name>` *inside a repo*
  breaks the moment that repo is cloned somewhere `.agents/` doesn't
  exist. Treat any such symlink found during a sweep as a finding to fix
  immediately, no exception clause needed.
  **The one genuinely different case, not covered by the rule above:**
  a *global*, non-repo directory in the user's own machine profile
  (`~/.claude/skills/<name>` → `~/.agents/skills/<name>`), managed by a
  real package-manager lockfile (`~/.agents/.skill-lock.json` or
  equivalent — its presence confirms intentional tool state, not an
  accident). That one is never inside a git repo, never gets cloned, and
  should be left alone — converting it to a real copy breaks the tool's
  ability to update it later. The test is simple: is this path inside a
  project repo (fix it) or in the user's home directory outside any repo
  (leave it)? Not "check case by case" — just confirm which of the two
  buckets the path falls in.
- **A .gitignore added today does not protect history already
  committed.** Check `git log --all --full-history -- <path>` for
  anything sensitive, not just the current working tree.
- **"Private repo" and "not publicly discoverable" are different
  claims.** GitHub's "Activity overview" toggle on a profile can name
  private repos publicly even though their content stays hidden —
  check this explicitly, don't assume private means invisible.
- **A .gitignore can fail in either direction** — too narrow (leaks a
  secret) or too broad (silently excludes real files, like `SKILL.md`,
  from ever being tracked, so they vanish on a fresh clone). Check both.

## Step 1 — Email exposure across every repo

```bash
gh api users/<username>/repos --jq '.[].full_name' --paginate
# per repo:
git log --all --format='%ae %ce' | sort -u
```
Flag any personal email that shouldn't be public, across every repo —
including old/dead ones, which are often forgotten.

## Step 2 — The "Activity overview" gotcha

Check the account's own profile settings for whether private
contribution activity is set to show repo names publicly. If so, every
private repo's name (not content) is discoverable from the profile page
— decide deliberately whether that's acceptable, don't leave it as an
unconsidered default.

## Step 3 — Secrets committed despite current .gitignore

```bash
git log --all --diff-filter=A --name-only | grep -iE '\.env|secret|key|token|credential' | sort -u
```
For each hit, check whether it's still in history even if a later
commit removed/gitignored it — a removed file's content is still
retrievable from history unless the repo's history was actually
rewritten and force-pushed (a separate, higher-stakes fix).

## Step 4 — Registry tokens without 2FA

Check `~/.npmrc` (or equivalent for other registries) for a token, and
confirm the account it belongs to has 2FA enabled — a no-2FA token is a
single point of failure for publishing malicious versions of real
packages.

## Step 5 — .gitignore over-exclusion check

```bash
git ls-files | grep -c "SKILL.md\|<other real file pattern>"
git check-ignore -v <path-to-a-file-that-should-be-tracked>
```
Confirm files that should be tracked actually are — a broad rule (`*.md`,
`*.json`) can silently exclude real content from ever reaching a fresh
clone or a machine change.

## Step 6 — Dead repos

List repos with no activity in a long time that are still public and
serve no purpose — consider making them private rather than leaving
old, unmaintained code as a public surface.

## Output

A findings list, each with the real verification command used and its
result, fixed items marked with the actual commit/setting-change that
resolved them — not just "checked, looks fine."
