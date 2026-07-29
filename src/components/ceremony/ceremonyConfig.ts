/**
 * ceremonyConfig.ts
 * -----------------------------------------------------------------------------
 * Phase II — Living Ceremony Layer.
 *
 * Single source of truth for the 7 ceremony chapters: colour palettes, camera
 * framing, and physically-motivated lighting profiles (2400K candle-warm →
 * 5000K midday-neutral). Consumed by <CeremonyCanvas /> and the shader hooks.
 *
 * Everything here is data-only and side-effect free so it can be imported by
 * both client scene code and (potential) server components / tests.
 */

// -----------------------------------------------------------------------------
// Branded / primitive helper types
// -----------------------------------------------------------------------------

/** A 6-digit hex colour, e.g. `#1B4D3E`. Enforced at authoring time. */
export type HexColor = `#${string}`;

/** A colour temperature expressed in Kelvin (warm 1000 → cool 12000). */
export type Kelvin = number;

/** Cartesian triple used for positions and orientations in world space. */
export type Vec3 = readonly [x: number, y: number, z: number];

/** Stable identifiers for each of the 7 ceremony chapters, in story order. */
export type ChapterId =
  | "proposal"
  | "engagement"
  | "mehendi"
  | "sangeet"
  | "wedding"
  | "reception"
  | "legacy";

/** Ordered list of chapter ids — the canonical progression of the story. */
export const CHAPTER_ORDER = [
  "proposal",
  "engagement",
  "mehendi",
  "sangeet",
  "wedding",
  "reception",
  "legacy",
] as const satisfies readonly ChapterId[];

/** Total number of chapters. Derived so it can never drift from CHAPTER_ORDER. */
export const CHAPTER_COUNT: number = CHAPTER_ORDER.length;

// -----------------------------------------------------------------------------
// Palette
// -----------------------------------------------------------------------------

/**
 * Named brand colours shared across chapters. Keeping the raw hex values in one
 * table lets chapters reference semantic names while the shaders read the hex.
 */
export const PALETTE = {
  // Named brand colours.
  mehendiGreen: "#1B4D3E",
  sindoorCrimson: "#990000",
  templeIvory: "#FDFBF7",
  // Supporting ceremony tones.
  turmericGold: "#E1A200",
  marigoldSaffron: "#F4820B",
  roseBlush: "#E8899E",
  peacockTeal: "#0B6E6E",
  midnightIndigo: "#1A1B4B",
  champagneGold: "#C8A24B",
  duskRose: "#8A2E4D",
  // Architectural material tones for the per-chapter worlds.
  gladeMoss: "#2F5D46",
  twilightViolet: "#221C46",
  glassTint: "#CFE3E8",
  sandstone: "#C69B6D",
  bronze: "#7A5A2E",
  charcoal: "#20242B",
  hearthAmber: "#E8863C",
} as const satisfies Record<string, HexColor>;

export type PaletteName = keyof typeof PALETTE;

/** Per-chapter colour roles consumed by materials and post-processing. */
export interface ChapterPalette {
  /** Dominant surface / ambience colour. */
  readonly primary: HexColor;
  /** Supporting accent for highlights, particles, rim light. */
  readonly secondary: HexColor;
  /** Emissive / glow tint for shader hotspots (diyas, embers, gold leaf). */
  readonly emissive: HexColor;
  /** Deep background / fog colour anchoring the scene depth. */
  readonly background: HexColor;
}

// -----------------------------------------------------------------------------
// Camera
// -----------------------------------------------------------------------------

/** Camera framing for a chapter. Interpolated between chapters via GSAP. */
export interface CameraProfile {
  /** World-space camera position. */
  readonly position: Vec3;
  /** World-space point the camera looks at. */
  readonly target: Vec3;
  /** Vertical field of view in degrees. */
  readonly fov: number;
}

// -----------------------------------------------------------------------------
// Lighting
// -----------------------------------------------------------------------------

/**
 * Physically-motivated lighting profile. `temperatureK` drives the key light's
 * colour via Kelvin→RGB conversion; the numeric intensities are in the
 * arbitrary-but-consistent units used by three.js lights.
 */
export interface LightingProfile {
  /** Colour temperature of the key light, 2400K (candle) → 5000K (daylight). */
  readonly temperatureK: Kelvin;
  /** Key (directional) light intensity. */
  readonly keyIntensity: number;
  /** World-space direction the key light points from. */
  readonly keyDirection: Vec3;
  /** Ambient fill intensity. */
  readonly ambientIntensity: number;
  /** Hemisphere / bounce intensity for soft global fill. */
  readonly hemiIntensity: number;
  /** Exponential fog density applied to `background`. `0` disables fog. */
  readonly fogDensity: number;
}

