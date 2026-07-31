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

    float key = clamp((dot(N, L) + 0.55) / 1.55, 0.0, 1.0);
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

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float flicker = hash(floor(vUv * 20.0) + floor(uTime * 12.0));
    vec3 color = mix(uPrimary, uEmissive, flicker);
    color *= mix(0.6, 1.4, flicker) * uTransition;
    gl_FragColor = vec4(color * uLightColor, 1.0);
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
    vertexShader: CEREMONY_VERTEX_SHADER,
    fragmentShader: EMBER_FRAGMENT,
  },
} as const;
