# Changelog

## 1.0.1 — 2026-10-16

`1.0.0` was never actually resolvable from the registry: an earlier
publish attempt for that exact version got published and then
unpublished, and npm permanently blocks reusing a version number once
that happens. No code change from what `1.0.0` would have shipped --
see that entry below for what actually changed.

## 1.0.0 — 2026-10-07 (never resolvable on the registry, see 1.0.1 above)

No change to this CLI's own command-line interface. Bumped to `1.0.0`
and its `vouch402-sdk` dependency to `^1.0.0` to stay in step with the
other three packages (`vouch402-sdk`, `vouch402-mcp-server`, and the
root API), which do carry a breaking protocol change together — see
`vouch402-sdk`'s own `CHANGELOG.md` and the main repo's `DECISION_LOG.md`,
2026-10-07, for what changed and why.

In practice: `vouch402 score <address>` now also signs a short message
proving it controls the paying wallet, transparently, as part of the
same `getRiskScore` call this CLI already used — no new flag, no
behavior change visible at this CLI's own interface.

## 0.3.2 and earlier

Not tracked in this file; see the main repo's `DECISION_LOG.md` for the
history up to this point.
