# CURRENT_STATE

The honest current state of Avisha Wedding Engine.
Updated by Pink Baby after every completed phase build.

**Last updated:** 28 September 2026
**Updated by:** Phase 3 close-out — adaptive render quality, response headers, deployment

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
- **Primary Route Vector:** `src/app/page.tsx` — **as of 28 September 2026 this
  is the guest-facing landing card, not the ledger.** See "Landing card" below.
  The ledger component is unchanged and still reachable at `/ledger`.

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
  Resolved 28 September 2026: `src/app/ledger/page.tsx` metadata said
  `Instrument_001` and was the odd one out against both the component header and
  that file's own docblock (`/ledger` — Exhibition 001). `EXHIBITION_001` won.
  Confirmed on a served response: `/ledger` returns
  `<title>Avisha // EXHIBITION_001</title>`.

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

The manifest's "Vercel Deployment Sync: Enabled via root `.gitignore` parameters"
was never accurate and is left corrected here:

- `.gitignore` cannot enable a deployment. Its `.vercel` line is stock
  create-next-app boilerplate, not evidence of a connection.
- Deployment state as of 28 September 2026 is recorded under "Deployment" below.
  Until that date there was no linked Vercel project and pushing `main` deployed
  nothing.

### Phase 3 close-out — 28 September 2026

Three changes, each verified as far as this machine allows.

- **Device-adaptive render quality** (`CeremonyCanvas.tsx`). The canvas shipped
  `dpr={[1, 2]}`, `antialias: true`, VSM shadows and an always-on bloom pass.
  On a phone reporting `devicePixelRatio` 3 that is a fixed cost paid three
  times — colour pass, shadow map, bloom mip chain — with no way to shed it.
  Now:
  - `DPR_CEILING_HANDHELD = 1.5` vs `DPR_CEILING_DESKTOP = 2`, chosen once at
    mount from `matchMedia("(pointer: coarse)")`. A capability query, not a
    user-agent sniff. Safe in a `useState` initialiser because this component
    is only reached through `CeremonyCanvasClient`, which imports it with
    `ssr: false` — there is no server pass to disagree with.
  - drei's `<PerformanceMonitor>` inside the Canvas maps its `0..1` factor onto
    `[DPR_FLOOR = 0.75, ceiling]`, rounded to 1/20 so a jittering factor cannot
    thrash the drawing-buffer resize.
  - `onFallback` drops the `<EffectComposer>` entirely. Last resort, after the
    resolution ladder has failed to recover the frame time.
  - MSAA is off on handhelds; at DPR 1.5 the buffer is already supersampled
    relative to the CSS pixel.

  **Not measured.** No phone was driven, and no FPS number was taken on any
  device. What is verified is that it typechecks, lints, builds, and that
  `PerformanceMonitor` reaches the client bundle. Whether this holds 60 FPS on
  any particular handset is an open question, not a claim — see Known gaps.

- **Response headers** (`vercel.json`). `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: SAMEORIGIN` and a `Permissions-Policy`, all on `/(.*)`.
  `poweredByHeader: false` stays in `next.config.ts` because `x-powered-by` is
  emitted by Next itself and only Next can suppress it.

  These were briefly in `next.config.ts` under `headers()` and were moved to
  `vercel.json` on the operator's explicit instruction. Both are valid — Vercel's
  own CDN-cache docs present them as alternatives for the same job — and they are
  deliberately **not** used together, because a header defined in both places is
  applied twice.

  **The trade is verifiability, and it is a real cost.** Under `headers()` the
  set could be checked locally: `curl -I` against `next start` returned all four.
  `vercel.json` is applied by the platform, not by `next start`, so that check
  now returns nothing — confirmed on 28 September, and expected rather than a
  fault. What is verified today is that the file parses, that its shape matches
  the documented schema (`source` + `key`/`value` pairs), and that
  `x-powered-by` is still absent locally. **That the four headers actually land
  is unproven** and stays unproven until something is deployed and answers a
  `curl -I`. See Known gaps.

  `Permissions-Policy` deliberately omits `autoplay`. The soundscape is
  synthesised in-process by the Web Audio API and fetches nothing, so no header
  can influence a cross-fade — but restricting `autoplay` could block the
  `AudioContext` resume behind the soundscape toggle. The one real interaction
  between headers and the audio engine is a way to break it.

