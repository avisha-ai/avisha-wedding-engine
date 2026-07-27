/**
 * AviMascot.ts — configuration profile for Avi, the build-companion mascot.
 * -----------------------------------------------------------------------------
 * Avi is a presentation-layer character, not a specialist agent: he does not
 * implement {@link SpecialistAgent} and never contributes messages to the
 * {@link AgentMesh}. He *observes* — mapping compilation state (and, optionally,
 * the mesh's worst severity) onto a face and a glowing antenna.
 *
 * Everything here is data + pure derivation, side-effect free apart from the
 * subscriber fan-out, so the profile can be imported by client scene code and
 * server components alike.
 *
 * ## Visual archetype
 *
 * "Micro-Mascot": a small, rounded chassis dominated by a single responsive
 * digital screen that carries the whole face, topped by a blossom antenna whose
 * petals open and glow to signal system state. The antenna reads green while
 * things are healthy and crimson when they are not — the same mehendi-green /
 * sindoor-crimson pairing the ceremony chapters are built on, so Avi belongs to
 * the same world rather than sitting on top of it.
 */

import { PALETTE, type HexColor } from "@/components/ceremony/ceremonyConfig";

import { severityRank, type Severity } from "./types";

// -----------------------------------------------------------------------------
// System state
// -----------------------------------------------------------------------------

/** The build/compile states Avi reacts to. */
export type CompilationState =
  | "idle"
  | "compiling"
  | "success"
  | "warning"
  | "error";

/** Ordered list, calmest → most urgent. */
export const COMPILATION_STATES = [
  "idle",
  "compiling",
  "success",
  "warning",
  "error",
] as const satisfies readonly CompilationState[];

// -----------------------------------------------------------------------------
// Archetype + chassis
// -----------------------------------------------------------------------------

/**
 * Layout archetypes. Only `micro-mascot` is authored today; the union exists so
 * a second archetype can be added without widening every call site.
 */
export type MascotArchetype = "micro-mascot";

/** Physical proportions of the body, in abstract layout units. */
export interface ChassisProfile {
  readonly archetype: MascotArchetype;
  /** Overall height, layout units. */
  readonly height: number;
  /** Width at the widest point. */
  readonly width: number;
  /** Corner rounding as a fraction of `width`. `0.5` = fully pill-shaped. */
  readonly cornerRadius: number;
  readonly shellColor: HexColor;
  readonly trimColor: HexColor;
}

// -----------------------------------------------------------------------------
// Screen face
// -----------------------------------------------------------------------------

/** The expressions the screen can render. */
export type FaceExpression =
  | "neutral"
  | "focused"
  | "delighted"
  | "concerned"
  | "alert";

/** How the digital screen face is configured and what it currently shows. */
export interface ScreenFaceProfile {
  /** Screen size as a fraction of the chassis face. */
  readonly inset: number;
  /** Logical pixel grid the face is drawn on. */
  readonly resolution: readonly [columns: number, rows: number];
  readonly bezelColor: HexColor;
  readonly glyphColor: HexColor;
  /** Scanline overlay strength, `0`–`1`. */
  readonly scanlineOpacity: number;
  /** Seconds between idle blinks. */
  readonly blinkIntervalSeconds: number;
}

// -----------------------------------------------------------------------------
// Blossom antenna
// -----------------------------------------------------------------------------

/** Fixed construction of the antenna. */
export interface BlossomAntennaProfile {
  /** Stem length in layout units. */
  readonly stemLength: number;
  readonly petalCount: number;
  readonly restColor: HexColor;
  readonly alertColor: HexColor;
}

/** The antenna's live appearance for the current state. */
export interface BlossomAntennaState {
  readonly color: HexColor;
  /** Emissive gain — feeds a bloom threshold, so `>1` blooms. */
  readonly glowIntensity: number;
  /** Pulse rate in Hz. `0` = steady. */
  readonly pulseHz: number;
  /** Petal openness, `0` (closed bud) → `1` (fully open blossom). */
  readonly openness: number;
}

// -----------------------------------------------------------------------------
// Personality
// -----------------------------------------------------------------------------

/**
 * Personality is expressed as normalised dials rather than prose so tone can be
 * tuned continuously and asserted on in tests.
 */
export interface PersonalityProfile {
  /** Interpersonal warmth, `0` (clinical) → `1` (effusive). */
  readonly warmth: number;
  /** How readily Avi cheers the user on. */
  readonly encouragement: number;
  /** Depth of technical detail volunteered. */
  readonly technicalDepth: number;
  /** Output length preference, `0` (terse) → `1` (expansive). */
  readonly verbosity: number;
  /** Playfulness of phrasing. */
  readonly whimsy: number;
}

