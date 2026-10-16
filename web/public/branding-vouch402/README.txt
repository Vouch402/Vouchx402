VOUCH402 — BRAND ASSETS PACK
=============================
Built 2026-09-18. First-ever logo for this project (there was no
previous logo — this replaces nothing).

------------------------------------------------------------
1. THE CONCEPT, IN ONE SENTENCE
------------------------------------------------------------
A bold "V" (for Vouch) with a single circular opening where its two
strokes meet — that opening stands for the on-chain attestation
"seal" the product stamps on every request once payment clears (the
same idea as the product's own x402-SAP attestation layer). The
wordmark pairs "VOUCH" with "402" in a different weight and color, the
same way the product's own name already does — "402" is the real HTTP
status code ("Payment Required") this entire business is built around,
not a decorative number.

Everything here was derived from reading this project's own README and
code (the x402 pay-per-query flow, the EAS attestation layer, the
"read-only, never custodies" design rule) — not from a generic "what
looks good for a crypto product" idea.

------------------------------------------------------------
2. WHICH FILE TO USE
------------------------------------------------------------
- App icon / favicon, anywhere it'll show smaller than ~40px:
  use FAVICON files (svg/favicon.svg, png/favicon-*.png). This variant
  drops the seal-hole detail on purpose — it disappears into noise
  below ~32px, confirmed by an actual browser screenshot, not assumed.
- Anywhere 40px or larger (app store icon, a card, a doc header):
  use the full icon (svg/icon.svg for light backgrounds, svg/icon-
  on-dark.svg for dark ones, or png/icon-transparent-*.png if you need
  a raster file with a see-through background).
- Twitter/X, Discord, LinkedIn profile photo: png/avatar-800.png or
  avatar-1600.png (solid blue background, already circle-crop-safe).
- Putting the full name somewhere (a doc, a slide, a partner page):
  svg/lockup-light.svg or lockup-dark.svg (vector, best quality) or
  png/lockup-light-2000.png / lockup-dark-2000.png (raster).
- Sharing a link on social media (Twitter/Slack/LinkedIn preview image):
  png/social-banner-1200x630.png.
- Printing on paper, one ink color only: svg/icon-mono-dark.svg (dark
  ink on light paper) or icon-mono-light.svg (light ink on dark paper).
- A "this was verified on-chain" badge next to a result: svg/badge-
  verified.svg — this is the one asset that's genuinely product-
  specific (Vouch402 really does emit an on-chain attestation), not a
  generic add-on.

File naming, one pattern throughout: <thing>-<variant>-<size>.<ext>,
e.g. favicon-32.png, lockup-dark-2000.png. You can guess a filename
before opening it.

------------------------------------------------------------
3. COLOR — every value spelled out, contrast already checked
------------------------------------------------------------
Primary   Base Blue   #0052FF   (kept, not invented — this is already
                                 Vouch402's real accent color on
                                 www.vouch402.xyz; reused for ecosystem
                                 alignment with Base, not picked fresh)
Ink       Near-black  #0B0F1A   (this pack's own dark/ink tone)
White                 #FFFFFF

Contrast, computed (WCAG 2.1), not eyeballed:
  Base Blue on White ................ 5.75:1  -> passes normal text (4.5+)
  Base Blue on Ink ................... 3.33:1  -> passes icon/large-text
                                                   only (3.0+), NOT small
                                                   text (4.5+ needed).
                                                   Rule: never set small
                                                   Base-Blue text directly
                                                   on the Ink background —
                                                   that's why the dark
                                                   lockup uses WHITE for
                                                   "VOUCH" and reserves
                                                   Base Blue only for the
                                                   bigger, bolder "402".
  White on Base Blue (text on a blue panel) ... 5.75:1 -> passes normal text
  Ink on White / White on Ink (body text) ...... 19.13:1 -> excellent

Colorblindness: checked with a deuteranopia (red-green colorblindness)
simulation on the palette, and separately by looking at every mark in
plain grayscale (see qa/shot3.png rows 8). The mark never depends on
telling two similar-brightness colors apart by hue alone — it's one
hue against white/black/blue at very different brightness levvalues,
so it holds up. This is a simulation-based check, not a substitute for
testing with actual colorblind users.

------------------------------------------------------------
4. TYPOGRAPHY
------------------------------------------------------------
Geist (Bold) for "VOUCH", Geist Mono (Bold) for "402" — the exact same
type family Vouch402's own website already uses (Next.js `next/font`,
Geist + Geist Mono). Not a new choice: reused because it's already
real, already licensed, and already what a visitor sees on the live
site. SIL Open Font License 1.1 — free for commercial use, no
attribution required (github.com/vercel/geist-font). Font files used
to build this pack are bundled in fonts/ for reference.

