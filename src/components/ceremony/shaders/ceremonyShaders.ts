/**
 * ceremonyShaders.ts
 * -----------------------------------------------------------------------------
 * GLSL material hooks for the Living Ceremony Layer's high-end surfaces.
 *
 * Every program is self-contained source plus a typed uniform contract. The base
 * uniform block ({@link CeremonyUniforms}) is shared by all of them so the canvas
 * can drive every ceremony material from one animation loop, and so
 * `applyWorldFade` can cross-fade them by writing a single `uOpacity`.
 *
 * Authored materials: `goldLeaf` (beaten foil), `rawSilk` (woven, translucent
 * drapery), `banyanLeaf` (layered foliage). `hennaVine` and `ember` remain
 * placeholder hooks — swap their fragment bodies without touching the TS
 * surface or <CeremonyCanvas />.
 *
 * Materials that need more than the base block extend it with their own
 * uniforms and ship a matching factory ({@link createSilkUniforms},
 * {@link createLeafUniforms}); the extra names are declared only in the stages
 * that read them.
 */

import type { Vec3 } from "../ceremonyConfig";

// -----------------------------------------------------------------------------
// Uniform contract
// -----------------------------------------------------------------------------

/** A three.js-compatible uniform holder: `{ value: T }`. */
export interface Uniform<T> {
  value: T;
}

/**
 * The uniform set every ceremony shader receives. Kept as plain data so it can
 * be constructed without importing three.js; colours are `Vec3` in `0..1`.
 */
export interface CeremonyUniforms {
  /** Elapsed time in seconds, advanced every frame. */
  readonly uTime: Uniform<number>;
  /** Dominant chapter colour (linear RGB, 0..1). */
  readonly uPrimary: Uniform<Vec3>;
  /** Accent chapter colour (linear RGB, 0..1). */
  readonly uSecondary: Uniform<Vec3>;
  /** Emissive hotspot colour (linear RGB, 0..1). */
  readonly uEmissive: Uniform<Vec3>;
  /** Key-light colour derived from the chapter's Kelvin temperature. */
  readonly uLightColor: Uniform<Vec3>;
  /**
   * World-space *direction toward the key light* (normalized). Lets the gold
   * material catch the scene's directional light as the chapter's light moves.
   */
  readonly uLightDir: Uniform<Vec3>;
  /**
   * Cross-fade progress of the *current* chapter transition, `0..1`.
   * `0` = fully previous chapter, `1` = fully settled on current chapter.
   */
  readonly uTransition: Uniform<number>;
  /** Overall material opacity, `0..1`. Drives world cross-fades. */
  readonly uOpacity: Uniform<number>;
}

/** Convenience factory producing a fresh, mutable uniform set with defaults. */
export function createCeremonyUniforms(): CeremonyUniforms {
  return {
    uTime: { value: 0 },
    uPrimary: { value: [1, 1, 1] },
    uSecondary: { value: [1, 1, 1] },
    uEmissive: { value: [1, 1, 1] },
    uLightColor: { value: [1, 1, 1] },
    uLightDir: { value: [0, 1, 0] },
    uTransition: { value: 1 },
    uOpacity: { value: 1 },
  };
}

/**
 * Extra uniforms for {@link CEREMONY_SHADERS.rawSilk}.
 *
 * The silk is lit by two sources: the chapter's key light (already in the base
 * block) and a nearby *point* firelight, which is what actually glows through
 * the cloth after dusk. The point source is passed as a world position rather
 * than a three.js light because the transmission term needs it in the fragment
 * stage, where a `ShaderMaterial` sees no scene lights at all.
 */
export interface SilkUniforms extends CeremonyUniforms {
  /** Peak sway displacement in world units, at the free hem of a panel. */
  readonly uWind: Uniform<number>;
  /** Thread count across one UV tile. Higher = finer weave. */
  readonly uWeave: Uniform<number>;
  /** World position of the firelight the cloth transmits. */
  readonly uHearthPos: Uniform<Vec3>;
  /** Firelight brightness, `0..~1`. Driven per-frame to flicker with the fire. */
  readonly uHearthPulse: Uniform<number>;
}

/** Fresh silk uniform set: base block plus the weave/wind/firelight controls. */
export function createSilkUniforms(): SilkUniforms {
  return {
    ...createCeremonyUniforms(),
    uWind: { value: 0.04 },
    uWeave: { value: 90 },
    uHearthPos: { value: [0, 0, 0] },
    uHearthPulse: { value: 1 },
  };
}

/**
 * Extra uniforms for {@link CEREMONY_SHADERS.banyanLeaf}.
 *
 * The canopy is drawn as concentric shells; `uLayer` tells a shell how deep in
 * the foliage it sits, which drives its occlusion, translucency and sway.
 */
export interface LeafUniforms extends CeremonyUniforms {
  /** Peak sway displacement in world units for the outermost shell. */
  readonly uWind: Uniform<number>;
  /** Shell depth: `0` = outermost, `1` = innermost. */
  readonly uLayer: Uniform<number>;
  /** Offset into the foliage noise field, so shells never line up into rings. */
  readonly uSeed: Uniform<number>;
  /** Foliage density below which a fragment is dropped. `0` disables cutout. */
  readonly uCutoff: Uniform<number>;
}

/** Fresh leaf uniform set: base block plus the per-shell foliage controls. */
export function createLeafUniforms(): LeafUniforms {
  return {
    ...createCeremonyUniforms(),
    uWind: { value: 0.05 },
    uLayer: { value: 0 },
    uSeed: { value: 0 },
    uCutoff: { value: 0 },
  };
}

/**
 * The lantern ring, as seen by the ground materials of the proposal glade.
 *
 * A `ShaderMaterial` sees no scene lights, and eight point lights would be
 * eight extra loop iterations in every lit fragment for the whole scene. Since
 * the lanterns are a *regular ring*, the moss and flora can instead solve for
 * the nearest one analytically: fold the fragment's azimuth into one sector and
 * apply the law of cosines. That is one `cos` and a square root, independent of
 * how many lanterns the ring actually has.
 */
export interface GladeRingUniforms {
  /** Radius of the lantern ring, in world units. */
  readonly uRingRadius: Uniform<number>;
  /** How many lanterns are spaced around it. */
  readonly uRingCount: Uniform<number>;
  /** Height of the lantern heads above the glade floor. */
  readonly uRingHeight: Uniform<number>;
  /** Collective lantern brightness, `0..~1`. Driven per-frame to breathe. */
  readonly uRingPulse: Uniform<number>;
  /** Height of the single lantern floating at the centre of the ring. */
  readonly uCentreHeight: Uniform<number>;
}

function createGladeRingUniforms(): GladeRingUniforms {
  return {
    uRingRadius: { value: 2.4 },
    uRingCount: { value: 8 },
    uRingHeight: { value: 2.6 },
    uRingPulse: { value: 1 },
    uCentreHeight: { value: 2.1 },
  };
}

/** Extra uniforms for {@link CEREMONY_SHADERS.crystalFacet}. */
export interface CrystalUniforms extends CeremonyUniforms {
  /** Strength of the RGB split at grazing angles — the iridescent edge. */
  readonly uDispersion: Uniform<number>;
  /** Brightness of the core burning inside the crystal. */
  readonly uCoreGlow: Uniform<number>;
  readonly uRingPulse: Uniform<number>;
}

/** Fresh crystal uniform set. */
export function createCrystalUniforms(): CrystalUniforms {
  return {
    ...createCeremonyUniforms(),
    uDispersion: { value: 0.055 },
    uCoreGlow: { value: 1.5 },
    uRingPulse: { value: 1 },
  };
}

/** Extra uniforms for {@link CEREMONY_SHADERS.lightShaft}. */
export interface ShaftUniforms extends CeremonyUniforms {
  /** Overall shaft brightness before the world fade. */
  readonly uIntensity: Uniform<number>;
  /** Density of the drifting motes suspended in the beam. */
  readonly uMotes: Uniform<number>;
  readonly uRingPulse: Uniform<number>;
}

/** Fresh light-shaft uniform set. */
export function createShaftUniforms(): ShaftUniforms {
  return {
    ...createCeremonyUniforms(),
    uIntensity: { value: 0.55 },
    uMotes: { value: 0.5 },
    uRingPulse: { value: 1 },
  };
}

/** Extra uniforms for {@link CEREMONY_SHADERS.mossCarpet}. */
export interface MossUniforms extends CeremonyUniforms, GladeRingUniforms {
  /** Size of one moss clump in world units. Smaller = finer carpet. */
  readonly uClumpScale: Uniform<number>;
  /** Radius of the glade floor, used to fall the moss off into the dark. */
  readonly uGladeRadius: Uniform<number>;
}

/** Fresh moss uniform set. */
export function createMossUniforms(): MossUniforms {
  return {
    ...createCeremonyUniforms(),
    ...createGladeRingUniforms(),
    uClumpScale: { value: 11.0 },
    uGladeRadius: { value: 4.6 },
  };
}

/** Extra uniforms for {@link CEREMONY_SHADERS.wildflower}. */
export interface FlowerUniforms extends CeremonyUniforms, GladeRingUniforms {
  /** Peak sway displacement at the tip of a stem, in world units. */
  readonly uSway: Uniform<number>;
  /** Bloom tint, linear RGB. */
  readonly uBloom: Uniform<Vec3>;
  /** How hot the bloom's throat burns. */
  readonly uBloomGlow: Uniform<number>;
}

/** Extra uniforms for {@link CEREMONY_SHADERS.wisteriaBloom}. */
export interface WisteriaUniforms extends CeremonyUniforms {
  /** Peak sway at the tip of a raceme, in world units. */
  readonly uSway: Uniform<number>;
  /** Colour at the crown of a raceme, where the florets are newest. */
  readonly uPetalTop: Uniform<Vec3>;
  /** Colour at the tip, where they have opened and paled. */
  readonly uPetalTip: Uniform<Vec3>;
}

/** Fresh wisteria uniform set. */
export function createWisteriaUniforms(): WisteriaUniforms {
  return {
    ...createCeremonyUniforms(),
    uSway: { value: 0.05 },
    uPetalTop: { value: [0.26, 0.17, 0.42] },
    uPetalTip: { value: [0.5, 0.42, 0.66] },
  };
}

/**
 * Extra uniforms for {@link CEREMONY_SHADERS.guestSilhouette}.
 *
 * Carries the rig ({@link StageRigUniforms}) because the crowd is lit *by* it:
 * the rim has to know where the lamps actually are, so it sweeps across the
 * house as they turn instead of outlining every figure evenly.
 */
export interface CrowdUniforms extends CeremonyUniforms, StageRigUniforms {
  /** Height of a figure in local units, for normalising the body gradient. */
  readonly uHeight: Uniform<number>;
  /** Cool half of the rim — the lavender. */
  readonly uRimCool: Uniform<Vec3>;
  /** Warm half of the rim — the gold. */
  readonly uRimWarm: Uniform<Vec3>;
  /** Rim gain. Pushed just over the bloom threshold so the crowd glows softly. */
  readonly uRimGain: Uniform<number>;
  /** Peak idle sway at the head, in world units. */
  readonly uSway: Uniform<number>;
  /** Peak breath swell through the chest, in world units. */
  readonly uBreath: Uniform<number>;
  /**
   * How much light carries *through* a figure. Guests are drawn opaque — forty
   * of them share one instanced draw call, and instances within a call cannot
   * be depth-sorted, so genuine alpha would blend them in arbitrary order
   * wherever they overlap. This is the translucency read without that cost: a
   * transmission term that lifts the thin edges when a lamp is behind them.
   */
  readonly uTransmit: Uniform<number>;
}