- **`Instrument_001` retired** in favour of `EXHIBITION_001` (above).

### Design-engine documents on routes — 28 September 2026

`public/assets/design/` now holds the two `.dc.html` design-engine documents,
served under clean paths by `rewrites()` in `next.config.ts`:

| Route | Serves | Verified |
|---|---|---|
| `/planner` | `Avisha Planner.dc.html` | 200, 75140 B, sha256 matches source |
| `/cinematic` | `Avisha Cinematic.dc.html` | 200, 60058 B, sha256 matches source |
| `/Avisha%20Planner.dc.html` | the planner doc | 200 — keeps the cinematic doc's cross-link alive |

Rewrites rather than redirects, so the address bar keeps reading `/planner`
instead of bouncing the visitor to a percent-encoded `.dc.html` URL. Returned as
a plain array, which the bundled docs define as `afterFiles` — checked after the
filesystem, so a real page at either path would still win. `/`, `/ceremony` and
`/ledger` were re-checked after the change and all still return 200.

They are in `next.config.ts` and not `vercel.json` on purpose: config there can
be exercised by `curl` against `next start`, which is how the table above was
filled in. The `vercel.json` header set still cannot be.

**These documents are missing their design system.** Both reference a shared
`_ds/industry-aa085960.../` bundle plus `support.js` (and `image-slot.js` for
the planner). None of it exists anywhere in this repo or in the wider
`~/Documents/Avisha` tree, and every one of those paths was confirmed 404 on the
running server. What renders is each document's own inline CSS (3.4 KB
cinematic, 6.7 KB planner) and inline script — real content, but not the
intended presentation. This is a pre-existing gap the move surfaced rather than
caused; the files were equally incomplete at the root. See Known gaps.

### Landing card — 28 September 2026

`/` is now a greeting card. The Atelier ledger it used to render is **not
deleted or modified** — `src/components/AtelierLedger.tsx` is byte-identical and
still renders at `/ledger`; the landing route simply stopped reaching for it.

- Marcellus over Barlow, loaded in `layout.tsx` as CSS variables. Both are
  non-variable Google fonts, so `weight` is required — optional only for
  variable fonts like Geist, per the bundled `02-components/font.md`. The
  variables are exposed rather than applied to `<body>`, so the ledger and the
  ceremony keep their own type.
- Colours are taken from `ceremonyConfig`'s PALETTE (temple ivory, champagne
  gold, midnight indigo). The card introduces no new colour.
- The guest's name goes to `sessionStorage` under `avisha.guestName`, **not** a
  query parameter. A name is personal data and a URL carrying it lands in
  history, referrer headers and every access log in between. `Enter` then routes
  to `/ceremony`. Storage failure (private-mode Safari) is caught and ignored —
  the greeting is a courtesy, not a gate.
- `layout.tsx` metadata was still the stock `"Create Next App" / "Generated by
  create next app"`. It now reads `The Wedding of Mayur and Avani`.

Verified against `next start`: all three strings present in the served HTML, the
name input and `Enter` button present with the button correctly disabled while
the field is empty, `<title>` updated, both font variables referenced, and every
ledger string (`CAVITATION`, `PRESSURE SPIKE`, `Viscosity`, `INGEST_FAULT`,
`SYSTEM_ALERT`, `EXHIBITION_001`) absent from `/` while `/ledger` still renders
`EXHIBITION_001`. All five routes return 200.

