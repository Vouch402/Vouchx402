---
name: teammate-commit-identity
description: >
  How to commit real work under a teammate's own GitHub identity (not the
  primary account this environment runs as) when that teammate is
  present, aware, and has explicitly consented — without touching global
  git config, without assuming a signing key transfers between people,
  and without silently mixing identities into the wrong commit. Use when
  a real second contributor wants their name/email on a commit for work
  they own credit for (e.g. a co-founder present in the same session),
  and they've provided their own GitHub token/key material themselves.
  Covers isolated per-identity config, GitHub's per-account signing-key
  binding, and a real amend-the-wrong-commit gotcha.
---

# Committing under a teammate's real identity

This is about attribution accuracy, not a technical trick — every step
here exists to make sure a commit that says "Jane Doe" really was
authorized by Jane Doe, and that doing this never puts the primary
user's own git identity or signing setup at risk. **Never do any of
this without the real user explicitly confirming, in this conversation,
that the teammate is aware and consents** — not inferred, not relayed
from another session, not assumed because credentials happen to be
present in the environment. If you find a second account's credentials
already logged into `gh auth status` without having been told about
them, that's a fact to report and ask about, not permission to act.

## Step 1: Get the teammate's real identity, don't guess it

```bash
gh auth switch --user <their-login>
gh api user --jq '{login, name, email}'
```

Their public email is very likely `null` (privacy setting, common) and
their token likely lacks the `user:email` scope (`gh api user/emails`
returns `403`). Don't guess an email or ask them to expose a private
one. Use GitHub's own standard, real, verifiable format instead:

```bash
gh api users/<their-login> --jq '.id'
# -> construct: <id>+<login>@users.noreply.github.com
```

This is the exact address GitHub itself generates and links to their
real profile — not a workaround, the correct way.

## Step 2: Never touch `--global` config for their identity

`git config --global user.name/user.email/...` would change *every*
future commit in *every* repo on this machine, including the primary
user's own — breaking their own commits' attribution or signing the
moment they next commit anything, anywhere. Two safe alternatives,
neither touches global config:

**One-off commit** — inline `-c` overrides, scoped to that single
invocation only:
```bash
git -c user.name="<Name>" -c user.email="<id>+<login>@users.noreply.github.com" \
  commit -m "..."
```

**Repeated commits across a session** — an isolated config file plus
`GIT_CONFIG_GLOBAL`, which replaces (not merges with) the resolved
global config for that one command only:
```bash
git config --file ~/.gitconfig-<name> user.name "<Name>"
git config --file ~/.gitconfig-<name> user.email "<id>+<login>@users.noreply.github.com"
# ... then, per commit:
GIT_CONFIG_GLOBAL=~/.gitconfig-<name> git commit -m "..."
```
Verify after setting either one, by reading back `git config --global
--list` (should show zero difference from before) — don't just trust
that `-c`/`--file` "should" have stayed isolated.

## Step 3: Signing keys are bound per-account, not reusable

If the repo or the teammate wants commits to verify as `Verified`, do
**not** assume any SSH/GPG key already working for the primary user's
own commits will also verify for the teammate — GitHub checks a
signature against the keys registered to that specific commit's
author/committer *account*, not "is this a valid key at all." Reusing
the primary user's key for a different identity produces exactly this:

```json
{"verified": false, "reason": "unknown_key"}
```

If the teammate has their own signing key already registered on their
account, use it explicitly (same `-c`/`--file` pattern, adding
`gpg.format=ssh`, `user.signingkey`, `commit.gpgsign=true`). If they
don't, either:
- generate a new one **only after the real user explicitly confirms
  it, in this conversation** (it's real key material representing a
  real person — treat that confirmation as seriously as any other
  identity-sensitive action), have them register it as an *additional*
  signing key on their own account (GitHub allows several), or
- commit unsigned (`-c commit.gpgsign=false` to override an ambient
  global `gpgsign=true`) — a correctly-attributed unsigned commit is
  still fully legitimate; a signature that fails verification is not
  an improvement over no signature.

**Always verify the actual result on GitHub, not local output:**
```bash
gh api repos/<owner>/<repo>/commits/<sha> --jq '.commit.verification'
```

## Step 4: Confirm `HEAD` before any `--amend`

If fixing or re-signing a commit after the fact, `git commit --amend`
always targets `HEAD` — which may not be the commit you think it is,
especially mid-session with other commits landed since. Amending the
wrong commit silently mixes one identity's config into an unrelated
commit's author/committer/signature fields. **Check first:**
```bash
git log --oneline -5
git show -s --format="Author: %an <%ae>%nCommitter: %cn <%ce>" HEAD
```
If the target isn't `HEAD` anymore, don't force it — split and replay
instead: `git reset --soft <parent-of-target>` (never `--hard`; it
doesn't touch the working tree and most auto-mode classifiers won't
block it, whereas `--hard` typically will, correctly, as irreversible),
then re-stage and re-commit each affected file group separately under
its correct identity, verifying each resulting commit's author and
content diff (`git diff <old> <new>`, expect byte-identical) before
pushing.

## Step 4b: Reusing the same key across multiple environments/windows

A signing key is registered to a GitHub *account*, not to a specific
repo or machine — the same key can validly sign commits in as many
projects/sandboxes as you copy it to, with no extra GitHub-side setup
per project. Prefer this over generating a fresh key per project: fewer
keys to manage, same real result. Two real gotchas hit copying a key
from a Windows-native environment into a WSL/Linux one (both fixed the
same way each time it recurred):

1. **Private key permissions.** Copying via a Windows-mounted path
   (`/mnt/c/...` in WSL) does not preserve/enforce Linux file
   permissions — the key lands world/group-readable, and SSH will
   refuse to use it. Fix: `chmod 600` the private key, `chmod 644` the
   `.pub`, right after copying, every time.
2. **The `signingkey` path in the config file is filesystem-specific.**
   A path that works in one environment (e.g. `C:/Users/x/.ssh/...` in
   Git Bash on Windows) is meaningless in another (WSL needs
   `/home/x/.ssh/...` or `~/.ssh/...`). Don't assume a copied config
   file's key path is still correct — check the target environment
   first (`echo $HOME` for bash/WSL, `echo %USERPROFILE%` for native
   Windows) and overwrite just that one line if needed:
   ```bash
   git config --file ~/.gitconfig-<name> user.signingkey ~/.ssh/<key>.pub
   ```

Always re-verify with the real `gh api .../commits/<sha>` check in the
*new* environment after copying — a working setup in one place doesn't
confirm it works in another.

## Step 5: This usually means a force-push — get sign-off, twice

Fixing an already-pushed commit's identity or signature rewrites public
history. Use `git push --force-with-lease` (refuses if the remote moved
unexpectedly since your last fetch), never a bare `--force`. Treat the
force-push itself as its own separate outward-facing action needing the
real user's explicit go-ahead — approval to fix the underlying mistake
is not automatically approval to rewrite what's already public.
Verify the push landed with the real API, not the push command's own
"forced update" line:
```bash
gh api repos/<owner>/<repo>/commits/master --jq '{sha, author: .commit.author.name}'
```

## Related

This skill was written generically so it can be copied into other
projects' `.claude/skills/` as-is. The specific real-world case that
prompted it (a co-founder's actual key paths, config file, and the
amend-the-wrong-commit incident) lives in that project's own memory —
not duplicated here, since the details (whose identity, which keys)
are project- and person-specific and would go stale here immediately.