/** Fresh crowd uniform set. */
export function createCrowdUniforms(): CrowdUniforms {
  return {
    ...createCeremonyUniforms(),
    uRigRadius: { value: 3.2 },
    uRigCount: { value: 10 },
    uRigHeight: { value: 4.3 },
    uRigSpin: { value: 0 },
    uRigPulse: { value: 1 },
    uRigAimY: { value: 0.3 },
    uHeight: { value: 1.55 },
    uRimCool: { value: [0.61, 0.48, 0.78] },
    uRimWarm: { value: [0.78, 0.63, 0.29] },
    uRimGain: { value: 1.0 },
    uSway: { value: 0.035 },
    uBreath: { value: 0.012 },
    uTransmit: { value: 1.0 },
  };
}

/**
 * The sangeet's overhead rig, as seen by the stage surfaces.
 *
 * Same trick as the glade's lantern ring and for the same reason — a
 * `ShaderMaterial` sees no scene lights, and a dozen moving spots would be a
 * dozen loop iterations in every lit fragment. The rig is a regular ring, so
 * the stone solves for the nearest lamp analytically and the whole rig costs
 * one `cos` and a square root regardless of how many lamps hang on it.
 */
export interface StageRigUniforms {
  readonly uRigRadius: Uniform<number>;
  readonly uRigCount: Uniform<number>;
  readonly uRigHeight: Uniform<number>;
  /** Rotation of the whole rig, in radians. Swept per-frame. */
  readonly uRigSpin: Uniform<number>;
  /** Master brightness of the rig, `0..~1`. */
  readonly uRigPulse: Uniform<number>;
  /** Height the fixtures are aimed at — the stage floor. */
  readonly uRigAimY: Uniform<number>;
}

/** Extra uniforms for {@link CEREMONY_SHADERS.stagePolish}. */
export interface StageUniforms extends CeremonyUniforms, StageRigUniforms {
  /** 0 = honed faceted tier, 1 = mirror-polished stage floor. */
  readonly uPolish: Uniform<number>;
  /** Facet size in world units. Larger = coarser cleave. */
  readonly uFacetScale: Uniform<number>;
}

/** Fresh stage uniform set. */
export function createStageUniforms(): StageUniforms {
  return {
    ...createCeremonyUniforms(),
    uRigRadius: { value: 3.2 },
    uRigCount: { value: 10 },
    uRigHeight: { value: 4.4 },
    uRigSpin: { value: 0 },
    uRigPulse: { value: 1 },
    uRigAimY: { value: 0.3 },
    uPolish: { value: 0 },
    uFacetScale: { value: 3.4 },
  };
}

/**
 * Extra uniforms for {@link CEREMONY_SHADERS.walnutWood}.
 *
 * The library is lit almost entirely by its own hearth, and a `ShaderMaterial`
 * sees no scene lights — so the fire arrives as a world position and a pulse,
 * the same contract the mehendi silk uses for its brazier.
 */
export interface WalnutUniforms extends CeremonyUniforms {
  /** Growth-ring frequency. Higher = tighter, older timber. */
  readonly uRingScale: Uniform<number>;
  /** Satin sheen gain on the polished faces. */
  readonly uSheen: Uniform<number>;
  /** World position of the hearth fire. */
  readonly uHearthPos: Uniform<Vec3>;
  /** Firelight brightness, `0..~1`. Driven per-frame to flicker. */
  readonly uHearthPulse: Uniform<number>;
}

/** Fresh walnut uniform set. */
export function createWalnutUniforms(): WalnutUniforms {
  return {
    ...createCeremonyUniforms(),
    uRingScale: { value: 5.5 },
    uSheen: { value: 1.0 },
    uHearthPos: { value: [0, 0.5, -0.7] },
    uHearthPulse: { value: 1 },
  };
}

/** Extra uniforms for {@link CEREMONY_SHADERS.leatherSpine}. */
export interface SpineUniforms extends CeremonyUniforms {
  readonly uHearthPos: Uniform<Vec3>;
  readonly uHearthPulse: Uniform<number>;
}

/** Fresh book-spine uniform set. */
export function createSpineUniforms(): SpineUniforms {
  return {
    ...createCeremonyUniforms(),
    uHearthPos: { value: [0, 0.5, -0.7] },
    uHearthPulse: { value: 1 },
  };
}

/** Extra uniforms for {@link CEREMONY_SHADERS.sacredFire}. */
export interface FireUniforms extends CeremonyUniforms {
  /** Peak lateral whip at the tip of a flame, in world units. */
  readonly uTurbulence: Uniform<number>;
  /** Overall opacity of the flame sheath. */
  readonly uCore: Uniform<number>;
  /** How fast fuel is advected up the column. */
  readonly uRise: Uniform<number>;
}

/** Fresh sacred-fire uniform set. */
export function createFireUniforms(): FireUniforms {
  return {
    ...createCeremonyUniforms(),
    uTurbulence: { value: 0.035 },
    uCore: { value: 1.0 },
    uRise: { value: 2.6 },
  };
}

/** Extra uniforms for {@link CEREMONY_SHADERS.smokePlume}. */
export interface SmokeUniforms extends CeremonyUniforms {
  /** Overall smoke density. */
  readonly uDensity: Uniform<number>;
  /** How fast the column drifts upward. */
  readonly uRise: Uniform<number>;
}

/** Fresh smoke uniform set. */
export function createSmokeUniforms(): SmokeUniforms {
  return {
    ...createCeremonyUniforms(),
    uDensity: { value: 0.85 },
    uRise: { value: 0.42 },
  };
}

/** Extra uniforms for {@link CEREMONY_SHADERS.veinedMarble}. */
export interface MarbleUniforms extends CeremonyUniforms {
  /** Vein lattice frequency. Higher = tighter, busier veining. */
  readonly uVeinScale: Uniform<number>;
  /** Specular gain. 1 is a honed finish, 3 a mirror polish. */
  readonly uPolish: Uniform<number>;
  /** Height the pavilion floor sits at, for the contact-darkening term. */
  readonly uFloorY: Uniform<number>;
}

/** Fresh marble uniform set. */
export function createMarbleUniforms(): MarbleUniforms {
  return {
    ...createCeremonyUniforms(),
    uVeinScale: { value: 1.5 },
    uPolish: { value: 1.15 },
    uFloorY: { value: 0 },
  };
}

/** Extra uniforms shared by the water surface and the reflections beneath it. */
export interface WaterUniforms extends CeremonyUniforms {
  /** Wavelet frequency across the pool. */
  readonly uRippleScale: Uniform<number>;
  /** Peak wavelet height, in world units. */
  readonly uRippleHeight: Uniform<number>;
  /** Strength of the expanding drop rings. `0` stills the pool. */
  readonly uDrops: Uniform<number>;
  /** Y of the water plane — the mirror the reflections are cast about. */
  readonly uWaterY: Uniform<number>;
}

/** Fresh water uniform set. */
export function createWaterUniforms(): WaterUniforms {
  return {
    ...createCeremonyUniforms(),
    uRippleScale: { value: 1.0 },
    uRippleHeight: { value: 0.05 },
    uDrops: { value: 1.0 },
    uWaterY: { value: 0 },
  };
}

/** Fresh wildflower uniform set. */
export function createFlowerUniforms(): FlowerUniforms {
  return {
    ...createCeremonyUniforms(),
    ...createGladeRingUniforms(),
    uSway: { value: 0.035 },
    uBloom: { value: [0.9, 0.78, 0.95] },
    uBloomGlow: { value: 1 },
  };
}

// -----------------------------------------------------------------------------
// Shared GLSL chunks
// -----------------------------------------------------------------------------

/** Uniform + varying preamble injected into every ceremony fragment shader. */
const SHARED_PREAMBLE = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3  uPrimary;
  uniform vec3  uSecondary;
  uniform vec3  uEmissive;
  uniform vec3  uLightColor;
  uniform vec3  uLightDir;
  uniform float uTransition;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
`;

/**
 * Vertex shader shared by all ceremony materials — passes uv, world normal, and
 * world position (the latter needed for view-dependent lighting + facet normals).
 */
export const CEREMONY_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/**
 * Cheap 3D value noise with smoothstep interpolation. Shared verbatim by every
 * program that needs a micro-surface field, so the hammered gold and the banyan
 * foliage sample the same lattice.
 */
const VALUE_NOISE_3D = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float valueNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
`;

/**
 * Model matrix including the per-instance transform.
 *
 * Three.js declares `attribute mat4 instanceMatrix` and defines `USE_INSTANCING`
 * for a (non-raw) `ShaderMaterial` whenever the object being drawn is an
 * `InstancedMesh` — so one vertex stage can serve both cases, and the glade's
 * thousand-odd moss tufts and blooms can sway from a single draw call.
 */
const INSTANCED_MODEL_MATRIX = /* glsl */ `
  mat4 instancedModelMatrix() {
    #ifdef USE_INSTANCING
      return modelMatrix * instanceMatrix;
    #else
      return modelMatrix;
    #endif
  }
`;

/**
 * Analytic lighting from the glade's lantern ring — see
 * {@link GladeRingUniforms} for why this is not eight point lights.
 *
 * Returns `x` = falloff at the shading point, `y` = distance to the nearest
 * lantern (so callers can shape their own gradients from it).
 */
const GLADE_RING_LIGHT = /* glsl */ `
  uniform float uRingRadius;
  uniform float uRingCount;
  uniform float uRingHeight;
  uniform float uRingPulse;
  uniform float uCentreHeight;

  vec2 ringLight(vec3 worldPos) {
    // Fold the azimuth into a single sector: every lantern is equivalent, so
    // only the nearest one needs solving for.
    float sector = 6.2831853 / max(uRingCount, 1.0);
    float a = mod(atan(worldPos.z, worldPos.x) + sector * 0.5, sector) - sector * 0.5;

    // Law of cosines in the ground plane, plus the lantern's height.
    float r = length(worldPos.xz);
    float planar = r * r + uRingRadius * uRingRadius
                 - 2.0 * r * uRingRadius * cos(a);
    float dy = uRingHeight - worldPos.y;
    float d = sqrt(max(planar + dy * dy, 1e-4));

    // The lantern floating at the centre, which the ring solve cannot see.
    float c = length(worldPos - vec3(0.0, uCentreHeight, 0.0));

    float fall = 1.0 / (1.0 + d * d * 0.55) + 0.85 / (1.0 + c * c * 0.5);
    return vec2(uRingPulse * fall, min(d, c));
  }
`;

/**
 * Vertex stage for {@link CEREMONY_SHADERS.rawSilk}.
 *
 * Cloth panels are authored with `uv.y == 1` at the rail they are tied to and
 * `0` at the free hem, so the sway envelope can be read straight off the UVs
 * with no extra attribute.
 */
