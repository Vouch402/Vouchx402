# images.md — paste images, screenshots and links without wasting tokens

## What actually costs tokens

Confirmed against `platform.claude.com/docs/en/build-with-claude/vision`:
Claude sees images in 28×28-pixel patches, not file weight. The formula
is `tokens = ⌈width / 28⌉ × ⌈height / 28⌉`. Cropping cuts tokens
proportional to the area removed — compressing the file (JPEG/WebP)
does not reduce tokens at all, and heavy compression can hurt text
legibility, which the official docs flag as a real risk, not just a
non-benefit.

Each model has a native resolution ceiling. Claude 4.7+ models (high-
resolution tier) cap at 2576px long edge / 4784 visual tokens; all other
models (standard tier) cap at 1568px / 1568 tokens. A full 1920x1080
screenshot costs 2691 tokens uncropped on the high-resolution tier,
versus 1560 on standard (auto-downscaled to 1456x819). Claude does not
read image metadata (EXIF, GPS) — stripping it does not save tokens.

## Request limits

20 images per turn on claude.ai; 100 per API request for 200k-context
models, 600 for others; 8000x8000px max dimension; 10MB max size
(base64) on the direct API and claude.ai, 5MB on Bedrock/Google Cloud;
JPEG, PNG, GIF (first frame only), WebP supported.

## Why batching beats pasting one at a time

Confirmed against `platform.claude.com/docs/en/build-with-claude/prompt-caching`:
images can be cached like text blocks, but adding or removing an image
anywhere in the prompt invalidates the message cache from that point
forward. A cache read costs ~10% of base price; a fresh cache write
costs 125% (5-min TTL) or 200% (1-hour TTL). Pasting five related
screenshots across five separate turns forces five full cache rewrites;
pasting them together in one message pays for one.

## Pasting in Claude Code

Confirmed against `code.claude.com/docs/en/common-workflows`: drag-and-
drop, Ctrl+V (Cmd+V also works in macOS iTerm2), or a direct file path.
No Claude-Code-specific size limit lower than the general API limits is
stated on that page — don't repeat third-party figures (e.g. a "5MB
Claude Code limit") as confirmed fact without a citation.

## Checklist before pasting

1. Crop to the relevant region instead of the full screen — the highest-
   impact technique, free, no tooling needed.
2. Don't over-compress dense text (terminal, code, dashboards) — the
   official docs warn this can make text illegible, which hurts analysis
   quality more than the tokens saved are worth.
3. Batch related screenshots into one message instead of separate turns.
4. If the content already exists as text in the repo, reference the file
   directly instead of screenshotting it.
5. For links and research, paste the URL and let WebFetch/WebSearch pull
   it as clean text instead of screenshotting a browser tab.

## Installing this in a new project — two steps, not one

Copy this file to `playbooks/images.md`, then add this to the end of
`AGENTS.md`:

```
**Image token cost is area-based, not file-weight-based — crop to the
relevant region before pasting.** Compressing the file (JPEG/WebP)
doesn't reduce tokens and can hurt text legibility; cropping dimensions
does. Detail and verified figures in `playbooks/images.md`.

**Batch multiple images into the same turn instead of pasting them one
at a time across separate turns.** Each new image invalidates the
prompt cache from that point forward — pasting one at a time forces
repeated cache rewrites instead of cheap reads. Detail in
`playbooks/images.md`.
```
