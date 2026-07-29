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
  hennaVine: {
    vertexShader: CEREMONY_VERTEX_SHADER,
    fragmentShader: HENNA_VINE_FRAGMENT,
  },
  ember: {
    vertexShader: CEREMONY_VERTEX_SHADER,
    fragmentShader: EMBER_FRAGMENT,
  },
} as const;