const RAW_SILK_VERTEX = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uWind;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  varying float vHang;

  void main() {
    vUv = uv;

    // Quadratic envelope: the cloth stays pinned where it is fixed and moves
    // most where it hangs free.
    float hang = 1.0 - uv.y;
    vHang = hang;
    float amp = hang * hang * uWind;

    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);

    // Two travelling waves at different rates and wavelengths, both keyed to
    // *world* position — so every panel in the scene breathes out of step with
    // its neighbours without needing a per-panel uniform or phase attribute.
    float p1 = uTime * 0.85 + world.x * 2.70 + world.z * 1.90;
    float p2 = uTime * 1.63 + world.x * 1.30 - world.z * 3.40 + 2.1;
    float wave = sin(p1) * 0.62 + sin(p2) * 0.38;

    world.xyz += n * wave * amp;

    // Analytic gradient of that same field, flattened into the panel, tilts the
    // shading normal to match the billow. Cheaper and far smoother than
    // rebuilding it from screen-space derivatives in the fragment stage.
    vec3 grad = vec3(
      cos(p1) * 2.70 * 0.62 + cos(p2) * 1.30 * 0.38,
      0.0,
      cos(p1) * 1.90 * 0.62 - cos(p2) * 3.40 * 0.38
    ) * amp;
    grad -= n * dot(grad, n);

    vWorldPos    = world.xyz;
    vWorldNormal = normalize(n - grad);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Vertex stage for {@link CEREMONY_SHADERS.banyanLeaf}. Local position is passed
 * through untouched so the foliage field stays welded to the tree instead of
 * swimming as the shell sways.
 */
const BANYAN_LEAF_VERTEX = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uWind;
  uniform float uLayer;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  varying vec3  vLocalPos;

  void main() {
    vUv = uv;
    vLocalPos = position;

    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);

    // Only the outer shells stir; the inner mass of a banyan barely moves.
    float sway = (1.0 - uLayer) * uWind;
    world.xyz += n * sin(uTime * 0.62 + world.x * 0.9 + world.z * 0.7) * sway;
    world.x   += sin(uTime * 0.41 + world.y * 1.7) * sway * 0.55;

    vWorldPos    = world.xyz;
    vWorldNormal = n;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// -----------------------------------------------------------------------------
// Fragment shaders (one per material hook)
// -----------------------------------------------------------------------------

/**
 * Hook: beaten gold leaf. A faceted metallic look — flat per-triangle facets
 * (derived from screen-space derivatives) perturbed by a hammered-foil noise
 * field, lit by the scene's key light with a warm diffuse ramp, tight specular
 * glints, and a Fresnel rim. The `cameraPosition` uniform is provided
 * automatically by three.js ShaderMaterial (world space).
 */
const GOLD_LEAF_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  // --- cheap value noise for the hammered-foil micro-surface --------------
  ${VALUE_NOISE_3D}

  void main() {
    // Faceted normal: the flat normal of this triangle, giving crisp gold
    // panels. Blend a touch of the smooth normal so silhouettes stay round.
    vec3 flatN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    flatN *= sign(dot(flatN, vWorldNormal));   // keep facets facing outward
    vec3 N = normalize(mix(vWorldNormal, flatN, 0.85));

    // Hammered dents: perturb the normal with a couple of noise octaves.
    float dents = valueNoise(vWorldPos * 9.0) * 0.65
                + valueNoise(vWorldPos * 22.0) * 0.35;
    vec3 jitter = vec3(
      valueNoise(vWorldPos * 18.0 + 3.1),
      valueNoise(vWorldPos * 18.0 + 8.7),
      valueNoise(vWorldPos * 18.0 + 14.3)
    ) - 0.5;
    N = normalize(N + jitter * 0.22);

    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    // Metallic lighting terms.
    float diff = clamp(dot(N, L), 0.0, 1.0);
    float wrap = diff * 0.75 + 0.25;                      // soft gold falloff
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 64.0);   // tight foil glints
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    // Drifting sheen streaks — the sweep of light across beaten metal.
    float sheen = 0.5 + 0.5 * sin(dot(vWorldPos.xy, vec2(6.0)) + uTime * 0.5 + dents * 6.2831);

    // Compose: warm base in light, cooler secondary in shadow.
    vec3 shadowTone = mix(uPrimary, uSecondary, 0.55) * 0.35;
    vec3 color = mix(shadowTone, uPrimary, wrap);
    color *= uLightColor;                    // tint everything by light temp
    color += uLightColor * spec * 1.35;      // specular glints
    color += uEmissive * fres * 0.55;        // warm Fresnel rim
    color += uEmissive * sheen * 0.10;       // foil streak shimmer
    color *= mix(0.82, 1.18, dents);         // hammered brightness variation

    // Gentle brighten as a chapter settles in.
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

/**
 * Raw silk drapery.
 *
 * Three things separate silk from "a coloured plane": the weave, the lustre it
 * produces, and the fact that you can see light *through* it.
 *
 *  - **Weave** — warp and weft as two crossed sine trains. Their product is the
 *    over/under of the cloth and drives a micro-roughness field; their signs
 *    steer a thread-aligned normal perturbation, which is what breaks the
 *    highlight into threads instead of pooling it across the panel. A slow
 *    `slub` term thickens irregular threads, the signature of *raw* silk rather
 *    than a machine-even satin.
 *  - **Lustre** — a specular exponent that rides the micro-roughness, plus a
 *    grazing-angle sheen.
 *  - **Transmission** — the distorted half-vector approximation, evaluated
 *    against both the chapter key light and a nearby point firelight. A
 *    `ShaderMaterial` sees no scene lights, so the fire arrives as
 *    `uHearthPos` / `uHearthPulse`.
 */
