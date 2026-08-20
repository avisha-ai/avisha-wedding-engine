# CURRENT_STATE

The honest current state of Avisha Wedding Engine.
Updated by Pink Baby after every completed phase build.

**Last updated:** 20 August 2026
**Updated by:** Phase 3 Interface Completion & Final Sync (browser check folded in)

---

## What exists and works

### Exhibition Core — ✅ BUILDS CLEAN, ✅ RENDERS IN THE BROWSER (Phase 2 & 3 Unified)

- **Telemetry Ingestion:** `src/lib/whatsapp/parseExport.ts` — 360 lines. Infers
  `DMY | MDY | YMD` from the export itself (`inferDateOrder`, falls back to `DMY`),
  and folds continuation lines into the preceding message so multi-line bodies stay
  one node. No automated tests exist, so "stable" is a code-reading claim, not a
  measured one.
- **Normalization Shim:** `src/lib/parsers/normalizeWhatsApp.ts` — 197 lines. This is
  what the UI actually imports. It runs the tolerant parser, re-emits the log in the
  canonical shape, then hands off to `parseWhatsAppLog`, which owns
  `Friction = Pressure * Viscosity`. `parseExport.ts` is not called directly by any
  component. As of Phase 3 it also carries `displayText` on every node: the body
  with the author's own line breaks intact. `message` stays flattened, because that
  is the string the engine's single-line regex parsed and scored — the folding is a
  concession to the regex, not a loss of what was written.
- **Visual Ledger Layer:** `src/components/AtelierLedger.tsx` — 262 lines.
  (Note: path is `src/components/`, not root `components/`. There is no root
  `components/` directory.) Drag-and-drop file intake, responsive Tailwind layout,
  and a three-tier flag system: `ORDY: CASCADE CAVITATION` (a run of >= 3 actionable
  messages from one sender that nobody answered), `PRESSURE SPIKE`
  (`isActionable && systemViscosity > 1.2`), and an amber high-viscosity tier
  (`viscosityScore > 6`). The cascade pass is the only computation the component
  owns; all metrics come from the engine. Typechecks clean under `tsc --noEmit`.
  **The two numeric thresholds are miscalibrated — see Known gaps.**
- **Primary Route Vector:** `src/app/page.tsx` — 12 lines. Default Next.js template
  is gone; the route renders `<AtelierLedger />` inside a `min-h-screen` shell.

### Phase 3 — interface completion (20 August 2026)

- **Multi-line rendering.** Node bodies render from `displayText` with
  `whitespace-pre-wrap break-words` inside a `min-w-0 flex-1` cell, replacing the
  single-line `truncate`. A three-line message now reads as three lines and long
  unbroken tokens wrap instead of overflowing the panel. Rows are `items-start`, so
  the Ordy flag stays pinned to the first line of a wrapping body.
- **Stream grid scrolls in place.** `max-h-[60vh] overflow-y-auto` keeps the header
  metrics and the footer on screen for a long export. The `custom-scrollbar` class
  it uses is not a Tailwind utility and is defined in `src/app/globals.css` for both
  `scrollbar-width` and the `::-webkit-scrollbar` pseudo-elements.
- **Error structures.** `errorLog` state drives a dedicated amber `SYSTEM_ALERT`
  banner above the intake port, and the metric strip is gated on
  `report && !errorLog` so no stale numbers survive a failed ingest. Two fault
  classes: `INGEST_FAULT` for a file that parsed but yielded no telemetry, and
  `CRITICAL_COMPILATION_BREAK` for a thrown exception.
- **Faults are described from parser state, not from a constant.**
  `describeEmptyIngest` reads `report.normalization` and names what the intake pass
  actually counted. Verified against real input:
  - 2 junk lines, no headers → `2 line(s) read, none carrying a timestamp header.`
  - 1 encryption notice, no traffic → `1 system notice(s) and no participant traffic.`
  - empty file → the generic `no recognizable operational telemetry.`
- **Header reads `AVISHA // EXHIBITION_001`**, matching the footer's active layer.
  Note `src/app/ledger/page.tsx` metadata still says `Instrument_001`; the two are
  now inconsistent and one of them should win.

### Verification actually performed (20 August 2026)

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean, no warnings.
- `npm run build` — **passes.** Next.js 16.2.11 (Turbopack), compiled in 1409ms,
  6/6 static pages generated. All four routes prerender static: `/`, `/_not-found`,
  `/ceremony`, `/ledger`.
- Engine behaviour checked directly under `node --experimental-strip-types` against
  a synthetic export: a 3-line message folds to one node with `message` flattened
  and `displayText` newline-preserving, `multiLineFolded: 1`, `dateOrder: DMY`,
  and the three empty-ingest branches each returned their distinct alert.
  This was a scratch harness, not a committed test — see Known gaps.

### Browser verification — 20 August 2026