/** A line Avi can say, paired with the state that motivates it. */
export interface Utterance {
  readonly state: CompilationState;
  readonly expression: FaceExpression;
  readonly line: string;
}

// -----------------------------------------------------------------------------
// Composed profile
// -----------------------------------------------------------------------------

/** The complete authored configuration for a mascot. */
export interface MascotProfile {
  readonly name: string;
  readonly chassis: ChassisProfile;
  readonly face: ScreenFaceProfile;
  readonly antenna: BlossomAntennaProfile;
  readonly personality: PersonalityProfile;
}

/** A full snapshot of how Avi should be drawn right now. */
export interface MascotAppearance {
  readonly state: CompilationState;
  readonly expression: FaceExpression;
  readonly antenna: BlossomAntennaState;
  /** Chassis tint, warmed or cooled slightly by state. */
  readonly shellColor: HexColor;
}

/** Notified whenever Avi's appearance changes. */
export type MascotSubscriber = (appearance: MascotAppearance) => void;

// -----------------------------------------------------------------------------
// Authored defaults
// -----------------------------------------------------------------------------

/** Avi as shipped: a small, warm, encouraging build companion. */
export const AVI_PROFILE: MascotProfile = {
  name: "Avi",
  chassis: {
    archetype: "micro-mascot",
    height: 1.0,
    width: 0.82,
    cornerRadius: 0.42,
    shellColor: PALETTE.templeIvory,
    trimColor: PALETTE.champagneGold,
  },
  face: {
    inset: 0.68,
    resolution: [32, 24],
    bezelColor: PALETTE.charcoal,
    glyphColor: PALETTE.peacockTeal,
    scanlineOpacity: 0.12,
    blinkIntervalSeconds: 4.5,
  },
  antenna: {
    stemLength: 0.34,
    petalCount: 5,
    restColor: PALETTE.mehendiGreen,
    alertColor: PALETTE.sindoorCrimson,
  },
  personality: {
    warmth: 0.86,
    encouragement: 0.9,
    technicalDepth: 0.82,
    verbosity: 0.35,
    whimsy: 0.55,
  },
};

/**
 * Per-state antenna behaviour and expression. Green through `success`, crimson
 * from `warning` on — the blossom is the fastest read on the whole character,
 * so it changes hue only when something genuinely needs attention.
 */
const STATE_TABLE: Readonly<
  Record<
    CompilationState,
    {
      readonly expression: FaceExpression;
      readonly color: HexColor;
      readonly glowIntensity: number;
      readonly pulseHz: number;
      readonly openness: number;
    }
  >
> = {
  idle: {
    expression: "neutral",
    color: PALETTE.mehendiGreen,
    glowIntensity: 0.5,
    pulseHz: 0.25,
    openness: 0.45,
  },
  compiling: {
    expression: "focused",
    color: PALETTE.peacockTeal,
    glowIntensity: 1.1,
    pulseHz: 1.6,
    openness: 0.7,
  },
  success: {
    expression: "delighted",
    color: PALETTE.mehendiGreen,
    glowIntensity: 1.8,
    pulseHz: 0.0,
    openness: 1.0,
  },
  warning: {
    expression: "concerned",
    color: PALETTE.turmericGold,
    glowIntensity: 1.5,
    pulseHz: 1.1,
    openness: 0.55,
  },
  error: {
    expression: "alert",
    color: PALETTE.sindoorCrimson,
    glowIntensity: 2.4,
    pulseHz: 3.2,
    openness: 0.2,
  },
};

/** What Avi says in each state. Warm, brief, never saccharine. */
const UTTERANCES: Readonly<Record<CompilationState, readonly string[]>> = {
  idle: [
    "Ready when you are.",
    "Standing by — take your time.",
    "All quiet. What are we building?",
  ],
  compiling: [
    "Working on it…",
    "Crunching through the graph.",
    "Give me a moment — nearly there.",
  ],
  success: [
    "Clean build. Nice work.",
    "That compiled beautifully.",
    "Green across the board.",
  ],
  warning: [
    "Built, but there's something worth a look.",
    "It passes — a couple of rough edges though.",
    "Compiled with notes. Want me to walk through them?",
  ],
  error: [
    "Didn't compile — let's read the first error together.",
    "Something's off. The top error is usually the real one.",
    "Build failed. We'll get it; start at the first trace.",
  ],
};

/** Severity → compilation state, for driving Avi from the agent mesh. */
const SEVERITY_TO_STATE: Readonly<Record<Severity, CompilationState>> = {
  ok: "success",
  info: "idle",
  warning: "warning",
  critical: "error",
};