const RAW_SILK_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uWeave;
  uniform vec3  uHearthPos;
  uniform float uHearthPulse;

  varying float vHang;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // --- woven micro-surface ------------------------------------------------
    vec2  w    = vUv * uWeave;
    float warp = sin(w.x * 6.2831853);
    float weft = sin(w.y * 6.2831853);
    float micro = 0.5 + 0.5 * warp * weft;   // 1 on a thread crown, 0 in a valley

    // Slub: low-frequency thickened threads running with the weft.
    float slub = sin(w.y * 0.37 + sin(w.x * 0.11) * 3.0);
    slub *= slub;

    // Crowns are smooth and take the specular; the valleys between them
    // scatter. This is the micro-roughness the sheen exponent rides on.
    float rough = mix(0.22, 0.58, micro) + slub * 0.12;

    // Tip the normal along the weave. Guarding the cross product keeps the
    // taut, upward-facing canopy panel from degenerating.
    vec3 tX = normalize(cross(N, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
    vec3 tY = cross(N, tX);
    N = normalize(N + (tX * warp + tY * weft) * 0.055);

    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    // Cloth is thin, so the terminator wraps well past the geometric 90°.
    float diff  = clamp((dot(N, L) + 0.45) / 1.45, 0.0, 1.0);
    float shine = pow(clamp(dot(N, H), 0.0, 1.0), mix(96.0, 16.0, rough));
    float sheen = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);

    // --- subsurface transmission --------------------------------------------
    // Unlined panels are thinnest at the hem, where they hang as a single layer
    // rather than gathered; and the open valleys of the weave pass more light
    // than the thread crowns do.
    float thin = mix(0.42, 1.0, vHang) * mix(1.18, 0.78, micro);

    vec3  toFire   = uHearthPos - vWorldPos;
    float fireDist = length(toFire);
    vec3  Lf       = toFire / max(fireDist, 1e-3);
    float fall     = 1.0 / (1.0 + fireDist * fireDist * 0.55);

    vec3  Hk = normalize(L  + N * 0.35);
    vec3  Hf = normalize(Lf + N * 0.35);
    float transKey  = pow(clamp(dot(V, -Hk), 0.0, 1.0), 3.6);
    float transFire = pow(clamp(dot(V, -Hf), 0.0, 1.0), 2.2) * fall * uHearthPulse;

    // --- compose --------------------------------------------------------------
    vec3 dyed  = mix(uPrimary, uSecondary, 0.55 + slub * 0.22);
    vec3 shade = dyed * 0.26;

    vec3 color = mix(shade, dyed * 1.45, diff) * uLightColor;
    color += uLightColor * shine * (0.42 + micro * 0.5);
    color += mix(uSecondary, uEmissive, 0.45) * sheen * 0.30;

    // Firelight blooming through the cloth — after dusk this is most of what
    // lights the drapes at all.
    color += uEmissive   * transFire * thin * 2.30;
    color += uLightColor * transKey  * thin * 0.45;

    color *= mix(0.90, 1.08, slub);
    color *= mix(0.92, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

/**
 * Layered banyan foliage.
 *
 * Drawn as concentric shells, each shading itself as a slab of leaves rather
 * than as a surface. Two noise scales stand in for two depths of planting
 * (boughs, and the clumps hung off them) with a cheap trigonometric speckle for
 * individual leaves.
 *
 * The scatter is the point: the gradient of the clump field tips the shading
 * normal per-fragment, so a single key direction arrives at the canopy as a
 * spread of directions. That, plus a per-shell occlusion term, is what stops a
 * low-poly dome from reading as a dome.
 *
 * Cost is deliberately capped at five noise taps per fragment — two field
 * samples and a three-tap forward-difference gradient — because the canopy fills
 * a large share of the frame and is drawn three times over.
 */
const BANYAN_LEAF_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uLayer;
  uniform float uSeed;
  uniform float uCutoff;

  varying vec3 vLocalPos;

  ${VALUE_NOISE_3D}

  // Forward-difference gradient: three extra taps rather than the textbook six.
  // The field only tilts a shading normal, so the half-step skew is invisible.
  vec3 noiseGrad(vec3 p, float centre, float eps) {
    return vec3(
      valueNoise(p + vec3(eps, 0.0, 0.0)) - centre,
      valueNoise(p + vec3(0.0, eps, 0.0)) - centre,
      valueNoise(p + vec3(0.0, 0.0, eps)) - centre
    ) / eps;
  }

  void main() {
    vec3 P = vLocalPos + uSeed;

    float bough = valueNoise(P * 1.6);
    vec3  Pc    = P * 5.4 + 11.3;
    float clump = valueNoise(Pc);

    // Individual leaves, as two crossed high-frequency trains. Trigonometric
    // rather than sampled, so its gradient below is analytic and costs two
    // cosines instead of three more noise taps.
    float la    = P.x * 31.0 + P.y * 27.0;
    float lb    = P.z * 29.0 + P.y * 23.0;
    float sa    = sin(la);
    float sb    = sin(lb);
    float leaf  = 0.5 + 0.5 * sa * sb;

    // Weighted toward the mid scale: the clump is the thing the eye reads as
    // foliage, with the boughs only massing it and the leaves only speckling it.
    float mass  = bough * 0.40 + clump * 0.42 + leaf * 0.18;

    // The outer shells dissolve into clumps instead of ending on a clean dome
    // edge. The innermost passes a cutoff of 0 and never takes the branch.
    if (mass < uCutoff) discard;

    // --- dynamic scatter of the incoming light angle ------------------------
    // Two scales tip the shading normal: the clump gradient spreads the key
    // across the canopy at foliage scale, and the leaf gradient breaks it again
    // at leaf scale. One key direction therefore arrives as a wide spread of
    // directions, which is what a slab of leaves actually does to light.
    vec3 g = noiseGrad(Pc, clump, 0.42);
    vec3 gl = vec3(
      31.0 * cos(la) * sb,
      27.0 * cos(la) * sb + 23.0 * sa * cos(lb),
      29.0 * sa * cos(lb)
    );
    vec3 N = normalize(
      vWorldNormal * (0.55 + uLayer * 0.35) - g * 0.75 - gl * 0.012
    );

    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Foliage wraps hard: a leaf at the edge of the light is still lit through
    // by the ones behind it.
    float diff = clamp((dot(N, L) + 0.55) / 1.55, 0.0, 1.0);

    // Backlit leaves — strongest on the outer shells, where a single leaf
    // stands between the key light and the eye.
    float trans = pow(clamp(dot(V, -normalize(L + N * 0.4)), 0.0, 1.0), 3.0)
                * (1.0 - uLayer);

    // Depth: the deeper the shell and the denser the clump, the less sky
    // reaches it. The wide range is deliberate — the near-black gaps between
    // clumps are what read as depth, and a canopy without them reads as a dome.
    float occl = mix(1.0, 0.34, uLayer) * mix(0.26, 1.05, mass);

    // Leaves are waxy, not wet: a broad, weak sheen rather than a hot point.
    float glint = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 14.0) * (1.0 - uLayer);
    float rim   = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    vec3 deep = mix(uPrimary, uSecondary, 0.22) * 0.16;
    vec3 lit  = mix(uPrimary, uSecondary, 0.12 + leaf * 0.46);

    vec3 color = mix(deep, lit, diff) * occl * uLightColor;
    color += mix(uSecondary, uEmissive, 0.35) * trans * 0.55;  // backlit leaves
    color += uLightColor * glint * 0.09;                       // waxy leaf sheen
    color += uEmissive * rim * 0.10 * (1.0 - uLayer);          // lantern rim
    color *= mix(0.92, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

// -----------------------------------------------------------------------------
// Proposal — the twilight glade
// -----------------------------------------------------------------------------

/**
 * Vertex stage shared by the glade's crystal lanterns and their light shafts.
 * Instancing-aware; passes local position through for object-space fields.
 */
const GLADE_VERTEX = /* glsl */ `
  precision highp float;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  varying vec3  vLocalPos;
  varying float vSeed;

  ${INSTANCED_MODEL_MATRIX}

  void main() {
    vUv = uv;
    vLocalPos = position;

    mat4 M = instancedModelMatrix();
    vec4 world = M * vec4(position, 1.0);

    // A per-instance offset hashed from where the instance stands. Lets one
    // instanced draw call give every lantern its own caustic and its own
    // flicker phase, with no extra attribute to feed.
    vec3 root = vec3(M[3][0], M[3][1], M[3][2]);
    vSeed = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453) * 24.0;

    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(M) * normal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Micro-faceted crystal — the glade's structural lanterns.
 *
 * The body is treated as a solid of glass with something burning inside it:
 *
 *  - **Facets** come from the screen-space derivative of world position, so the
 *    low-poly hexagonal crystal shades as flat planes however coarse it is,
 *    with a fine noise field cutting further micro-facets into each face.
 *  - **Dispersion** — the Fresnel term is evaluated three times at slightly
 *    different exponents, one per channel. That splits the grazing edge into a
 *    rainbow, which is most of what separates crystal from grey glass.
 *  - **Core** — brightness rises where the surface faces the eye (thin path to
 *    the centre) and falls at the rim, so the glow reads as coming from inside
 *    the solid rather than painted on its surface.
 */
const CRYSTAL_FACET_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uDispersion;
  uniform float uCoreGlow;
  uniform float uRingPulse;

  varying vec3  vLocalPos;
  varying float vSeed;

  ${VALUE_NOISE_3D}

  void main() {
    // Flat per-triangle normal: crystal, not a sphere.
    vec3 flatN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    flatN *= sign(dot(flatN, vWorldNormal));
    vec3 N = normalize(mix(vWorldNormal, flatN, 0.92));

    // Micro-facets cut into each face.
    vec3 P = vLocalPos + vSeed;
    vec3 chip = vec3(
      valueNoise(P * 26.0 + 1.7),
      valueNoise(P * 26.0 + 9.3),
      valueNoise(P * 26.0 + 17.1)
    ) - 0.5;
    N = normalize(N + chip * 0.16);

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    float facing = clamp(dot(N, V), 0.0, 1.0);

    // Dispersion: one Fresnel per channel, exponents fanned apart.
    float base = 1.0 - facing;
    vec3 fres = vec3(
      pow(base, 3.0 - uDispersion * 12.0),
      pow(base, 3.0),
      pow(base, 3.0 + uDispersion * 12.0)
    );

    // A slow caustic wandering through the body of the stone.
    float caustic = valueNoise(P * 7.0 + vec3(0.0, uTime * 0.35, 0.0));
    caustic = pow(caustic, 2.2);

    float spark = pow(clamp(dot(N, H), 0.0, 1.0), 90.0);

    // The core: bright through the middle, extinguished at the silhouette.
    // Each lantern breathes on its own phase, taken from the instance seed.
    float breath = 0.86 + 0.14 * sin(uTime * 1.3 + vSeed);
    float core = pow(facing, 1.6) * uCoreGlow * uRingPulse * breath;

    vec3 color = uEmissive * core * (0.75 + caustic * 0.85);
    color += mix(uSecondary, vec3(1.0), 0.4) * fres * 0.85;   // iridescent rim
    color += uLightColor * spark * 1.6;                        // facet glints
    color += uSecondary * 0.06;                                // faint body tint
    color *= mix(0.9, 1.0, uTransition);

    // Glass is never fully opaque, but the burning core is: let the alpha climb
    // with the core so the lantern reads solid where it is brightest.
    float alpha = clamp(0.32 + core * 0.5 + fres.g * 0.4, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

/**
 * Light shafts falling from the lanterns — "god rays" as geometry rather than
 * as a screen-space post pass.
 *
 * Each shaft is an open, downward-widening cone drawn additively. The trick is
 * the alpha: for a real volume, a pixel's brightness is proportional to the
 * path length the eye traces through it, which for a cone is greatest through
 * the middle and falls to nothing at the silhouette. `abs(dot(N, V))` is
 * exactly that profile, so the cone's own geometry never shows an edge.
 *
 * A post-processed pass would be more physically complete, but it would apply
 * to every chapter, cost a full-screen pass per frame, and fight the existing
 * bloom. This stays inside the world that wants it and costs one transparent
 * cone per lantern.
 */
const LIGHT_SHAFT_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uIntensity;
  uniform float uMotes;
  uniform float uRingPulse;

  varying vec3  vLocalPos;
  varying float vSeed;

  ${VALUE_NOISE_3D}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Path length through the cone — and the reason no silhouette shows.
    float depth = pow(abs(dot(N, V)), 0.85);

    // uv.y runs 0 at the base of the cone to 1 at the apex, where the lantern
    // is. The beam is brightest at the source and dissolves before it lands.
    float fall = pow(clamp(vUv.y, 0.0, 1.0), 1.7);
    float foot = smoothstep(0.0, 0.22, vUv.y);   // soften where it meets moss

    // Motes drifting upward through the beam.
    float motes = valueNoise(vLocalPos * 9.0 + vSeed + vec3(0.0, -uTime * 0.28, 0.0));
    motes = pow(clamp(motes, 0.0, 1.0), 4.0) * uMotes;

    float body = depth * fall * foot;
    vec3 color = uEmissive * (body * uIntensity + motes * body * 1.6);
    color *= uRingPulse;
    color *= mix(0.85, 1.0, uTransition);

    // Additive blending: alpha scales the contribution, so the world fade rides
    // it directly and the shaft vanishes with its chapter.
    gl_FragColor = vec4(color, body * uOpacity);
  }
`;

/**
 * Vertex stage for the moss carpet. The ground is displaced geometry already;
 * this only forwards it, but it is instancing-aware so the same program can
 * shade the scattered tufts sitting on top of the plate.
 */
const MOSS_VERTEX = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${INSTANCED_MODEL_MATRIX}

  void main() {
    vUv = uv;
    vLocalPos = position;

    mat4 M = instancedModelMatrix();
    vec4 world = M * vec4(position, 1.0);

    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(M) * normal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * A dense moss carpet.
 *
 * Moss is not a surface, it is thousands of tiny upright fronds, and the thing
 * that sells it is that light arrives at all of them from slightly different
 * angles. So the shading normal is scattered at two scales — clump and frond —
 * exactly as the banyan canopy scatters at bough and leaf scale.
 *
 * It is lit by three sources: the chapter key (cool, from above), the lantern
 * ring solved analytically, and a wrapped translucency term, because damp moss
 * passes a surprising amount of light.
 */
const MOSS_CARPET_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uClumpScale;
  uniform float uGladeRadius;

  varying vec3 vLocalPos;

  ${VALUE_NOISE_3D}
  ${GLADE_RING_LIGHT}

  vec3 noiseGrad(vec3 p, float centre, float eps) {
    return vec3(
      valueNoise(p + vec3(eps, 0.0, 0.0)) - centre,
      valueNoise(p + vec3(0.0, eps, 0.0)) - centre,
      valueNoise(p + vec3(0.0, 0.0, eps)) - centre
    ) / eps;
  }

  void main() {
    vec3 P = vWorldPos * uClumpScale;

    float clump = valueNoise(P);
    vec3  g     = noiseGrad(P, clump, 0.45);

    // Frond scale, analytic so its gradient is two cosines rather than taps.
    float fa = vWorldPos.x * 42.0 + vWorldPos.z * 33.0;
    float fb = vWorldPos.z * 45.0 - vWorldPos.x * 29.0;
    float frond = 0.5 + 0.5 * sin(fa) * sin(fb);
    vec3  gf = vec3(
      42.0 * cos(fa) * sin(fb) - 29.0 * sin(fa) * cos(fb),
      0.0,
      33.0 * cos(fa) * sin(fb) + 45.0 * sin(fa) * cos(fb)
    );

    // Frond detail is far finer than a pixel once the ground recedes, and a
    // per-pixel field sampled below its Nyquist rate crawls. Fading it out with
    // distance is the cheapest possible LOD and costs one exponential.
    float detail = exp(-length(cameraPosition - vWorldPos) * 0.11);
    frond = mix(0.5, frond, detail);

    vec3 N = normalize(vWorldNormal - g * 0.30 - gf * (0.0026 * detail));

    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Cool key from above, wrapped hard — moss has no clean terminator.
    float key = clamp((dot(N, L) + 0.6) / 1.6, 0.0, 1.0);

    // Warm pools under each lantern.
    vec2  ring = ringLight(vWorldPos);
    float lantern = ring.x;

    // Damp moss passes light; the deepest clumps stay dark and hold the shadow.
    float depth = mix(0.35, 1.0, clump * 0.6 + frond * 0.4);
    float sheen = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 18.0) * 0.5;

    vec3 deep = uPrimary * 0.12;
    // Only a trace of the pale accent — any more and damp moss turns to sage.
    vec3 lit  = mix(uPrimary, uSecondary, 0.02 + frond * 0.08);

    vec3 color = mix(deep, lit, key) * depth * uLightColor;
    color += uEmissive * lantern * depth * 1.15;             // lantern pools
    color += mix(uPrimary, uEmissive, 0.5) * lantern * clump * 0.4;
    color += uLightColor * sheen * depth * 0.16;             // damp highlight

    // The floor is a finite plate, and a hard oval against the twilight would
    // give that away. Falling it off into near-black lets the fog finish the
    // job — cheaper and safer than fading alpha, which would cost depth writes.
    float rim = 1.0 - smoothstep(0.42, 0.99, length(vWorldPos.xz) / uGladeRadius);
    color *= mix(0.015, 1.0, rim);

    color *= mix(0.92, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

/**
 * Vertex stage for the wildflowers.
 *
 * Blooms are instanced, and each stem bends about its own base. `uv.y` runs 0
 * at the root to 1 at the bloom, so the sway envelope needs no extra attribute
 * — the same trick the silk drapes use, inverted.
 */
const WILDFLOWER_VERTEX = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSway;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  varying vec3  vLocalPos;
  varying float vStem;

  ${INSTANCED_MODEL_MATRIX}

  void main() {
    vUv = uv;
    vLocalPos = position;

    // Rooted at the base, free at the bloom.
    float up = clamp(uv.y, 0.0, 1.0);
    vStem = up;

    mat4 M = instancedModelMatrix();
    vec4 world = M * vec4(position, 1.0);

    // The instance's own origin, so every stem gets its own phase from where it
    // stands — no per-instance attribute needed.
    vec3 root = vec3(M[3][0], M[3][1], M[3][2]);

    float amp = up * up * uSway;
    float p1 = uTime * 1.15 + root.x * 2.2 + root.z * 1.7;
    float p2 = uTime * 0.61 + root.x * 1.1 - root.z * 2.6;

    world.x += sin(p1) * amp;
    world.z += sin(p2) * amp * 0.75;

    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(M) * normal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Procedural fairytale wildflowers.
 *
 * The bloom is shaded as a translucent petal: it takes the key light through
 * its back as readily as its front, and its throat carries an emissive that
 * brightens with the lantern ring — so the flowers light up as the glade does
 * rather than sitting inert under it.
 */
const WILDFLOWER_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform vec3  uBloom;
  uniform float uBloomGlow;

  varying vec3  vLocalPos;
  varying float vStem;

  ${GLADE_RING_LIGHT}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);

    // Both species are authored to the same UV split: stem below 0.72, bloom
    // above it. See FLOWER_BLOOM_V in proceduralAssets.
    float bloom = smoothstep(0.70, 0.80, vStem);

    // Absolute facing, not signed. The cluster is open enough to see straight
    // through, so its back faces are lit blossom too — shading them as though
    // they were turned away mottles every raceme with grey patches.
    float key = clamp((abs(dot(N, L)) + 0.5) / 1.5, 0.0, 1.0);
    // Petals are thin: light comes through the far side almost as well.
    float through = pow(clamp(dot(V, -normalize(L + N * 0.4)), 0.0, 1.0), 2.4);

    vec2  ring = ringLight(vWorldPos);
    float lantern = ring.x;

    // Throat glow, hottest at the very tip of the bloom.
    float throat = smoothstep(0.86, 1.0, vStem);

    vec3 stemColor = mix(uPrimary * 0.5, uPrimary, key);
    vec3 petal = mix(uBloom * 0.3, uBloom, key);
    petal += uBloom * through * 0.8;

    vec3 color = mix(stemColor, petal, bloom) * uLightColor;
    color += uEmissive * lantern * (0.25 + bloom * 0.8);
    color += uEmissive * throat * uBloomGlow * (0.25 + lantern * 0.9);
    color *= mix(0.92, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

// -----------------------------------------------------------------------------
// Engagement — the marble pavilion and its reflecting pool
// -----------------------------------------------------------------------------

/**
 * The pool's surface field: two crossed wavelet trains plus expanding drop
 * rings, with the analytic gradient alongside.
 *
 * Returns `xyz` = the surface gradient (∂h/∂x, ∂h/∂z packed into x and z, with
 * `y` carrying the height itself). Both the water and the reflections beneath
 * it read from this one function, which is what keeps a column's reflection
 * bending in step with the ripple that crosses it.
 */
const WATER_FIELD = /* glsl */ `
  uniform float uRippleScale;
  uniform float uRippleHeight;
  uniform float uDrops;

  float hash21(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
  }

  vec3 waterField(vec2 p, float t) {
    float s = uRippleScale;

    // Two travelling trains at different bearings and speeds. Analytic, so the
    // gradient below is exact rather than a finite difference.
    float a1 = (p.x * 3.1 + p.y * 2.2) * s + t * 0.85;
    float a2 = (p.x * -1.9 + p.y * 3.4) * s + t * 1.23;
    float a3 = (p.x * 5.7 + p.y * -4.4) * s + t * 1.9;

    float h = sin(a1) * 0.5 + sin(a2) * 0.34 + sin(a3) * 0.16;
    vec2 g = vec2(
      cos(a1) * 3.1 * s * 0.5 + cos(a2) * -1.9 * s * 0.34 + cos(a3) * 5.7 * s * 0.16,
      cos(a1) * 2.2 * s * 0.5 + cos(a2) * 3.4 * s * 0.34 + cos(a3) * -4.4 * s * 0.16
    );

    // Drop rings. Each source fires on its own cycle, walks outward and fades;
    // quantising the cycle gives every strike a fresh pseudo-random position.
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float cycle = t * 0.33 + fi * 0.41;
      float strike = floor(cycle);
      float age = fract(cycle);

      vec2 c = vec2(
        hash21(strike + fi * 17.3) - 0.5,
        hash21(strike + fi * 31.7) - 0.5
      ) * 9.0;

      float d = length(p - c) + 1e-4;
      float r = age * 4.2;
      float band = exp(-abs(d - r) * 5.5) * (1.0 - age) * uDrops;

      h += band * 0.55;
      // d(band)/dd, projected onto the radial direction.
      g += (-sign(d - r) * 5.5 * band * 0.55) * ((p - c) / d);
    }

    return vec3(g.x, h, g.y) * uRippleHeight;
  }
`;

/**
 * Polished white marble.
 *
 * Veining is the textbook construction and still the best one: turbulence
 * (summed |noise| octaves) warps the domain, a sine band is taken through it,
 * and the band is sharpened by a high power into filaments. Two families cross
 * at different scales and bearings so the stone never reads as stripes.
 *
 * Marble is also *translucent* — the reason it looks expensive and plaster does
 * not. The shadow side is lifted by a wrapped transmission term rather than
 * falling to flat ambient, and the specular exponent rides the veining, because
 * the softer mineral in a vein takes a slightly duller polish than the ground.
 */
const VEINED_MARBLE_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uVeinScale;
  uniform float uPolish;
  uniform float uFloorY;

  varying vec3 vLocalPos;

  ${VALUE_NOISE_3D}

  float turbulence(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += abs(valueNoise(p) - 0.5) * amp;
      p *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 P = vWorldPos * uVeinScale;

    // The warp has to vary across the *object*, not across the scene. Sampled
    // too coarsely it stays near-constant over a single mass, and the sharpened
    // band degenerates into one dead-straight vein — which is exactly what ran
    // down the middle of the dome before this was raised.
    float warpA = turbulence(P * 1.35);
    float bandA = sin(P.x * 0.9 + P.y * 0.35 + P.z * 0.6 + warpA * 7.5);
    float veinA = pow(1.0 - abs(bandA), 14.0);

    float warpB = turbulence(P * 3.1 + 11.0);
    float bandB = sin(P.x * -0.4 + P.y * 1.1 + P.z * 0.8 + warpB * 9.0);
    float veinB = pow(1.0 - abs(bandB), 26.0);

    float veining = clamp(veinA * 0.85 + veinB * 0.55, 0.0, 1.0);
    float grain = valueNoise(P * 14.0);

    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    float wrap = clamp(dot(N, L), 0.0, 1.0) * 0.72 + 0.28;

    // Vein mineral polishes duller than the ground it runs through.
    float rough = mix(0.06, 0.22, veining) + grain * 0.03;
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), mix(190.0, 40.0, rough)) * uPolish;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);

    // Light creeping a few millimetres into the stone.
    float sss = pow(clamp(dot(V, -normalize(L + N * 0.5)), 0.0, 1.0), 2.0);

    vec3 stone = vec3(0.94, 0.93, 0.90);
    vec3 veinTone = mix(vec3(0.40, 0.39, 0.43), uSecondary, 0.35);
    vec3 base = mix(stone, veinTone, veining) * mix(0.97, 1.03, grain);

    // Contact darkening: custom shaders in this project do not sample the
    // shadow map, so the crease where stone meets floor is shaded by hand.
    float contact = smoothstep(0.0, 0.55, vWorldPos.y - uFloorY) * 0.35 + 0.65;

    vec3 color = base * mix(vec3(0.19, 0.19, 0.23), vec3(0.86), wrap) * uLightColor;
    color *= contact;
    color += uLightColor * spec * 0.8;
    color += mix(uSecondary, vec3(1.0), 0.5) * fres * 0.35;
    color += stone * sss * uLightColor * 0.3;
    color *= mix(0.92, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

/**
 * Vertex stage for the pavilion's mirror image.
 *
 * The reflection is real geometry: the whole pavilion drawn again under a
 * `scale(1, -1, 1)` about the water plane, which for a flat mirror is exactly
 * correct and costs no second render pass. What this stage adds is the bending
 * — each vertex is pushed sideways by the pool's own gradient, with the throw
 * growing the further below the surface it sits, so the columns break up in the
 * water instead of standing as a rigid upside-down copy.
 */
const MARBLE_REFLECTION_VERTEX = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uWaterY;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  varying vec3  vLocalPos;
  varying float vDepth;

  ${INSTANCED_MODEL_MATRIX}
  ${WATER_FIELD}

  void main() {
    vUv = uv;
    vLocalPos = position;

    mat4 M = instancedModelMatrix();
    vec4 world = M * vec4(position, 1.0);

    // How far under the surface this vertex has been mirrored to.
    float depth = max(uWaterY - world.y, 0.0);
    vDepth = depth;

    // Bend, don't smear: the throw is capped both by clamping how deep the
    // surface is allowed to act and by limiting the gradient itself. Left
    // unbounded, the mirrored dome five units down slides off its own footprint.
    vec3 field = waterField(world.xz, uTime);
    vec2 throw2 = clamp(field.xz, vec2(-0.6), vec2(0.6));
    world.xz += throw2 * min(depth, 1.6) * 0.55;

    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(M) * normal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * The pavilion's reflection: marble read through water.
 *
 * Deliberately not the marble shader — a mirror image is dimmer, colour-shifted
 * toward the body of the water, and loses contrast with depth. Running the full
 * veining down here would cost as much as the pavilion itself for detail no one
 * can resolve through a rippling surface.
 */
const MARBLE_REFLECTION_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  varying vec3  vLocalPos;
  varying float vDepth;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightDir);

    // The mirrored copy has flipped winding, so the lighting is taken on the
    // absolute facing rather than the signed one.
    float wrap = abs(dot(N, L)) * 0.6 + 0.4;

    vec3 stone = vec3(0.9, 0.89, 0.87) * wrap * uLightColor;

    // Sink toward the water's own colour, and lose the image with depth.
    vec3 body = mix(uPrimary, uSecondary, 0.35) * 0.35;
    float sink = exp(-vDepth * 0.55);

    vec3 color = mix(body, stone, sink) * 0.72;
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity * (0.28 + sink * 0.62));
  }
`;

/**
 * The reflecting pool.
 *
 * A transparent, tinted sheet laid over the mirrored pavilion. Its normal comes
 * from the analytic gradient of {@link WATER_FIELD}, so the sun glint, the
 * sheen and the drop rings all agree with the same surface the reflections
 * below are being bent by.
 *
 * Alpha runs *against* the Fresnel term rather than with it. That looks
 * backwards for a mirror, but the reflection here lives beneath the plane
 * rather than in it: thinning the water at grazing angles is what lets the
 * columns come through where a real pool would be most reflective.
 */
const MIRROR_WATER_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  varying vec3 vLocalPos;

  ${WATER_FIELD}

  void main() {
    vec2 p = vWorldPos.xz;
    vec3 field = waterField(p, uTime);

    // The pool runs to thirty units; out there a wavelet is far narrower than a
    // pixel and the surface turns to corduroy. Same distance LOD as the moss.
    float detail = exp(-length(cameraPosition - vWorldPos) * 0.055);
    field.xz *= detail;

    // Surface normal of the height field: (-dh/dx, 1, -dh/dz).
    vec3 N = normalize(vec3(-field.x, 1.0, -field.z));

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    // A hard sun glint and a broader sheen: still water carries both.
    float glint = pow(clamp(dot(N, H), 0.0, 1.0), 420.0);
    float sheen = pow(clamp(dot(N, H), 0.0, 1.0), 26.0);

    // Where a ripple crests it catches the sky; in the troughs it stays dark.
    float crest = clamp(field.y * 6.0 + 0.5, 0.0, 1.0);

    vec3 body = mix(uPrimary, uSecondary, 0.45) * 0.28;
    vec3 sky  = mix(uSecondary, vec3(1.0), 0.35);

    vec3 color = mix(body, sky * 0.5, fres * 0.8 + crest * 0.2);
    color += uLightColor * glint * 2.6;
    color += uLightColor * sheen * 0.28;
    color += uEmissive * crest * 0.06;
    color *= mix(0.9, 1.0, uTransition);

    // Thin at grazing so the reflection reads; thicker looking straight down.
    float alpha = mix(0.62, 0.16, fres) + glint * 0.6;

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * uOpacity);
  }
`;

// -----------------------------------------------------------------------------
// Shared: the sangeet's overhead rig
// (declared here because the crowd is lit by it as well as the stage)
// -----------------------------------------------------------------------------

/**
 * Analytic lighting from the overhead rig. Returns `x` = falloff, `y` = the
 * signed sector angle, so callers can colour by which lamp is nearest.
 */
const STAGE_RIG_LIGHT = /* glsl */ `
  uniform float uRigRadius;
  uniform float uRigCount;
  uniform float uRigHeight;
  uniform float uRigSpin;
  uniform float uRigPulse;
  uniform float uRigAimY;

  /** Index of the lamp nearest this point in azimuth. */
  float nearestLampIndex(vec3 worldPos) {
    float sector = 6.2831853 / max(uRigCount, 1.0);
    float raw = atan(worldPos.z, worldPos.x) - uRigSpin;
    return floor((raw + sector * 0.5) / sector);
  }

  /** Where that lamp actually hangs. */
  vec3 nearestLamp(vec3 worldPos) {
    float sector = 6.2831853 / max(uRigCount, 1.0);
    float lampAngle = nearestLampIndex(worldPos) * sector + uRigSpin;
    return vec3(
      cos(lampAngle) * uRigRadius,
      uRigHeight,
      sin(lampAngle) * uRigRadius
    );
  }

  vec3 rigLight(vec3 worldPos) {
    float sector = 6.2831853 / max(uRigCount, 1.0);
    float raw = atan(worldPos.z, worldPos.x) - uRigSpin;

    float index = nearestLampIndex(worldPos);
    vec3 lamp = nearestLamp(worldPos);

    // A focused lamp falls off around its *beam axis*, not around the azimuth
    // it happens to sit at. Folding on the angle instead carves the stage into
    // hard pie slices, which is what a sector falloff actually draws.
    vec3 axis = normalize(vec3(0.0, uRigAimY, 0.0) - lamp);
    vec3 toFrag = worldPos - lamp;
    float along = dot(toFrag, axis);
    float perp = length(toFrag - axis * along);

    float d = max(length(toFrag), 1e-4);
    float focus = exp(-perp * perp * 1.9) * step(0.0, along);

    return vec3(uRigPulse * focus / (1.0 + d * d * 0.16), index, d);
  }
`;


// -----------------------------------------------------------------------------
// Production layer — wisteria and the crowd
// -----------------------------------------------------------------------------

/**
 * Vertex stage for the hanging wisteria.
 *
 * Racemes are authored hanging from their attachment point, with `uv.y` 0 at
 * the crown and 1 at the tip, so the sway envelope reads off the UVs: pinned
 * where it is tied to the bough, free at the tip.
 */
const WISTERIA_VERTEX = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSway;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  varying vec3  vLocalPos;
  varying float vDrop;

  ${INSTANCED_MODEL_MATRIX}

  void main() {
    vUv = uv;
    vLocalPos = position;

    float drop = clamp(uv.y, 0.0, 1.0);
    vDrop = drop;

    mat4 M = instancedModelMatrix();
    vec4 world = M * vec4(position, 1.0);

    // Phase from where the raceme is tied on, so a whole arch of them ripples
    // rather than swinging as one block — and with no per-instance attribute.
    vec3 root = vec3(M[3][0], M[3][1], M[3][2]);
    float amp = drop * drop * uSway;

    world.x += sin(uTime * 0.9 + root.x * 2.1 + root.z * 1.4) * amp;
    world.z += sin(uTime * 0.7 + root.z * 2.6 - root.x * 1.1) * amp * 0.8;

    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(M) * normal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Blooming wisteria.
 *
 * A raceme is not a surface, it is a few dozen pea-flowers strung down a stem,
 * so the shading is built from a floret field rather than from the geometry:
 * two crossed high-frequency trains break the cluster into individual blooms,
 * and the gaps between them are driven to nothing and discarded, which is what
 * gives the cluster an airy, see-through edge instead of a solid cone.
 *
 * The colour runs down the raceme — deep lilac at the crown where the buds are
 * still closed, paling toward warm white at the tip where they have opened.
 * That gradient is the whole reason wisteria reads as wisteria.
 */
const WISTERIA_BLOOM_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform vec3 uPetalTop;
  uniform vec3 uPetalTip;

  varying vec3  vLocalPos;
  varying float vDrop;

  ${VALUE_NOISE_3D}

  void main() {
    // Florets, from noise rather than from crossed sines. A sine lattice laid
    // over a tapered lathe lines its nodes up with the taper and reads as
    // herringbone banding — which is exactly what this looked like first.
    // A raceme is only about a fifth of a unit across, so these frequencies are
    // what set the size of a single pea-flower. Too fine and the cutout below
    // shreds the cluster into speckle rather than opening gaps between blooms.
    float clump = valueNoise(vLocalPos * 24.0);
    float fine = valueNoise(vLocalPos * 58.0 + 5.3);
    float floret = clump * 0.66 + fine * 0.34;

    // A third octave, used only for shading. Folding it into the cutout as well
    // would just punch more holes; kept separate it gives the surviving blooms
    // a grain that holds up when the camera settles close to the arch.
    float grain = valueNoise(vLocalPos * 132.0 + 17.9);

    // The cluster thins toward the tip, where the last buds are still forming.
    float mass = floret * mix(1.18, 0.78, vDrop);
    if (mass < 0.34) discard;

    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);

    // Petals are thin and wrap hard; light comes through the far side almost as
    // readily as it lands on the near one.
    // Absolute facing, not signed. The cluster is open enough to see straight
    // through, so its back faces are lit blossom too — shading them as though
    // they were turned away mottles every raceme with grey patches.
    float key = clamp((abs(dot(N, L)) + 0.5) / 1.5, 0.0, 1.0);
    float through = pow(clamp(dot(V, -normalize(L + N * 0.45)), 0.0, 1.0), 2.2);

    vec3 petal = mix(uPetalTop, uPetalTip, smoothstep(0.1, 0.95, vDrop));
    petal *= mix(0.86, 1.1, floret) * mix(0.88, 1.06, grain);

    // Kept deliberately under the bloom pass's threshold except at the very
    // brightest florets. Blossom that blooms across its whole mass stops being
    // lilac and turns into a white icicle.
    vec3 color = mix(petal * 0.3, petal, key) * uLightColor;
    color += petal * through * 0.45;                       // backlit blossom
    color += mix(petal, uEmissive, 0.3) * pow(floret, 3.0) * 0.12;
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

/**
 * Vertex stage for the crowd.
 *
 * Figures are instanced and rooted at the feet, so the idle envelope grows with
 * height — the head moves, the feet do not. Every instance takes its phase from
 * where it stands, which is what stops a hundred guests bobbing in unison.
 */
const CROWD_VERTEX = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSway;
  uniform float uHeight;
  uniform float uBreath;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  varying vec3  vLocalPos;
  varying float vPhase;

  ${INSTANCED_MODEL_MATRIX}

  void main() {
    vUv = uv;
    vLocalPos = position;

    mat4 M = instancedModelMatrix();
    vec3 root = vec3(M[3][0], M[3][1], M[3][2]);

    float phase = fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453);
    vPhase = phase;

    vec4 world = M * vec4(position, 1.0);

    float up = clamp(position.y / max(uHeight, 1e-3), 0.0, 1.0);
    float amp = up * up * uSway;
    float beat = 6.2831853 * phase;

    world.x += sin(uTime * 1.7 + beat) * amp;
    world.z += sin(uTime * 1.3 + beat * 1.7) * amp * 0.7;
    // A shallow bob on the same beat, so the crowd reads as swaying to music
    // rather than as a field of reeds.
    world.y += sin(uTime * 2.6 + beat) * amp * 0.55;

    vec3 n = normalize(mat3(M) * normal);

    // Breath: a slow swell pushed out along the surface, gathered around the
    // chest and falling away toward the head and the feet. Far slower than the
    // sway and on its own phase, so the two never beat against each other into
    // a pulse.
    float chest = exp(-pow((up - 0.62) * 3.2, 2.0));
    float breath = 0.5 + 0.5 * sin(uTime * 0.85 + beat * 0.6);
    world.xyz += n * chest * breath * uBreath;

    vWorldPos = world.xyz;
    vWorldNormal = n;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Guest silhouettes.
 *
 * Almost no diffuse: a crowd seen against a lit stage is a field of dark
 * shapes, and the moment the bodies take real light they stop reading as a
 * crowd and start reading as a hundred identical models. What carries them is
 * the rim — a Fresnel edge split between lavender and gold, alternating per
 * figure — which is deliberately driven just past the bloom pass's luminance
 * threshold so the crowd catches the same glow as the rest of the venue.
 *
 * Four sines and a Fresnel per fragment, no noise taps: this shades a hundred
 * figures in one instanced draw call.
 */
const GUEST_SILHOUETTE_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uHeight;
  uniform vec3  uRimCool;
  uniform vec3  uRimWarm;
  uniform float uRimGain;
  uniform float uTransmit;

  varying vec3  vLocalPos;
  varying float vPhase;

  ${STAGE_RIG_LIGHT}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);

    float up = clamp(vLocalPos.y / max(uHeight, 1e-3), 0.0, 1.0);

    // Bodies are darkest at the floor and lift very slightly toward the head,
    // which reads as the stage light spilling over the crowd.
    vec3 body = mix(uPrimary * 0.05, uPrimary * 0.16, up);
    body *= mix(0.8, 1.0, clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0));

    // Lavender and gold alternate across the crowd.
    vec3 rimTint = mix(uRimCool, uRimWarm, step(0.5, vPhase));

    // --- lit by the rig, not by a constant -----------------------------------
    // The nearest lamp, solved analytically. This is what makes the edge glow
    // travel around the house as the rig sweeps, instead of every figure
    // carrying the same painted-on outline.
    vec3  lamp = nearestLamp(vWorldPos);
    vec3  Lr = normalize(lamp - vWorldPos);
    float reach = rigLight(vWorldPos).x;

    // Fresnel alone outlines a silhouette evenly, which reads as a stroke
    // around a sticker rather than as light landing on someone. Weighted toward
    // upward-facing edges — shoulders and the crown of the head — since the rig
    // hangs overhead, and gated on the lamp actually reaching this figure.
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.4);
    float lift = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
    float facing = clamp(dot(N, Lr) * 0.5 + 0.5, 0.0, 1.0);

    float rim = fres * mix(0.2, 1.0, up) * mix(0.25, 1.0, lift) * uRimGain;
    // A floor of ambient rim so a figure between beams still reads as a body,
    // and a large gain where a lamp does land — that swing is the effect.
    rim *= 0.35 + facing * (0.55 + reach * 5.5);

    // Light carrying through the thin edges of a body with a lamp behind it.
    // See uTransmit: this is what stands in for genuine alpha.
    float through = pow(clamp(dot(V, -normalize(Lr + N * 0.45)), 0.0, 1.0), 2.6);
    through *= (1.0 - clamp(dot(N, V), 0.0, 1.0)) * reach * uTransmit;

    vec3 color = body * uLightColor;
    color += rimTint * rim * 0.85;
    color += mix(rimTint, vec3(1.0), 0.25) * through * 2.2;
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

// -----------------------------------------------------------------------------
// Sangeet — the amphitheatre
// -----------------------------------------------------------------------------

/**
 * The amphitheatre's stone — one program for both the faceted tiers and the
 * polished stage, split by `uPolish`.
 *
 * The rock is dark and near-black in the diffuse, because everything the eye
 * reads here is specular: the cleave planes catch the rig and throw it back as
 * hard coloured glints. Facet normals come from quantising the shading normal
 * onto a noise-jittered lattice, which gives a crystalline break-up that no
 * amount of tessellation would.
 *
 * At `uPolish` 1 the facets flatten out and the specular lobe tightens into a
 * wet, mirror-like floor that streaks the lamps across itself.
 */
const STAGE_POLISH_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uPolish;
  uniform float uFacetScale;

  varying vec3 vLocalPos;

  ${VALUE_NOISE_3D}
  ${STAGE_RIG_LIGHT}

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Cleave the surface into facets: jitter the normal on a quantised lattice
    // so neighbouring cells share a plane and the boundaries read as edges.
    vec3 cell = floor(vWorldPos * uFacetScale);
    vec3 jitter = vec3(
      valueNoise(cell + 0.5),
      valueNoise(cell + 11.5),
      valueNoise(cell + 23.5)
    ) - 0.5;
    vec3 facetN = normalize(N + jitter * 0.55);
    N = normalize(mix(facetN, N, uPolish));

    vec3 rig = rigLight(vWorldPos);
    float lamp = rig.x;

    // Gels alternate around the rig. Selecting on the discrete lamp index
    // switches colour abruptly at every sector boundary, which draws hard
    // spokes across a polished floor; a wave at half the lamp frequency
    // alternates the same way without the seam.
    float raw = atan(vWorldPos.z, vWorldPos.x) - uRigSpin;
    float tintWave = 0.5 + 0.5 * cos(raw * uRigCount * 0.5);
    vec3 lampTint = mix(uSecondary, uEmissive, tintWave);

    vec3 L = normalize(uLightDir);
    vec3 H = normalize(L + V);

    float key = clamp(dot(N, L), 0.0, 1.0) * 0.5 + 0.5;
    float sharp = mix(30.0, 260.0, uPolish);
    float glint = pow(clamp(dot(N, H), 0.0, 1.0), sharp);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.5);

    // Beam direction for the lamp specular, so the rig streaks across a
    // polished floor rather than just brightening it.
    vec3 toRig = normalize(vec3(0.0, uRigHeight, 0.0) - vWorldPos);
    float beamSpec = pow(clamp(dot(N, normalize(toRig + V)), 0.0, 1.0), sharp * 0.8);

    vec3 rock = uPrimary * mix(0.16, 0.07, uPolish);

    vec3 color = rock * key * uLightColor;
    color += lampTint * lamp * mix(0.75, 1.15, uPolish);
    color += lampTint * beamSpec * lamp * mix(0.5, 2.6, uPolish);
    color += uLightColor * glint * mix(0.25, 0.8, uPolish);
    color += mix(uSecondary, uEmissive, 0.5) * fres * 0.28;
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

