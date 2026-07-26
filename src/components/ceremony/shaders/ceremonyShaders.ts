/**
 * ceremonyShaders.ts
 * -----------------------------------------------------------------------------
 * Placeholder GLSL hooks for the Living Ceremony Layer's high-end materials.
 *
 * These are intentionally minimal, self-contained shader sources plus a typed
 * uniform contract. They compile and animate today (so the pipeline is
 * verifiable) but are structured as *hooks*: swap the fragment bodies for the
 * real gold-leaf / henna-vine / ember shaders without touching the TS surface
 * or <CeremonyCanvas />.
 *
 * The uniform block is shared by every ceremony material so the canvas can drive
 * all shaders from one animation loop.
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

// -----------------------------------------------------------------------------
// Placeholder fragment shaders (one per material hook)
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
export type CeremonyShaderName = "goldLeaf" | "hennaVine" | "ember";

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
  hennaVine: {
    vertexShader: CEREMONY_VERTEX_SHADER,
    fragmentShader: HENNA_VINE_FRAGMENT,
  },
  ember: {
    vertexShader: CEREMONY_VERTEX_SHADER,
    fragmentShader: EMBER_FRAGMENT,
  },
} as const;