/** Inverse of {@link SEVERITY_TO_STATE}, for ranking states by urgency. */
const STATE_TO_SEVERITY: Readonly<Record<CompilationState, Severity>> = {
  idle: "info",
  compiling: "info",
  success: "ok",
  warning: "warning",
  error: "critical",
};

// -----------------------------------------------------------------------------
// The mascot
// -----------------------------------------------------------------------------

export interface AviMascotOptions {
  readonly profile?: MascotProfile;
  readonly initialState?: CompilationState;
  /** Injectable index picker, so utterance choice is deterministic in tests. */
  readonly pick?: (count: number) => number;
}

/**
 * Avi's runtime. Holds the current compilation state, derives the appearance
 * from it, and fans changes out to subscribers.
 *
 * Deliberately framework-free — no React, no three.js — so the same instance can
 * drive a DOM overlay, an R3F mesh, or a test assertion.
 */
export class AviMascot {
  readonly profile: MascotProfile;

  private state: CompilationState;
  private readonly pick: (count: number) => number;
  private readonly subscribers = new Set<MascotSubscriber>();
  private utteranceCursor = 0;

  constructor(options: AviMascotOptions = {}) {
    this.profile = options.profile ?? AVI_PROFILE;
    this.state = options.initialState ?? "idle";
    // Round-robin by default: deterministic, and never repeats a line twice
    // running the way random selection would.
    this.pick = options.pick ?? ((count) => this.utteranceCursor % count);
  }

  /** Avi's display name. */
  get name(): string {
    return this.profile.name;
  }

  /** The current compilation state. */
  getState(): CompilationState {
    return this.state;
  }

  /** Subscribe to appearance changes. Returns an unsubscribe function. */
  subscribe(fn: MascotSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /**
   * Move Avi to a new compilation state. No-ops when the state is unchanged, so
   * a hot-reload loop reporting `compiling` every tick will not spam
   * subscribers.
   */
  setCompilationState(state: CompilationState): MascotAppearance {
    if (state === this.state) return this.getAppearance();
    this.state = state;
    this.utteranceCursor++;

    const appearance = this.getAppearance();
    for (const fn of this.subscribers) fn(appearance);
    return appearance;
  }

  /**
   * Drive Avi from the agent mesh's worst severity — lets the same blossom that
   * reports build health also report ceremony-validation health.
   */
  setFromSeverity(severity: Severity): MascotAppearance {
    return this.setCompilationState(SEVERITY_TO_STATE[severity]);
  }

  /** The antenna's appearance for the current state. */
  getAntenna(): BlossomAntennaState {
    const entry = STATE_TABLE[this.state];
    return {
      color: entry.color,
      glowIntensity: entry.glowIntensity,
      pulseHz: entry.pulseHz,
      openness: entry.openness,
    };
  }

  /** The face expression for the current state. */
  getExpression(): FaceExpression {
    return STATE_TABLE[this.state].expression;
  }

  /** Everything a renderer needs for the current frame. */
  getAppearance(): MascotAppearance {
    return {
      state: this.state,
      expression: this.getExpression(),
      antenna: this.getAntenna(),
      shellColor: this.profile.chassis.shellColor,
    };
  }

  /**
   * A line for the current state, shaped by the personality dials: low
   * `encouragement` drops the sign-off, high `whimsy` keeps the warmer phrasing.
   */
  speak(): Utterance {
    const lines = UTTERANCES[this.state];
    const index = Math.abs(this.pick(lines.length)) % lines.length;
    const base = lines[index];
    const { encouragement, verbosity } = this.profile.personality;

    const wantsSignOff =
      encouragement > 0.75 && verbosity > 0.3 && (this.state === "error" || this.state === "warning");

    return {
      state: this.state,
      expression: this.getExpression(),
      line: wantsSignOff ? `${base} You've got this.` : base,
    };
  }

  /** One-line summary of Avi's configuration, for logs and debug overlays. */
  describe(): string {
    const { chassis, antenna, personality } = this.profile;
    return (
      `${this.profile.name} · ${chassis.archetype} · ` +
      `${antenna.petalCount}-petal blossom antenna (${antenna.restColor} → ${antenna.alertColor}) · ` +
      `warmth ${personality.warmth.toFixed(2)}, depth ${personality.technicalDepth.toFixed(2)} · ` +
      `state "${this.state}"`
    );
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Is this state one the user should act on? */
export function needsAttention(state: CompilationState): boolean {
  return state === "warning" || state === "error";
}

/**
 * The more urgent of two states, ranked through the shared severity scale so
 * Avi and the agent mesh can never disagree about which is worse.
 */
export function moreUrgent(a: CompilationState, b: CompilationState): CompilationState {
  const rank = (state: CompilationState): number =>
    severityRank(STATE_TO_SEVERITY[state]);
  return rank(b) > rank(a) ? b : a;
}