// -----------------------------------------------------------------------------
// Legacy — the library
// -----------------------------------------------------------------------------

/**
 * Vertex stage for the books. Hashes the full instance origin rather than just
 * its ground position, so two books directly above one another on different
 * shelves get different bindings.
 */
const BOOK_VERTEX = /* glsl */ `
  precision highp float;

  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPos;
  varying vec3  vLocalPos;
  varying float vSeed;

  ${INSTANCED_MODEL_MATRIX}

  void main() {
    vUv = uv;
    vLocalPos = position;

    mat4 M = instancedModelMatrix();
    vec4 world = M * vec4(position, 1.0);

    vec3 root = vec3(M[3][0], M[3][1], M[3][2]);
    vSeed = fract(sin(dot(root, vec3(12.9898, 78.233, 37.719))) * 43758.5453);

    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(M) * normal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Bound leather spines.
 *
 * Every book on the wall is one instanced draw call, so the variety has to come
 * from the shader: the instance seed picks a binding from a small library
 * palette — oxblood, forest, navy, tan — and shifts its tone, which is enough
 * that no two neighbours match. Gilt bands ride the top and bottom of the
 * spine, placed off-centre the way real raised bands sit.
 */
const LEATHER_SPINE_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform vec3  uHearthPos;
  uniform float uHearthPulse;

  varying vec3  vLocalPos;
  varying float vSeed;

  ${VALUE_NOISE_3D}

  void main() {
    // Four bindings, chosen by the instance seed.
    float pick = fract(vSeed * 4.0);
    vec3 oxblood = vec3(0.28, 0.055, 0.055);
    vec3 forest  = vec3(0.07, 0.16, 0.10);
    vec3 navy    = vec3(0.06, 0.09, 0.21);
    vec3 tan     = vec3(0.34, 0.22, 0.11);

    vec3 leather = mix(
      mix(oxblood, forest, step(0.25, pick)),
      mix(navy, tan, step(0.75, pick)),
      step(0.5, pick)
    );
    // A little tonal drift, so even two books of the same binding differ.
    leather *= 0.72 + fract(vSeed * 31.0) * 0.5;

    // uv.y runs up the spine. Gilt bands sit in from each end.
    float up = clamp(vUv.y, 0.0, 1.0);
    float band = smoothstep(0.02, 0.0, abs(up - 0.78) - 0.025)
               + smoothstep(0.02, 0.0, abs(up - 0.22) - 0.02);
    band *= step(0.35, fract(vSeed * 7.0));   // not every volume is banded

    float grain = valueNoise(vLocalPos * 90.0 + vSeed * 20.0);

    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    vec3  toFire = uHearthPos - vWorldPos;
    float fireDist = length(toFire);
    vec3  Lf = toFire / max(fireDist, 1e-3);
    float fall = uHearthPulse / (1.0 + fireDist * fireDist * 0.4);
    float fire = clamp(dot(N, Lf), 0.0, 1.0) * fall;

    vec3  Hf = normalize(Lf + V);
    float sheen = pow(clamp(dot(N, Hf), 0.0, 1.0), 26.0);

    vec3 color = leather * mix(0.9, 1.08, grain) * (0.16 + fire * 2.4);
    // Gilt is metal: it takes the firelight far harder than the leather does.
    color += mix(uEmissive, vec3(1.0, 0.86, 0.55), 0.5) * band * (0.3 + fire * 3.2);
    color += uEmissive * sheen * fall * 0.5;
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

/**
 * Dark walnut.
 *
 * Wood is growth rings seen in section, so that is how this is built: distance
 * from a grain axis, warped by turbulence so the rings wander, then wrapped
 * into a saw-tooth. Where a face cuts the rings obliquely the bands stretch
 * into the long figure you see on a plank, and where it cuts across they close
 * into tight ellipses — both fall out of the same field for free, which is why
 * the rings are solved in object space rather than faked per-face.
 *
 * On top of that: a pore layer scratched along the grain, and a satin sheen
 * that rides *between* the rings, because the harder late-growth wood takes a
 * better polish than the soft early wood beside it. That difference is most of
 * what makes waxed timber look waxed.
 *
 * Lit by the hearth as a point source, so the shelves brighten as the fire
 * gutters and the far end of the room stays in the dark.
 */
const WALNUT_WOOD_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uRingScale;
  uniform float uSheen;
  uniform vec3  uHearthPos;
  uniform float uHearthPulse;

  varying vec3 vLocalPos;

  ${VALUE_NOISE_3D}

  float turbulence(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
      sum += abs(valueNoise(p) - 0.5) * amp;
      p *= 2.07;
      amp *= 0.5;
    }
    return sum;
  }

  void main() {
    vec3 P = vLocalPos * uRingScale;
    vec3 N = normalize(vWorldNormal);

    // Which way the grain runs.
    //
    // Rings have to be measured in the plane *perpendicular* to the length of
    // the board. Measuring them about one fixed axis turns every wide flat
    // surface into a single end-grain section — the floor of this room came out
    // as one enormous set of bullseyes, like a tree stump seen from above.
    // A horizontal surface is a floorboard or a shelf, so its grain runs
    // across the room; an upright one is a stile, so its grain runs up.
    bool lying = abs(N.y) > 0.6;
    vec2 section = lying ? P.yz : P.xz;
    float along = lying ? P.x : P.y;

    float warp = turbulence(P * 0.5 + 3.3);

    float radius = length(section) + warp * 2.2 + along * 0.12;
    float rings = fract(radius);
    // Sharpened toward the late-growth side: real rings are not a sine.
    float ring = pow(rings, 1.8);

    // Board seams, running with the grain. A floor is laid, not carved from one
    // slab, and the joints are most of what says so.
    float across = lying ? P.z : P.x;
    float seam = smoothstep(0.06, 0.0, abs(fract(across * 0.42) - 0.5) - 0.44);

    // Pores, scratched along the grain rather than across it.
    vec3 poreP = lying
      ? vec3(P.x * 3.0, P.y * 26.0, P.z * 26.0)
      : vec3(P.x * 26.0, P.y * 3.0, P.z * 26.0);
    float pore = valueNoise(poreP);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uLightDir);

    vec3  toFire = uHearthPos - vWorldPos;
    float fireDist = length(toFire);
    vec3  Lf = toFire / max(fireDist, 1e-3);
    float fall = uHearthPulse / (1.0 + fireDist * fireDist * 0.4);

    float key = clamp(dot(N, L), 0.0, 1.0) * 0.6 + 0.4;
    float fire = clamp(dot(N, Lf), 0.0, 1.0) * fall;

    // Late wood polishes harder than early wood, so the sheen rides the rings.
    vec3  Hf = normalize(Lf + V);
    float gloss = mix(18.0, 96.0, ring);
    float sheen = pow(clamp(dot(N, Hf), 0.0, 1.0), gloss) * uSheen;
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);

    // Dark walnut: a cool near-black in the early wood, warm chocolate in the
    // late. The chapter's own primary tints it so the palette still carries.
    vec3 early = mix(vec3(0.055, 0.032, 0.022), uPrimary * 0.16, 0.35);
    vec3 late  = mix(vec3(0.20, 0.115, 0.062), uPrimary * 0.5, 0.3);
    vec3 timber = mix(early, late, ring) * mix(0.86, 1.06, pore);
    timber *= 1.0 - seam * 0.55;

    vec3 color = timber * key * uLightColor * 0.5;
    color += timber * fire * 2.6;                       // firelight on the wood
    color += mix(uEmissive, vec3(1.0), 0.2) * sheen * fall * 1.4;
    color += uEmissive * fres * fall * 0.35;            // warm edge off the fire
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

// -----------------------------------------------------------------------------
// Wedding — the sacred fire
// -----------------------------------------------------------------------------

/**
 * Vertex stage for the sacred fire.
 *
 * The flame body is a lathed teardrop authored with `uv.y` 0 at the base and 1
 * at the tip, so the whip envelope reads straight off the UVs: anchored where
 * it sits in the coals, free where it tapers out.
 */
const SACRED_FIRE_VERTEX = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uTurbulence;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  ${INSTANCED_MODEL_MATRIX}

  void main() {
    vUv = uv;
    vLocalPos = position;

    mat4 M = instancedModelMatrix();
    vec4 world = M * vec4(position, 1.0);

    float up = clamp(uv.y, 0.0, 1.0);
    float amp = up * up * uTurbulence;

    world.x += sin(uTime * 3.1 + world.z * 6.0 + up * 5.0) * amp;
    world.z += sin(uTime * 2.7 + world.x * 5.4 + up * 4.2) * amp * 0.8;
    world.y += sin(uTime * 4.3 + up * 7.0) * amp * 0.35;

    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(M) * normal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * The sacred fire.
 *
 * Fire has no surface, so nothing here shades one. A noise column is advected
 * *downward* through the flame's own local space, which is what reads as gas
 * rising through it; the field then drives a density, and the density drives a
 * temperature.
 *
 * The temperature ramp is the part that matters. A flame is not one colour —
 * white-hot where the fuel is richest, through saffron, to a deep red where it
 * is starving at the tip — and an emissive material with a single colour can
 * never be more than a glowing cone. Drawn additively, so the three bodies sum
 * where they overlap the way real flames do.
 */
const SACRED_FIRE_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uCore;
  uniform float uRise;

  varying vec3 vLocalPos;

  ${VALUE_NOISE_3D}

  void main() {
    float up = clamp(vUv.y, 0.0, 1.0);

    // Fuel, scrolling down through the body as the body burns up.
    vec3 P = vLocalPos * vec3(9.0, 4.5, 9.0);
    P.y -= uTime * uRise;
    float fuel = valueNoise(P) * 0.65 + valueNoise(P * 2.3 + 4.1) * 0.35;

    // Rich at the base, starved at the tip, eaten into by the fuel field.
    float density = clamp((1.0 - up) * 1.25 * mix(0.45, 1.3, fuel), 0.0, 1.0);

    float heat = clamp(density * 1.35 - up * 0.35, 0.0, 1.0);
    vec3 dying = mix(uPrimary, uEmissive, 0.35) * 0.55;
    vec3 core  = mix(uEmissive, vec3(1.0, 0.95, 0.82), 0.75);

    vec3 color = mix(dying, uEmissive, smoothstep(0.12, 0.5, heat));
    color = mix(color, core, smoothstep(0.62, 0.95, heat));

    // Double-sided and additive, so the shell sums twice through the middle of
    // the column and once at its edge — the volume falls out of the geometry.
    vec3 V = normalize(cameraPosition - vWorldPos);
    float facing = mix(0.55, 1.0, abs(dot(normalize(vWorldNormal), V)));

    float alpha = density * facing * uCore;
    alpha *= smoothstep(0.0, 0.08, up);    // bed into the coals
    alpha *= smoothstep(1.0, 0.72, up);    // dissolve at the tip

    color *= mix(0.9, 1.0, uTransition);
    gl_FragColor = vec4(color * (0.85 + heat * 1.5), clamp(alpha, 0.0, 1.0) * uOpacity);
  }
`;

