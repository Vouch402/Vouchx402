---
name: mexico-legal-check
description: >
  Checks whether Vouch402 — or any new feature/signal added to it —
  needs Mexican financial-regulatory registration: IFPE under Ley
  Fintech/LRITF, LFPIORPI's "actividad vulnerable" (art. 17 fr. XVI),
  facilitación/intermediación (art. 24 Bis 4 of the Acuerdo 115/2026
  Reglas de Carácter General — NOT the LFPIORPI law's own article
  numbering, see the law-vs-reglamento warning below), or intermediación
  con valores under the Ley del Mercado de Valores (relevant here
  specifically because of the tokenized-equity signal — see AGENTS.md's
  "Tokenized-equity data stays read-only" rule). Use when a new signal,
  feature, or on-chain instruction needs a legal-posture read before
  scaling, before citing Vouch402 as "software-only, query-only"
  traction, or before a grant/accelerator submission (e.g. Base
  Batches) leans on that claim. Covers where to get the real statute
  text and how to extract it when the PDF resists WebFetch. Adapted
  from an external reference implementation of the same Mexican-statute
  analysis and localized here to Vouch402's own facts.
allowed-tools: [Read, Write, Edit, WebFetch, WebSearch, Bash]
---

# Mexico legal check — regtech posture for Vouch402

Vouch402's standing legal defense is **"software-only, query-only,
non-custodial"** — it never holds a client balance (every x402 payment
settles atomically on-chain), never executes a transaction on a client's
behalf, and the tokenized-equity signal (`src/scoring/tokenized-
equities.json`) is explicitly read-only, never facilitation — see
`AGENTS.md`'s "Jurisdiction blocklist" and "Tokenized-equity data stays
read-only" sections, and `[[project_jurisdiction_blocklist]]` /
`[[project_lfpiorpi_seccion_xvi_date]]` in memory. This skill is the
repeatable *process* for testing whether that defense actually holds for
a specific feature, not the substantive law itself — the law's verified
facts (dates, article numbering, primary-source paths) are below in
"Already-verified reference." Re-derive nothing that's already confirmed
there; apply it to the new case.

## READ THIS FIRST — the law is not the same document as its reglamento

**Mexican financial regulation here comes in two independent layers, each
with its own article numbering, and confusing them once already produced
a real false alarm (12-sep-2026, verified and retracted before reaching
this project — the corrected, verbatim text is reproduced inline in
test #3 below, no separate memory file for it here):**

1. **The law itself** (e.g. LFPIORPI, `diputados.gob.mx/LeyesBiblio/pdf/
   LFPIORPI.pdf`) — has its own article numbers. LFPIORPI's own text has
   no "24 Bis" article of any kind (only 22 Bis, 33 Bis/Ter/Quáter, 41
   Bis, 51 Bis/Ter, 54 Bis) — true, and irrelevant to test #3 below.
2. **The reglamento/Reglas de Carácter General SHCP issues to implement
   the law**, amended periodically by a numbered **Acuerdo** (e.g.
   Acuerdo 115/2026, DOF, edición vespertina, 7-ago-2026) — has its
   **own, separate** article numbering layered on top. **Art. 24 Bis 4
   lives here, not in the law.**

**If you search only the law's own PDF for an article number and don't
find it, that does not mean the article is fabricated — it may simply
live in the reglamento instead.** Before concluding any citation
"doesn't exist," confirm which of the two document types it was
originally attributed to, and fetch *that* document specifically. This
exact mistake happened once already: a prior analysis concluded "Art. 24
Bis 4 de LFPIORPI does not exist" from checking only the law's text, and
had to retract it after being caught with a verbatim DOF citation. The
retraction is now the standing correct record — the
full verified text and the exact DOF download path that proves it are
reproduced inline in test #3 below.

## The four tests, in order

Run these in this order — each is independent, passing one does not
answer the next:

1. **IFPE (LRITF art. 22)** — does the product open or hold a per-client
   electronic-payment-fund *account* (a balance you credit/debit)? If it
   only ever moves money in one-off direct transfers with no stored
   balance per client, this is a "no."
2. **LFPIORPI art. 17 fr. XVI ("actividad vulnerable")** — is the product
   habitually and professionally commercializing or exchanging virtual
   assets as its own business (acting as the exchange), as opposed to
   selling an unrelated service that happens to be paid for in crypto?
   **This fraction has been IN FORCE since ~10-Sep-2019** (added by the
   decree published DOF 9-Mar-2018, in force the day after publication,
   with an 18-month vacatio legis on fracción XVI specifically per that
   decree's own "Disposición Transitoria" — 18 months from ~10-Mar-2018
   lands in September 2019, not a future date). It was later reformed/
   expanded (paragraphs 1-2 amended, paragraphs 3-4 added — the custody/
   consideration thresholds) by the DOF 16-Jul-2025 decree, effective
   the very next day (17-Jul-2025), with no delay of its own. **There is
   no real 17-Jan-2027 date for fracción XVI itself** — a date once
   miscalculated in this workspace by anchoring the original 2018
   decree's 18-month vacatio legis to the WRONG decree (the 2025 reform
   date instead of the 2018 origin date). See
   `[[project_lfpiorpi_seccion_xvi_date]]` in this project's own memory
   for the full correction and verification, already applied to Vouch402
   specifically. Any prior analysis that treated fracción XVI as
   "not yet enforceable, gives runway" needs re-reading against this.
