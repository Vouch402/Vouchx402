# continue.md — resume a session without wasting extra tokens

## What `claude --continue` (or `-c`) actually does

Confirmed, can't be changed from a project file: `--continue` reloads
the full conversation — every prompt, every file change, every
decision — by design, not a light summary. It loads the most recent
conversation in the current folder, no ID needed. If you genuinely want
something lighter than a full reload, use `/recap` *inside* an already-
open session instead of reopening with `--continue` — it gives a
summary of where things stand without replaying the full history.

## The real rule for not wasting tokens on resume

The saving isn't in avoiding the reload — it's in what the session does
with the context it already has:

- Don't re-read a file that's already in the loaded context.
- Don't re-verify a fact that was already verified with a source this
  session, unless real time has passed or it's the kind of fact that
  changes fast.
- Answer directly on what's already established, instead of
  summarizing the whole history before acting.

## The zero-hallucination, fresh-information rule

Based on Anthropic's own guidance for reducing hallucinations:

- It's fine to say "I don't know" or "that needs verifying" — explicit
  permission to admit uncertainty measurably reduces false information.
- Anything date-dependent (versions, prices, platform rules, legal
  deadlines) gets verified live before being stated, never from
  training memory.
- Every claim should trace back to something verifiable — a citation, a
  link, a hash, a test. If it can't, mark it as inference.
- If something can't be confirmed, retract it instead of defending it
  just because it was already said.

## Installing this in a new project — two steps, not one

This file alone does nothing — nothing loads it automatically. Copy it
to `playbooks/continue.md` (or wherever this project keeps playbooks),
then add this to the end of `AGENTS.md`:

```
**When resuming with `claude --continue`, don't re-read what's already
in context or re-verify what's already verified this session.** Answer
directly on what's already established. Detail and why in
`playbooks/continue.md`.

**Zero hallucination. Anything date-dependent gets verified live before
being stated, never from training memory — versions, prices, platform
rules, legal deadlines.** It's fine to say "I don't know, that needs
verifying." Every claim should trace back to something verifiable; if
not, mark it as inference. Full guidance in `playbooks/continue.md`.
```