/**
 * Smoke lifting off the fire.
 *
 * Alpha-blended rather than additive: smoke *occludes*. It is lit from below by
 * the fire it came from and loses that warmth as it climbs and thins, which is
 * the whole reason to draw it — it carries the fire's light up into the air
 * above the kund.
 */
const SMOKE_PLUME_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  uniform float uDensity;
  uniform float uRise;

  varying vec3 vLocalPos;

  ${VALUE_NOISE_3D}

  void main() {
    float up = clamp(vUv.y, 0.0, 1.0);

    // The plume is barely a unit across, so the field has to be sampled an
    // order of magnitude finer than the geometry — sampled coarsely it resolves
    // into a handful of balls, which the bloom pass then turns into headlights.
    vec3 P = vLocalPos * vec3(22.0, 9.0, 22.0);
    P.y -= uTime * uRise;
    float puff = valueNoise(P) * 0.55 + valueNoise(P * 2.7 + 9.0) * 0.45;

    // Gathers just above the flame, then thins as it spreads and cools.
    float body = smoothstep(0.0, 0.24, up) * (1.0 - smoothstep(0.3, 1.0, up));
    float density = body * smoothstep(0.35, 0.85, puff) * uDensity;

    // A shell has no business showing its own silhouette: drive the edge to
    // nothing rather than to half.
    vec3 V = normalize(cameraPosition - vWorldPos);
    float facing = pow(abs(dot(normalize(vWorldNormal), V)), 1.6);

    // Warm where the fire still reaches it, cold above — and dim throughout.
    // Smoke that crosses the bloom threshold stops being smoke.
    vec3 lit = mix(uEmissive * 0.4, vec3(0.15, 0.14, 0.16), smoothstep(0.05, 0.45, up));
    vec3 color = lit * mix(0.6, 1.0, puff);
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, clamp(density * facing, 0.0, 1.0) * uOpacity);
  }
