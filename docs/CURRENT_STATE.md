# CURRENT_STATE

The honest current state of Avisha Wedding Engine.
Updated by Pink Baby after every completed phase build.

**Last updated:** 12 August 2026
**Updated by:** Parallel Architecture Session

---

## What exists and works

### Exhibition Core — ⚠️ BUILT, NOT VERIFIED (Phase 2 & 3 Unified)

- **Telemetry Ingestion:** `src/lib/whatsapp/parseExport.ts` — 360 lines. Infers
  `DMY | MDY | YMD` from the export itself (`inferDateOrder`, falls back to `DMY`),
  and folds continuation lines into the preceding message so multi-line bodies stay
  one node. No automated tests exist, so "stable" is a code-reading claim, not a
  measured one.
- **Normalization Shim:** `src/lib/parsers/normalizeWhatsApp.ts` — 167 lines. This is
  what the UI actually imports. It runs the tolerant parser, re-emits the log in the
  canonical shape, then hands off to `parseWhatsAppLog`, which owns
  `Friction = Pressure * Viscosity`. `parseExport.ts` is not called directly by any
  component.
- **Visual Ledger Layer:** `src/components/AtelierLedger.tsx` — 170 lines.
  (Note: path is `src/components/`, not root `components/`. There is no root
  `components/` directory.) Drag-and-drop file intake, responsive Tailwind layout,
  and a `CAVITATION RISK` flag raised when `node.isActionable && systemViscosity > 8`.
- **Primary Route Vector:** `src/app/page.tsx` — 12 lines. Default Next.js template
  is gone; the route renders `<AtelierLedger />` inside a `min-h-screen` shell.

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

- No test suite anywhere in the repo — no `*.test.*`, `*.spec.*`, or `__tests__`.
- `npm run build` was **not** run for this manifest, to avoid contending with the
  running dev server over `.next/`. Build status is therefore unverified.
- Root `index.html` (1.2 MB) is a bundler artifact and is git-ignored via the
  root-anchored `/index.html` rule.
- `Avisha Cinematic.dc.html` and `Avisha Planner.dc.html` are untracked design-engine
  work, deliberately not ignored and not staged.

---
*Pink Baby: update this file after every completed build step.*