// -----------------------------------------------------------------------------
// Chapter definition
// -----------------------------------------------------------------------------

/** Full authored definition of one ceremony chapter. */
export interface ChapterConfig {
  readonly id: ChapterId;
  /** Human-facing display name. */
  readonly title: string;
  /** One-line evocative description for UI / narration. */
  readonly subtitle: string;
  readonly palette: ChapterPalette;
  readonly camera: CameraProfile;
  readonly lighting: LightingProfile;
  /** Seconds to cross-fade *into* this chapter. Drives GSAP tween duration. */
  readonly transitionDuration: number;
}

// -----------------------------------------------------------------------------
// The 7 chapters
// -----------------------------------------------------------------------------

export const CEREMONY_CHAPTERS: Readonly<Record<ChapterId, ChapterConfig>> = {
  // 1 — Proposal: an enchanted twilight glade ringed with crystal lanterns.
  //
  // The key is a cool, low moonlight rim (6200K) deliberately starved of
  // intensity: almost everything the eye reads in this chapter is the warm
  // lantern glow, and the contrast between the two is the whole look. Fog is
  // heavy enough for the lantern shafts to have something to hang in.
  proposal: {
    id: "proposal",
    title: "Proposal",
    subtitle: "A question asked in a glade of fairy lanterns.",
    palette: {
      primary: PALETTE.gladeMoss,
      secondary: PALETTE.glassTint,
      emissive: PALETTE.champagneGold,
      background: PALETTE.twilightViolet,
    },
    camera: {
      position: [4.5, 2.6, 8.5],
      target: [0, 1.4, 0],
      fov: 44,
    },
    lighting: {
      temperatureK: 6200,
      keyIntensity: 0.55,
      keyDirection: [-3, 7, -6],
      ambientIntensity: 0.22,
      hemiIntensity: 0.3,
      fogDensity: 0.045,
    },
    transitionDuration: 2.0,
  },

  // 2 — Engagement: a geometric sandstone stepwell, warm afternoon.
  engagement: {
    id: "engagement",
    title: "Engagement",
    subtitle: "Vows exchanged on a sandstone stepwell.",
    palette: {
      primary: PALETTE.sandstone,
      secondary: PALETTE.champagneGold,
      emissive: PALETTE.turmericGold,
      background: PALETTE.sandstone,
    },
    camera: {
      position: [0, 4.2, 9.5],
      target: [0, 0.6, 0],
      fov: 46,
    },
    lighting: {
      temperatureK: 4000,
      keyIntensity: 1.3,
      keyDirection: [4, 8, 3],
      ambientIntensity: 0.55,
      hemiIntensity: 0.6,
      fogDensity: 0.012,
    },
    transitionDuration: 2.4,
  },

  // 3 — Mehendi: a low-poly banyan canopy with a floating swing, lantern night.
  mehendi: {
    id: "mehendi",
    title: "Mehendi",
    subtitle: "Henna evening beneath a banyan canopy.",
    palette: {
      primary: PALETTE.mehendiGreen,
      secondary: PALETTE.peacockTeal,
      emissive: PALETTE.marigoldSaffron,
      background: PALETTE.midnightIndigo,
    },
    camera: {
      position: [-3.6, 2.2, 7.0],
      target: [0, 1.8, 0],
      fov: 40,
    },
    lighting: {
      temperatureK: 2900,
      keyIntensity: 0.95,
      keyDirection: [-3, 6, 3],
      ambientIntensity: 0.4,
      hemiIntensity: 0.45,
      fogDensity: 0.028,
    },
    transitionDuration: 2.6,
  },

  // 4 — Sangeet: a dark, multi-faceted amphitheatre stage.
  sangeet: {
    id: "sangeet",
    title: "Sangeet",
    subtitle: "A dark amphitheatre lit for the dance.",
    palette: {
      primary: PALETTE.charcoal,
      secondary: PALETTE.sindoorCrimson,
      emissive: PALETTE.marigoldSaffron,
      background: PALETTE.midnightIndigo,
    },
    camera: {
      position: [0, 3.0, 8.5],
      target: [0, 0.8, 0],
      fov: 48,
    },
    lighting: {
      temperatureK: 3000,
      keyIntensity: 1.0,
      keyDirection: [2, 7, 4],
      ambientIntensity: 0.3,
      hemiIntensity: 0.32,
      fogDensity: 0.04,
    },
    transitionDuration: 2.2,
  },

  // 5 — Wedding: a heavy bronze havan kund on sandstone pillars, candle-warm.
  wedding: {
    id: "wedding",
    title: "Wedding",
    subtitle: "Seven vows around a bronze havan kund.",
    palette: {
      primary: PALETTE.sindoorCrimson,
      secondary: PALETTE.sandstone,
      emissive: PALETTE.marigoldSaffron,
      background: PALETTE.midnightIndigo,
    },
    camera: {
      position: [0, 2.4, 6.2],
      target: [0, 1.0, 0],
      fov: 38,
    },
    lighting: {
      temperatureK: 2400,
      keyIntensity: 0.9,
      keyDirection: [0, 5, 3],
      ambientIntensity: 0.32,
      hemiIntensity: 0.35,
      fogDensity: 0.045,
    },
    transitionDuration: 3.0,
  },

  // 6 — Reception: an expansive clean conservatory dining layout.
  reception: {
    id: "reception",
    title: "Reception",
    subtitle: "A glass conservatory set for the feast.",
    palette: {
      primary: PALETTE.champagneGold,
      secondary: PALETTE.glassTint,
      emissive: PALETTE.templeIvory,
      background: PALETTE.templeIvory,
    },
    camera: {
      position: [5.0, 2.8, 9.5],
      target: [0, 1.1, 0],
      fov: 50,
    },
    lighting: {
      temperatureK: 4600,
      keyIntensity: 1.25,
      keyDirection: [5, 9, 4],
      ambientIntensity: 0.62,
      hemiIntensity: 0.68,
      fogDensity: 0.01,
    },
    transitionDuration: 2.2,
  },

  // 7 — Legacy: an intimate estate library with a fireplace hearth.
  legacy: {
    id: "legacy",
    title: "Legacy",
    subtitle: "A quiet library hearth, years later.",
    palette: {
      primary: PALETTE.bronze,
      secondary: PALETTE.duskRose,
      emissive: PALETTE.hearthAmber,
      background: PALETTE.midnightIndigo,
    },
    camera: {
      position: [0, 2.0, 6.0],
      target: [0, 1.1, 0],
      fov: 40,
    },
    lighting: {
      temperatureK: 3400,
      keyIntensity: 0.8,
      keyDirection: [-3, 6, 4],
      ambientIntensity: 0.4,
      hemiIntensity: 0.42,
      fogDensity: 0.035,
    },
    transitionDuration: 3.0,
  },
} as const;