`;

/**
 * Hook: henna-vine growth. Placeholder pulses a mask so vines "draw" over time.
 * Replace with the real SDF vine field.
 */
const HENNA_VINE_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  void main() {
    float growth = smoothstep(0.0, 1.0, fract(uTime * 0.1));
    float mask = step(vUv.y, growth);
    vec3 color = mix(uSecondary, uPrimary, mask) * uLightColor;
    color += uEmissive * (1.0 - mask) * 0.1;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Hook: sacred-fire embers. Placeholder flickers emissive with cheap noise.
 * Replace with the real curl-noise ember volume.
 */
const EMBER_FRAGMENT = /* glsl */ `
  ${SHARED_PREAMBLE}

  varying vec3 vLocalPos;

  ${VALUE_NOISE_3D}

  void main() {
    // Crust and cracks. The heat lives in the gaps between the plates, not on
    // their faces — which is what separates a coal from a glowing pebble.
    vec3 P = vWorldPos * 26.0;
    float plate = valueNoise(P) * 0.7 + valueNoise(P * 3.1 + 7.0) * 0.3;
    float crack = pow(1.0 - abs(plate - 0.5) * 2.0, 6.0);

    // Every coal breathes on its own phase, taken from where it lies.
    float phase = valueNoise(floor(vWorldPos * 40.0)) * 6.2831853;
    float breath = 0.55 + 0.45 * sin(uTime * 2.1 + phase);

    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float facing = clamp(dot(N, V), 0.0, 1.0);

    float glow = crack * breath;

    vec3 color = vec3(0.16, 0.14, 0.13) * mix(0.6, 1.2, plate) * uLightColor;
    color += mix(uPrimary, uEmissive, 0.6) * glow * 1.8;
    color += mix(uEmissive, vec3(1.0, 0.9, 0.7), 0.4) * pow(glow, 2.5) * 1.6;
    color += uEmissive * (1.0 - facing) * 0.15 * breath;   // heat haze at the rim
    color *= mix(0.9, 1.0, uTransition);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

/** Names of the authored ceremony material hooks. */
export type CeremonyShaderName =
  | "goldLeaf"
  | "rawSilk"
  | "banyanLeaf"
  | "crystalFacet"
  | "lightShaft"
  | "mossCarpet"
  | "wildflower"
  | "walnutWood"
  | "leatherSpine"
  | "wisteriaBloom"
  | "guestSilhouette"
  | "stagePolish"
  | "sacredFire"
  | "smokePlume"
  | "veinedMarble"
  | "marbleReflection"
  | "mirrorWater"
  | "hennaVine"
  | "ember";

/** A complete shader program: paired vertex + fragment GLSL sources. */
export interface ShaderProgram {
  readonly vertexShader: string;
  readonly fragmentShader: string;
}

/** Lookup table from hook name → GLSL program. */
export const CEREMONY_SHADERS: Readonly<
  Record<CeremonyShaderName, ShaderProgram>
> = {
  goldLeaf: {
    vertexShader: CEREMONY_VERTEX_SHADER,
    fragmentShader: GOLD_LEAF_FRAGMENT,
  },
  rawSilk: {
    vertexShader: RAW_SILK_VERTEX,
    fragmentShader: RAW_SILK_FRAGMENT,
  },
  banyanLeaf: {
    vertexShader: BANYAN_LEAF_VERTEX,
    fragmentShader: BANYAN_LEAF_FRAGMENT,
  },
  crystalFacet: {
    vertexShader: GLADE_VERTEX,
    fragmentShader: CRYSTAL_FACET_FRAGMENT,
  },
  lightShaft: {
    vertexShader: GLADE_VERTEX,
    fragmentShader: LIGHT_SHAFT_FRAGMENT,
  },
  mossCarpet: {
    vertexShader: MOSS_VERTEX,
    fragmentShader: MOSS_CARPET_FRAGMENT,
  },
  // Marble and the pool share the glade's instancing-aware vertex stage; only
  // the reflection needs its own, to bend with the water.
  leatherSpine: {
    vertexShader: BOOK_VERTEX,
    fragmentShader: LEATHER_SPINE_FRAGMENT,
  },
  walnutWood: {
    vertexShader: GLADE_VERTEX,
    fragmentShader: WALNUT_WOOD_FRAGMENT,
  },
  wisteriaBloom: {
    vertexShader: WISTERIA_VERTEX,
    fragmentShader: WISTERIA_BLOOM_FRAGMENT,
  },
  guestSilhouette: {
    vertexShader: CROWD_VERTEX,
    fragmentShader: GUEST_SILHOUETTE_FRAGMENT,
  },
  stagePolish: {
    vertexShader: GLADE_VERTEX,
    fragmentShader: STAGE_POLISH_FRAGMENT,
  },
  sacredFire: {
    vertexShader: SACRED_FIRE_VERTEX,
    fragmentShader: SACRED_FIRE_FRAGMENT,
  },
  smokePlume: {
    vertexShader: SACRED_FIRE_VERTEX,
    fragmentShader: SMOKE_PLUME_FRAGMENT,
  },
  veinedMarble: {
    vertexShader: GLADE_VERTEX,
    fragmentShader: VEINED_MARBLE_FRAGMENT,
  },
  marbleReflection: {
    vertexShader: MARBLE_REFLECTION_VERTEX,
    fragmentShader: MARBLE_REFLECTION_FRAGMENT,
  },
  mirrorWater: {
    vertexShader: GLADE_VERTEX,
    fragmentShader: MIRROR_WATER_FRAGMENT,
  },
  wildflower: {
    vertexShader: WILDFLOWER_VERTEX,
    fragmentShader: WILDFLOWER_FRAGMENT,
  },
  hennaVine: {
    vertexShader: CEREMONY_VERTEX_SHADER,
    fragmentShader: HENNA_VINE_FRAGMENT,
  },
  ember: {
    vertexShader: GLADE_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
  },
} as const;