First time the instrument has been driven rather than reasoned about.
`heavy_chat.txt` (124 nodes) dropped into the intake port at `localhost:3000`.

Confirmed by eye:

- Layout holds, typography tracks.
- **`LN_004` wraps across three lines and keeps its grid alignment** — the line
  number, sender column and body stay on their columns against a tall row. This
  is the Phase 3 change working: the same node under the old `truncate` was one
  clipped line.
- Telemetry dashboard reads **1560 MIN Head Pressure** and **21.3 μ Viscosity**.

The two dashboard figures match what the engine computed for that fixture in a
standalone harness run — `pressure=1560min`, `mu=21.3`. Parser, normalizer, math
engine and render surface therefore agree end to end on the same input. That is
the strongest claim this repo can currently make, and it is now made honestly.

Observed on this pass but *not* individually confirmed by the operator, so still
open: the `ORDY: CASCADE CAVITATION` badge on the four-message run at the tail of
the fixture, the 60vh scroller under a 124-node list, the 28 `PRESSURE SPIKE`
lines the new cut point predicts, and the `SYSTEM_ALERT` banner (which needs
`sample-chat-system-only.txt`, a separate drop).

### Not in the original manifest, but present in the repo

- **Ceremony subsystem:** `src/app/ceremony/page.tsx` plus 11 files under
  `src/components/ceremony/` (R3F canvas, procedural assets, custom shaders, audio,
  invitation and simulation overlays). This is the bulk of the codebase by volume.
- **Agent mesh:** 8 files under `src/lib/agents/` (Curation, Environmental,
  Hospitality, Logistics, `AviMascot`, `AgentMesh`).
- **Second ledger route:** `src/app/ledger/page.tsx`.

## Environment Variables Active

**None.** There are no `.env*` files in the repo.

The manifest's "Vercel Deployment Sync: Enabled via root `.gitignore` parameters" is
not accurate and has been corrected here rather than copied forward:

- `.gitignore` cannot enable a deployment. Its `.vercel` line is stock
  create-next-app boilerplate, not evidence of a connection.
- There is no `.vercel/` directory and no linked Vercel project. Pushing `main`
  currently deploys nothing.

## Known gaps

- **Ledger thresholds recalibrated 20 August 2026 — untested against a real
  export.** `parseWhatsAppLog` computes
  `systemViscosity = log(switches + 1) * (nodes / actions)`, which lands in the
  teens-to-twenties on any real export, so the shipped `> 1.2` and `> 6` cuts were
  true for every line and both tiers were always-on. They are now
  `CAVITATION_VISCOSITY = 18` and `HIGH_VISCOSITY_SCORE = 25`, named constants at
  the top of `AtelierLedger.tsx`. What this means in practice, since
  `viscosityScore` is only ever `systemViscosity * 1.5` or `* 0.5` and so carries
  no signal beyond `isActionable`:
  - μ > 18 → actionable lines read red (`PRESSURE SPIKE`).
  - 16.7 < μ ≤ 18 → actionable lines read amber. This is the approach band, the
    only window where the amber tier speaks about actionable traffic.
  - μ > 50 → even non-actionable lines read amber.
  - μ ≤ 16.7 → neither tier fires and the stream reads neutral. A short or
    well-answered log should now look quiet, which is the point, but nobody has
    yet confirmed the numbers against a real export. Treat 18 and 25 as a first
    calibration, not a settled reading. The 20 August browser run put a real
    number on it: `heavy_chat.txt` at mu 21.3 flags 28 of 124 lines rather than
    all 124, and `sample-chat.txt` at mu 4 now stays fully quiet.
- No test suite anywhere in the repo — no `*.test.*`, `*.spec.*`, or `__tests__`.
  The Phase 3 engine check above ran from a throwaway script in the scratchpad, so
  it proves the behaviour once and guards nothing going forward.
- **Browser verification is real but partial.** The wrap, the layout and the two
  headline metrics were confirmed by eye (see above). The cascade badge, the
  scroller, the red-tier count and the fault banner were not individually checked,
  and no *real* WhatsApp export has been dropped in — only generated fixtures, all
  of which this repo authored and therefore all of which share its assumptions
  about what an export looks like.
- `src/app/ledger/page.tsx` metadata title (`Instrument_001`) and the component
  header (`EXHIBITION_001`) disagree.
- Root `index.html` (1.2 MB) and `avisha-cinematic-standalone.html` (451 KB) are
  bundler artifacts, git-ignored via root-anchored `/index.html` and
  `/avisha-cinematic-standalone.html` rules. Root-anchored on purpose: a real
  `index.html` under `public/` or `src/` must stay tracked. Do not widen either
  rule to a bare `*.html` glob — that would swallow the `.dc.html` design files.
- `Avisha Cinematic.dc.html` and `Avisha Planner.dc.html` are untracked design-engine
  work, deliberately not ignored and not staged.

---
*Pink Baby: update this file after every completed build step.*
