---
name: npm-publish-handoff
description: >
  How to hand off and verify an npm publish for Vouch402's three client
  packages (vouch402-sdk, vouch402 CLI, vouch402-mcp-server) when this
  environment has no npm credentials (npm whoami returns 401). Use when
  package.json versions have been bumped and need to actually go live on
  the npm registry — publish order (sdk before cli/mcp-server, since they
  depend on it), the exact commands to hand the user, and why you must
  poll the real registry afterward instead of trusting the publish
  command's own success output.
---

# npm publish handoff (Vouch402)

This environment has no npm publish credentials — confirmed via
`npm whoami` returning `401 Unauthorized`, not assumed. The user runs
the actual `npm publish` themselves, from their own authenticated
terminal. Your job: get every package.json in the right state first,
hand off the exact commands, then verify the real result against the
registry — never report a version as "published" just because a local
edit or the handoff message implied it.

## Before handing anything off

1. Confirm what's actually changed since the currently-published
   version — diff the registry against source, don't assume a version
   bump is "due" just because time passed:
   ```bash
   npm view vouch402-sdk version
   npm view vouch402 version
   npm view vouch402-mcp-server version
   ```
2. If real source changed in any of the three packages since the last
   publish, bump **all three together** to the same next version, even
   if only one package's code actually changed — this repo's own
   `AGENTS.md` convention is that these are versioned and released
   together. A change to something shared (like `repository.url`, or a
   type in the SDK that `mcp-server`/`cli` depend on) counts as
   "spanning" all three.
3. A **version-only change is enough to require a new version number**
   — npm packages are immutable once published, so even a docs-only
   README update needs its own bump; you cannot republish over an
   existing version.
4. Rebuild all three and confirm clean before handing off:
   ```bash
   cd sdk && npm run build
   cd ../cli && npm run build
   cd ../mcp-server && npm run build
   ```

## Publish order matters

`cli` and `mcp-server` both depend on `vouch402-sdk`. Always publish in
this order so a fresh `npm install` in the dependents can resolve the
just-published version:

```powershell
cd sdk
npm publish
cd ..\cli
npm install
npm publish
cd ..\mcp-server
npm install
npm publish
```

**Hand off one package's publish at a time if OTP/2FA is involved.**
Pasting the whole block at once has, in practice, caused only some of
the three to actually publish (an OTP browser-confirmation step for the
first package can eat the terminal's attention while later commands in
the same pasted block run past it). If a batch handoff comes back with
fewer than three version bumps live on the registry, don't guess why —
just ask for the remaining package(s) to be published individually.

## Verify against the real registry, not the command's own output

`npm publish`'s own "+ package@version" success line is not proof it's
live — the registry can take anywhere from instant to ~30-60 seconds to
propagate a fresh publish, especially noticeable on `vouch402-mcp-server`
in practice (it prints its own "Your package is being processed and may
take a few minutes to become available" notice; the other two packages
haven't shown that same notice but have still lagged behind on
occasion). Poll rather than declare success prematurely:

```bash
for i in 1 2 3 4 5 6; do
  V=$(npm view vouch402-sdk version 2>&1)
  echo "attempt $i: $V"
  [ "$V" = "<expected>" ] && break
  sleep 15
done
```

Once all three show the expected version, also spot-check whatever
actually motivated the republish (a `repository.url` fix, a type field,
new README content) directly against the registry — `npm view <pkg>
repository.url`, `npm view <pkg> readme | grep ...` — not just the
version number. A matching version number doesn't prove the specific
change actually shipped correctly.

## Related

- `feedback_npm_publish_handoff` (memory) — the original no-credentials
  finding.
- `DECISION_LOG.md`, 2026-09-09 entries on the `0.3.1`/`0.3.2`
  republishes for the real incident history this recipe comes from.