3. **Art. 24 Bis 4 of the Acuerdo 115/2026 Reglas de Carácter General
   (facilitación/intermediación, does NOT require custody — this article
   lives in the reglamento, not the LFPIORPI law's own numbering, see
   above)** — the load-bearing question. **Real refinement, 12-sep-2026,
   confirmed against the article's own verbatim opening
   clause: Art. 24 Bis 4 is NOT an independent trigger separate from
   test #2 — it is interpretive/operational content anchored to fracción
   XVI itself.** Its own text opens "*Para efectos de lo previsto en la
   fracción XVI del artículo 17 de la Ley, se entenderá que se realiza la
   facilitación o intermediación...*" — i.e., it defines what "facilitar"
   and "transferir" (words fracción XVI's own text already uses) MEAN,
   and separately sets the aviso/reporting mechanics for that case
   (amount or fee charged, per the article's second paragraph). Treat
   tests #2 and #3 as one combined inquiry, not two independent gates:
   ask whether the product's infrastructure *connects, reconciles, or
   matches* a client's own buy/sell/exchange/custody operation with a
   counterparty, on the client's behalf — that functional test still
   applies exactly as before and still does not require custody — but
   frame the conclusion as "does/doesn't fall under fracción XVI's own
   facilitación/transferencia language, as defined by 24 Bis 4" rather
   than "clears test #2 but might still fail an independent test #3."
   The key distinction inside that test: being paid for your *own* work
   product (analytics, a computed result, a report) is not the same as
   *executing* someone else's transaction for them. If the product only
   ever computes and returns information, or only records a fact about a
   transaction that happened elsewhere, it does not "celebrar" or
   "conectar" that operation.
   **Generalized further, 12-sep-2026, independently confirmed
   against the primary PDF and re-checked the same day: the same anchoring pattern applies to Art.
   24 Bis 2, 24 Bis 3 (custodia), and 24 Bis 5 too — all open "Para
   efectos de [lo previsto en] la fracción XVI del artículo 17 de la
   Ley..." (24 Bis 2 uses "Tratándose de la Actividad Vulnerable a que se
   refiere la fracción XVI..." instead, same anchoring effect). **24 Bis
   6 anchors to fracción XV instead** (real-estate leasing, unrelated).
   **Correction: the base Art. 24 Bis and 24 Bis 1 are NOT part of this
   fracción-XVI-specific unit** — they're general procedural provisions
   (Aviso timing/frequency rules) that touch many different fracciones at
   once (I, II, III, V Bis, IX, X, XI, XIII, XVI among others for 24 Bis;
   all Actividades Vulnerables generally for 24 Bis 1), not XVI
   exclusively.** The actual fracción-XVI-specific interpretive unit is
   just **24 Bis 2 through 24 Bis 5 (four articles)**, not "the whole 24
   Bis block." When citing any of them, cite which specific piece of
   fracción XVI's own text it's elaborating, not just the article number
   in isolation — and don't assume 24 Bis or 24 Bis 1 share this same
   XVI-specific anchoring just because they're numbered adjacently.
   **Effective date of Art. 24 Bis 2-5 themselves, verified 13-sep-2026
   directly against the Acuerdo 115/2026's own 12 transitorios: there is
   no separate 17-Jan-2027 date for these articles.** The Acuerdo's
   Transitorio Primero sets a general 30-Nov-2026 entry into force
   "salvo las excepciones previstas en los siguientes artículos
   transitorios" — Transitorios Segundo through Duodécimo each name
   specific later dates (1-Mar-2027 for the risk-based methodology/
   Manual/Capítulos III Bis-Quinquies, 1-Jun-2027 for automated
   mechanisms, 1-Ene-2028 for the first audit period, a ~30-May-2027
   grace period — see below — plus a few 6/8/9-month relative deltas),
   **none of which name Art. 24 Bis 2, 3, 4, or 5 specifically.** By
   elimination, these four articles fall under the general rule:
   **enforceable from 30-Nov-2026**, the same date already documented
   for the Acuerdo's apparatus generally, not a distinct later one.
   This is separate from fracción XVI's own effective date (in force
   since 2019, per above) — the law's trigger has been live for years;
   the reglamento's specific elaboration of what "facilitar" means and
   its aviso mechanics becomes formally required 30-Nov-2026.
   **One real, narrower exception worth knowing, found 13-sep-2026
   (Base, caught by correctly refusing to accept the above as fully
   resolved without checking further) — Transitorio Décimo Segundo,
   verbatim:** *"Quienes realicen la Actividad Vulnerable establecida en
   la fracción XVI del artículo 17 de la Ley, que se encuentren dados de
   alta en el Portal en Internet, deberán actualizar y entregar la
   información a la que se refiere el artículo 10 Bis de estas reglas,
   dentro de los seis meses contados a partir de la entrada en vigor de
   este Acuerdo."* Narrower than it first sounds: it gives **actors
   already registered under fracción XVI before this Acuerdo** a
   6-month grace period from 30-Nov-2026 (landing ~30-May-2027) to
   *update their Art. 10 Bis registration info* (VASP registration
   details — a Capítulo II Bis matter) — it does **not** delay fracción
   XVI's own applicability, and does **not** touch Art. 24 Bis 2-5 (a
   different chapter, Avisos e Informes). Don't conflate this
   administrative grace period with a substantive delay of the
   facilitación/custodia tests — a real distinction two independent
   secondary sources got wrong, describing it as "fracción XVI delayed
   to 30-May-2027" when it isn't.