IMPORTANT: the wordmark in every SVG/PNG here is already OUTLINED
(converted to vector paths), not live text. You do not need Geist
installed to use these files correctly — they'll look identical on any
machine. Only need the actual font files if you're setting NEW text
elsewhere in this same style (e.g., on a slide) — use fonts/Geist-
Bold.ttf and fonts/GeistMono-Bold.ttf / GeistMono-Medium.ttf.

------------------------------------------------------------
5. CLEAR SPACE & MINIMUM SIZE
------------------------------------------------------------
Clear space: keep empty space around the mark of at least the width of
one of the V's own strokes (the thicker, right-hand stroke) on every
side. This scales automatically with the mark — don't use a fixed
pixel number.

Minimum size, confirmed by an actual rendered screenshot, not a
guess:
  - Full icon (with the seal-hole): holds up clearly down to 32px.
    Below that, the hole starts reading as noise rather than a hole.
  - Favicon variant (no hole): stays legible down to 16px.
  - Print, physical: don't go below ~8mm tall for the icon alone, ~28mm
    wide for the full lockup, on the same reasoning.

------------------------------------------------------------
6. DON'T — see svg/misuse-examples/ for actual rendered examples
------------------------------------------------------------
dont-stretched.png    - squashed/stretched out of proportion
dont-recolored.png    - recolored outside the approved palette (shown
                        here in red — never happens in an approved use)
dont-rotated.png      - rotated off its upright axis
dont-shadow.png       - drop-shadowed / bevel-embossed
dont-busy-bg.png      - placed on a busy/photo background with no
                        solid scrim behind it

Also avoid, in writing: calling Vouch402 a "wallet," "exchange,"
"custodian," or "broker" — it's none of those. It computes and reports
a risk score and records an independently-verifiable attestation. Name
the real capability, not a borrowed financial-services word.

------------------------------------------------------------
7. CLEARANCE CHECK — read this before using the name anywhere new
------------------------------------------------------------
This is a risk finding, not a legal clearance. A real trademark search
service or a lawyer is the only way to actually clear a name — this is
a quick check, reported honestly:

REAL FINDING, worth knowing about: "Vouch" (vouch.us) is an active,
real, funded company — an insurance broker that explicitly serves
crypto/Web3/fintech clients, including "risk and compliance
infrastructure for crypto-native companies" (a partnership with Toku).
That is close enough to Vouch402's own space (on-chain risk
intelligence) that the shared root name "Vouch" is a genuine
consideration, not a false alarm. Their own mark, checked by screenshot
(not assumed): a wordmark-only lockup — a bold condensed dark-navy
font with a small decorative arc over the "OU", teal/mint accent color,
no separate icon. No meaningful VISUAL collision with this pack's blue
V-and-seal icon or Geist typography — but the NAME itself is shared
with a real company in an adjacent field. This alone should be raised
with an actual lawyer before "Vouch402" is used in any trademark
filing or registered-brand context, especially in insurance/risk/
compliance-adjacent marketing.

Checked and found clean, same category: Chainalysis (the closest real
peer, on-chain risk/compliance intelligence) uses an orange
interlocking-knot "C" mark, unicolor since 2019 — no shape or color
overlap with this pack.

Not fully checked: TRM Labs and Elliptic's current logos specifically —
both companies' homepages loaded an editorial/campaign takeover instead
of their normal nav at the time this was checked, so their actual mark
wasn't clearly visible in the screenshot taken. Worth a two-minute
manual look before this matters for anything formal.

------------------------------------------------------------
8. WHAT'S STILL OPEN / NOT DONE
------------------------------------------------------------
- No real legal trademark search was run (see section 7) — only a
  quick visual + name check.
- TRM Labs / Elliptic visual check is incomplete (see section 7).
- No motion/animation version (a loading-state spinner built from the
  V, a logo reveal) — not built, wasn't asked for. Would be a
  reasonable next step if this ever needs a video intro or a loading
  screen.
- No separate voice/tone or tagline-variations guide — only the one
  tagline used on the social banner ("x402-metered on-chain risk
  intelligence, attested on Base") exists; more would need writing if
  wanted.
- This is Vouch402's first-ever logo, so there's no "swap it in
  production" step pending — it hasn't been placed on
  www.vouch402.xyz yet. That's a separate, deliberate decision for
  whoever owns the site, not done automatically by building this pack.