// -----------------------------------------------------------------------------
// Derived helpers
// -----------------------------------------------------------------------------

/** Ordered array form of the chapters, ready to map over in the scene. */
export const CEREMONY_SEQUENCE: readonly ChapterConfig[] = CHAPTER_ORDER.map(
  (id) => CEREMONY_CHAPTERS[id],
);

/** Type guard narrowing an arbitrary string to a known {@link ChapterId}. */
export function isChapterId(value: string): value is ChapterId {
  return (CHAPTER_ORDER as readonly string[]).includes(value);
}

/** Zero-based index of a chapter within {@link CHAPTER_ORDER}. */
export function chapterIndex(id: ChapterId): number {
  return CHAPTER_ORDER.indexOf(id);
}

/**
 * Neighbour lookup used by the canvas controller for prev/next navigation.
 * Returns `null` at the sequence boundaries (no wrap-around).
 */
export function adjacentChapter(
  id: ChapterId,
  direction: "next" | "prev",
): ChapterId | null {
  const idx = chapterIndex(id);
  const nextIdx = direction === "next" ? idx + 1 : idx - 1;
  const neighbour = CHAPTER_ORDER[nextIdx];
  return neighbour ?? null;
}

/**
 * Convert a colour temperature in Kelvin to a linear-ish RGB triple in the
 * `0..1` range, suitable for `THREE.Color.setRGB`. Based on the widely used
 * Tanner Helland approximation, clamped to a sensible ceremony range.
 *
 * Kept dependency-free (no three.js import) so config stays portable.
 */
export function kelvinToRGB(kelvin: Kelvin): Vec3 {
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;

  let r: number;
  let g: number;
  let b: number;

  // Red
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }

  // Green
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  // Blue
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  const clamp01 = (channel: number): number =>
    Math.min(Math.max(channel, 0), 255) / 255;

  return [clamp01(r), clamp01(g), clamp01(b)] as const;
}