4. **LMV art. 2, "Intermediación con valores"** — only relevant if the
   product touches securities/tokenized equities specifically. Ask: does
   it (a) match buyers to sellers, (b) *execute* a securities transaction
   on a third party's behalf (as commissioner/mandatary/any capacity), or
   (c) trade its own account? A product that only reports facts about
   securities exposure, with zero valuation/profitability/buy-sell
   commentary, fails all three prongs.

## Other regimes to rule out — don't stop at the four core tests

These come up less often but each has actually mattered for a real
crypto/software product at least once. Check whichever ones are
plausible for the product in front of you; don't skip them just because
they're not in the "core four":

5. **ITF de fondeo colectivo / crowdfunding (LRITF arts. 15-21)** — does
   the product pool capital from multiple funders into a project/company/
   loan, or match investors to a specific funding target? This is a
   *separate* CNBV-licensed figure from IFPE (art. 22) — a product can
   clear the IFPE test (no stored per-client balance) and still trip
   this one if it operates a funding pool or matches funders to
   fundees, even briefly or non-custodially.
6. **Banxico Circular 4/2019 (activos virtuales)** — restricts what
   Banxico-*regulated* entities (banks, IFPEs, IFCs, ITFs already
   licensed) can do with virtual assets; it does **not** by itself
   regulate an unregulated software product. Only becomes relevant if
   the product partners with, white-labels for, or is acquired by an
   entity Banxico already regulates — check this the moment such a
   partnership is discussed, not before.
7. **Beneficiario Controlador disclosure (CFF arts. 32-B Ter/Quater/
   Quinquies)** — a general corporate-transparency regime that applies
   to essentially **every** Mexican legal entity, gated by *having a
   company*, not by activity type. Easy to conflate with LFPIORPI's
   "actividad vulnerable" AML regime (both are AML-adjacent, both use
   "Beneficiario Controlador" language) but they are legally distinct
   triggers — don't let a clean actividad-vulnerable read be mistaken
   for an exemption from this. Relevant the moment Vouch402's own
   incorporation happens (no memory entry on this yet in this project —
   flag as open, don't assume it's covered), independent of what the
   product does.
8. **Territorial/jurisdiction nexus — genuinely open, flag as inference,
   not resolved anywhere in this workspace's memory yet.** Does
   LFPIORPI/LRITF reach a product whose company and servers sit outside
   Mexico but that markets to or is used by people in Mexico? Don't
   assume either answer; this needs actual counsel before a real
   incorporation-jurisdiction decision leans on it.

## Software-only design checklist — build it so each test comes back "no"

This is the affirmative, build-time counterpart to the four diagnostic
tests above — concrete architecture choices that keep a *new* product
outside each regime from the start, instead of discovering the exposure
after it's built. Apply this whenever a new feature or signal is being
scoped, not only when auditing something already built:

