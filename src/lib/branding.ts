/**
 * branding.ts — the white-label name matrix.
 * -----------------------------------------------------------------------------
 * Every couple-facing name in the platform resolves from here. Before this
 * module the names were three unrelated literals — `page.tsx`, `layout.tsx`
 * metadata and the invitation card header — which is how they drifted apart in
 * the first place (`Mayur and Avani` on the landing route, `Avi & Isha` on the
 * invitation).
 *
 * To re-brand a deployment, edit `COUPLE` and nothing else.
 *
 * Explicitly NOT covered by this module:
 *  - `src/lib/agents/AviMascot.ts`. "Avi" there is the build-companion mascot,
 *    a presentation-layer character in the agent mesh. It is not a person's
 *    name and must not be swept up in a rename.
 *  - `AVISHA` in the ledger header and `avisha.*` storage keys. That is the
 *    atelier's own mark, not the couple's.
 *  - `public/fixtures/*.txt`. Those are WhatsApp telemetry fixtures whose
 *    sender names feed the ledger's speaker-switch count; renaming them
 *    inconsistently would move the measured viscosity figures.
 */

/** The two neutral roles. Replace with real names to brand a deployment. */
export const COUPLE = {
  bride: "Bride",
  groom: "Groom",
} as const;

/** "Bride and Groom" — running prose and page titles. */
export const COUPLE_PAIR = `${COUPLE.bride} and ${COUPLE.groom}`;

/** "Bride & Groom" — the invitation card, where the ampersand is set. */
export const COUPLE_PAIR_SHORT = `${COUPLE.bride} & ${COUPLE.groom}`;

/**
 * The wax seal's pressed monogram, derived so it re-brands with the names.
 * Two glyphs; the seal's type size is set for two.
 */
export const COUPLE_MONOGRAM = `${COUPLE.bride[0]}${COUPLE.groom[0]}`;