There were no passcode or passphrase fields anywhere in `src/` to remove — a
grep for `passcode|passphrase|password|access code` returns nothing.

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
- **Adaptive render quality is unmeasured on real hardware.** The ladder
  (DPR ceiling by device class -> PerformanceMonitor -> drop bloom) is a sound
  shape and is the right lever, but no handset has run it and no frame time has
  been recorded anywhere. "60 FPS on mobile" is not a claim this repo can make.
  Measuring it needs a real device, or at minimum Chrome DevTools device
  emulation with CPU/GPU throttling and the FPS meter on.
- **Nobody has seen the landing card.** Its content is confirmed in the served
  HTML, but the Chrome extension has been disconnected all day, so the actual
  composition — type scale, the gold rule, the button's hover lift, how it holds
  at phone width — has not been looked at by anyone. "Stunning" is unverified.
- **`Enter` leads to `/ceremony`, which no one asked for explicitly.** It was the
  only route that reads as "step inside". If the intended destination is
  `/planner`, the invitation, or a gate, that is a one-line change in
  `handleSubmit`. Nothing reads `avisha.guestName` yet — the ceremony does not
  greet the guest by name.
- **`/planner` and `/cinematic` render without their design system.** The
  `_ds/` bundle, `support.js` and `image-slot.js` that both documents reference
  are not in the repo and not on the machine. Until that bundle is placed at
  `public/assets/design/_ds/...` (or the documents are re-exported with it
  inlined), both routes serve structurally-correct but unstyled-by-the-system
  pages. Nobody has looked at either route in a browser — the Chrome extension
  has been disconnected all day — so "renders real content" is an inference from
  3.4 KB and 6.7 KB of inline CSS, not something seen.
- **The `vercel.json` headers have never been served.** They cannot be
  exercised locally by design, and no deployment exists to exercise them
  remotely. First action after a successful deploy: `curl -I <live_url>` and
  confirm all four are present.
- **The browser pass for this change did not happen.** The Chrome extension was
  disconnected for the whole session, so `/ceremony` was never driven with the
  new code. Verification stopped at: typecheck, lint, build, a served 200 with
  the placeholder background present, and `PerformanceMonitor` confirmed in the
  emitted client chunk. Nobody has seen the adaptive canvas render.
- No test suite anywhere in the repo — no `*.test.*`, `*.spec.*`, or `__tests__`.
  The Phase 3 engine check above ran from a throwaway script in the scratchpad, so
  it proves the behaviour once and guards nothing going forward.
- **Browser verification is real but partial.** The wrap, the layout and the two
  headline metrics were confirmed by eye (see above). The cascade badge, the
  scroller, the red-tier count and the fault banner were not individually checked,
  and no *real* WhatsApp export has been dropped in — only generated fixtures, all
  of which this repo authored and therefore all of which share its assumptions
  about what an export looks like.
- Root `index.html` (1.2 MB) and `avisha-cinematic-standalone.html` (451 KB) are
  bundler artifacts, git-ignored via root-anchored `/index.html` and
  `/avisha-cinematic-standalone.html` rules. Root-anchored on purpose: a real
  `index.html` under `public/` or `src/` must stay tracked. Do not widen either
  rule to a bare `*.html` glob — that would swallow the `.dc.html` design files.
- `Avisha Cinematic.dc.html` and `Avisha Planner.dc.html` **moved into
  `public/assets/design/` and are now tracked** (28 September 2026) — the
  integration their earlier "leave untracked at the root" handling was always
  waiting for. Bytes are unchanged across the move, verified by sha256 on both
  sides. They had to be committed: `public/` is a build input, and an untracked
  file there would 404 on the deployment.

  The root-anchored `.gitignore` rules did their job here — `git check-ignore`
  confirms neither file is swallowed in its new home, which is precisely what a
  `*.html` glob would have broken.

---
*Pink Baby: update this file after every completed build step.*