- **Stay outside IFPE (test #1):** never accrue a per-client balance the
  product itself credits/debits over time. Every operation should
  settle atomically, in the same step, directly to/from the client's
  own external account or on-chain address. If the product needs to
  "hold" anything even momentarily (an escrow, a pending-settlement
  state), that state must be time-boxed and non-custodial (the client's
  own signature/key still controls release), not a balance the product
  can move unilaterally.
- **Stay outside LFPIORPI actividad vulnerable / art. 17 fr. XVI
  (test #2):** don't be the counterparty that buys, sells, or exchanges
  virtual assets as your own business. Sell an unrelated service
  (compute, data, infrastructure, attestation) that merely happens to
  be *paid for* in a virtual asset — being paid in crypto for your own
  product is not the same as commercializing virtual assets yourself.
  If the product's core function *is* virtual-asset exchange, this
  design checklist doesn't apply — that's a real regulatory posture to
  plan for directly, not something to architect around.
- **Stay outside Art. 24 Bis 4 facilitación/intermediación (test #3,
  the one that does NOT require custody and is the easiest to trip
  by accident):** the product's infrastructure must never be the thing
  that *connects, reconciles, or matches* two other parties' operation.
  Concretely: expose only "compute and return a result" or "record/
  report a fact about something that already happened elsewhere"
  functions. The moment your servers relay, route, or match an
  instruction between a client and a counterparty — even non-
  custodially, even for a flat fee unrelated to transaction value — you
  are inside this article's functional test, not outside it. A pure
  oracle/data/attestation service that never sits between two
  transacting parties is the cleanest shape here — exactly Vouch402's
  own risk-score/attestation model.
  **A pure-fiat product is not automatically exempt from this test just
  because fracción XVI excludes fiat-denominated value** — confirmed by
  a 12-sep-2026 analysis of a fiat payment-rail bridge scenario. Art. 24
  Bis 4 covers "quien facilite... la intermediación de
  flujos en moneda nacional o divisas" explicitly, so a bridge that only
  ever moves fiat can still be inside this article if it's connecting an
  operation where *some* ASE in the chain touches a real virtual asset.
  The right question isn't "what currency does my own leg move" — it's
  transaction *topology*: does anything your infrastructure connects,
  anywhere in the chain, on either side, convert to/from a virtual asset
  on a client's behalf? If yes, this test is live regardless of which
  currency your own component happens to touch.
- **Stay outside LMV intermediación con valores (test #4):** never
  operate anything that matches buyers to sellers of securities/
  tokenized equity, never execute a securities transaction on a third
  party's behalf in any capacity (comisionista, mandatario, apoderado),
  never trade a securities position for your own account as part of the
  product. A feature that only *reports* a fact about securities
  exposure (a computed number, a balance readout) with zero valuation
  commentary, profitability claims, or buy/sell suggestion stays outside
  all three prongs — the moment any of those three appear in the UI
  copy, re-run this test.
- **Stay outside the crowdfunding/ITF trigger (item #5 above):** don't
  pool capital from multiple funders toward one funding target inside
  the product itself, even transiently. If a feature looks like
  "several people contribute toward X," route it through a licensed
  third party rather than building the pooling mechanic in-house.
- **Watch the language, not just the code — a real, repeated lesson.**
  A technically clean, non-custodial architecture can
  still read as regulated activity to a reviewer or regulator if the
  product's own docs/marketing use words like "wallet," "exchange,"
  "custody," "broker," "intermediary," "matching engine," "asesor,"
  "comisionista," "fondo," "deposit," or "balance" loosely. Name the
  actual capability (compute, attest, route information, settle
  directly between two self-custodied parties), not a financial-services
  category word — the same "name the real capability, not a loaded
  category word" lesson applies to Vouch402's own docs (risk score,
  attestation, x402-SAP) as much as to the regulatory framing here.

## Getting the real statute text

Never rely on a compliance blog, a search-engine summary, or a secondary
aggregator (leyco.org, regcheq, etc.) as the final word — this workspace
has caught secondary sources getting article numbers and even the literal
wording wrong twice. Always get the primary text:

- **Federal statutes** (LFPIORPI, LRITF, LMV): `diputados.gob.mx/LeyesBiblio/pdf/<ACRONYM>.pdf`, e.g. `LMV.pdf`, `LFPIORPI.pdf`.
- **DOF publications** (specific Acuerdos, reforms): `dof.gob.mx/nota_detalle.php?codigo=<CODE>&fecha=<DATE>` — note the real download path is `nota_to_pdf.php` → a client-side JS redirect to `abrirPDF.php?archivo=...`, which automated fetch tools often miss, following the wrapper page instead.

**Extraction, in order of preference:**

1. **`pdftotext` first.** WebFetch's own text extraction fails on these
   long PDFs ("compressed/encoded stream data"). Download the PDF (WebFetch
   saves it locally even when it can't extract text — check the tool
   result for the saved path), then:
   ```
   pdftotext <file>.pdf <file>.txt
   grep -n -i "<term>" <file>.txt
   ```
   `pdftotext` ships with Git for Windows at
   `Program Files\Git\mingw64\bin\pdftotext.exe` — usually already on
   `PATH`. This worked cleanly for LMV art. 2 (7-sep-2026) where WebFetch
   and the Read tool (missing `poppler` for page rendering) both failed.
2. **Real browser session with Ctrl+F, if `pdftotext` isn't available or
   the PDF is itself an image scan.** This is how 24 Bis 4's exact text
   was first confirmed (18-Aug-2026) when automated fetch kept truncating
   mid-document.
3. **`dof.gob.mx/nota_detalle.php?codigo=<CODE>&fecha=<DATE>` as an HTML
   alternative to the PDF — but its markup wraps almost every single word
   in its own `<span>`, so a plain `grep`/text-search on the raw HTML
   finds nothing even though the words are right there.** Fix: fetch the
   HTML, strip tags and HTML-unescape it in a small Python/Node snippet
   first, then grep the cleaned text — confirmed working, 12-sep-2026.
   Also note: the `www.` subdomain of this host fails TLS cert
   validation; use the bare `dof.gob.mx` host.
4. **Cross-verify with a second independent method** before treating a
   quote as settled (not just single-sourced) — the standard for
   anything a real submission or legal decision will lean on.
5. **A regex/grep search for a specific transitorio can silently miss
   compound Spanish ordinals** — found 13-sep-2026: a
   search pattern that matched "Décimo" alone (or single-word ordinals)
   failed to match "**Décimo Segundo**," "Décimo Primero," "Décimo
   Tercero," etc., wrongly concluding an already-downloaded document
   didn't reach that far, when it actually
   did. Before concluding a transitorio doesn't exist in a document
   you've already extracted, grep loosely first (`grep -n -i "d.cimo"`,
   catching the whole family) rather than for one specific compound
   ordinal string.

## Already-verified reference — don't re-derive these

- `[[project_lfpiorpi_seccion_xvi_date]]` (this project's own memory) —
  section XVI's real effective date (~Sept 2019, not 2025/2027),
  already applied to Vouch402.
- `[[project_jurisdiction_blocklist]]` (this project's own memory) — how
  the Tier 1/Tier 2 jurisdiction blocklist and the "software-only,
  query-only" posture fit together; distinct from (not a substitute
  for) the tests in this skill.
- `web/content/legal-en.md` / `legal-es.md`, section 4 (open questions)
  — Vouch402's actual, current, honestly-hedged read of tests #1-4, not
  a "clean" verdict:
  - Tests #1-2 (IFPE, LFPIORPI actividad vulnerable): read as outside
    scope — Vouch402 never accrues a per-client balance and never
    exchanges a client's assets as its own business.
  - **Test #3 (Art. 24 Bis 4 facilitación) is item 2 there — deliberately
    left unresolved, not cleared.** The open question is whether
    read-only verification of a transaction that already happened
    (Vouch402 never constructs or routes it) counts as "facilitación."
  - **Test #4 (LMV/CNBV, relevant only because of the
    `tokenizedEquityExposure` signal) has no confirmed answer either
    way** — see `AGENTS.md`'s "Tokenized-equity data stays read-only"
    rule (the reason this feature stays query-only by design) and
    item 9 there (a related but separate open question: whether Mexico
    is an eligible jurisdiction for Coinbase's own tokenized-equity
    product, not about Vouch402's own activity).
  - Any future session citing Vouch402 as having "cleared" tests #3/#4
    is citing something this project's own `/legal` doc does not claim
    — correct that if it comes up, don't propagate it.

## When you're done

This project does not yet have a single worked-example memory file
covering all four tests end-to-end for Vouch402 — the real, current
answer lives split across `AGENTS.md`, `web/content/legal-en.md`/
`legal-es.md` section 4, and `DECISION_LOG.md` (search "tokenizedEquityExposure"
and "LFPIORPI"), as referenced above. Write any *new* feature's read to
its own memory file (`project_<feature>_mexico_legal_posture.md`,
following this skill's four-test structure), mark which parts are
primary-source confirmed vs. reasoned inference, and add the index line
to `MEMORY.md`. This is regulatory research for planning, **not formal
legal advice** —
say so explicitly, every time, matching the hedged, attorney-review-
pending framing already used throughout `web/content/legal-en.md`/
`legal-es.md`.
