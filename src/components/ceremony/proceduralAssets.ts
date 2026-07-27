/**
 * proceduralAssets.ts
 * -----------------------------------------------------------------------------
 * Procedural asset foundry for the high-fidelity chapter worlds.
 *
 * Everything here is generated in code — there are no binary assets in this
 * project. The module supplies three tiers of resource:
 *
 *   1. Surface maps  — tileable normal + roughness `DataTexture`s derived from
 *                      seeded value-noise / cellular height fields.
 *   2. Geometry      — `ExtrudeGeometry` (bevelled) and `LatheGeometry` (turned)
 *                      builders, plus merged multi-part geometries.
 *   3. Materials     — per-chapter PBR material sets, and a PMREM environment
 *                      map so metals have something to actually reflect.
 *
 * ## Lifetime & the R3F disposal contract
 *
 * Every resource below is a **module-level singleton**, cached and never
 * disposed. That is deliberate. `CeremonyCanvas` cross-fades worlds by mounting
 * the incoming and outgoing chapter simultaneously, so worlds unmount and
 * remount constantly; rebuilding bevelled/turned geometry and re-rasterising
 * noise textures on every transition would cost a visible hitch.
 *
 * R3F disposes an unmounting instance *and one level of its properties* — for a
 * mesh that means `.geometry` and `.material`. Consumers of this module must
 * therefore set `dispose={null}` on any mesh using these resources, which makes
 * R3F skip disposal entirely (`shouldDispose = child.props.dispose !== null`).
 * `THREE.Mesh` has no `dispose()` of its own, so nothing leaks by opting out.
 * `THREE.InstancedMesh` *does* — instanced consumers must call `.dispose()`
 * themselves on unmount to release the instance matrix buffer.
 *
 * Textures referenced by a material are two levels deep and are never reached
 * by R3F's disposal walk, so they are safe either way.
 *
 * The cached set is bounded and small: a handful of geometries, five surface
 * map pairs, two environment maps, and two per-chapter material sets.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { ChapterConfig } from "./ceremonyConfig";

// =============================================================================
// Seeded noise
// =============================================================================

/** Integer hash → `[0,1)`. Deterministic, so textures are reproducible. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 362437)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return (h >>> 0) / 4294967296;
}

/** Positive modulo — keeps lattice lookups inside the tiling period. */
function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/**
 * Value noise with smoothstep interpolation, tiling seamlessly every `period`
 * units so the resulting texture can use `RepeatWrapping` without a visible
 * seam.
 */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const x0w = wrap(x0, period);
  const x1w = wrap(x0 + 1, period);
  const y0w = wrap(y0, period);
  const y1w = wrap(y0 + 1, period);

  // Smoothstep the interpolants so the field has continuous first derivatives —
  // essential, because we differentiate it to build the normal map.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash2(x0w, y0w, seed);
  const n10 = hash2(x1w, y0w, seed);
  const n01 = hash2(x0w, y1w, seed);
  const n11 = hash2(x1w, y1w, seed);

  const top = n00 + (n10 - n00) * sx;
  const bottom = n01 + (n11 - n01) * sx;
  return top + (bottom - top) * sy;
}

/** Fractal Brownian motion. Period doubles with frequency to stay tileable. */
function fbm(
  x: number,
  y: number,
  basePeriod: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): number {
  let amplitude = 1;
  let frequency = 1;
  let period = basePeriod;
  let sum = 0;
  let norm = 0;

  for (let o = 0; o < octaves; o++) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, period, seed + o * 101);
    norm += amplitude;
    amplitude *= gain;
    frequency *= 2;
    period *= 2;
  }
  return sum / norm;
}

/**
 * Tileable cellular (Worley) distance field — distance to the nearest jittered
 * lattice point, clamped to `[0,1]`. Used for the hammered dents in bronze.
 */
function cellular(x: number, y: number, cells: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let nearest = 1;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = wrap(cx, cells);
      const wy = wrap(cy, cells);
      const px = cx + hash2(wx, wy, seed);
      const py = cy + hash2(wx, wy, seed + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < nearest) nearest = d;
    }
  }
  return nearest;
}

// =============================================================================
// Surface maps (tileable normal + roughness)
// =============================================================================

/** Power-of-two so `DataTexture` can build a full mip chain. */
const TEXTURE_SIZE = 256;

interface SurfaceSpec {
  readonly seed: number;
  /** Noise cells across the texture. Higher = finer grain. */
  readonly period: number;
  readonly octaves: number;
  /** Height-field gain when differentiating into a normal. */
  readonly bumpStrength: number;
  /** Roughness at mid height. */
  readonly roughBase: number;
  /** ± roughness swing driven by the height field. */
  readonly roughVariance: number;
  /** Optional beaten-metal dent layer. */
  readonly dentCells?: number;
  readonly dentDepth?: number;
}

export interface SurfaceMaps {
  readonly normalMap: THREE.Texture;
  readonly roughnessMap: THREE.Texture;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function buildHeightField(spec: SurfaceSpec, size: number): Float32Array {
  const field = new Float32Array(size * size);
  const noiseScale = spec.period / size;
  const dentScale = spec.dentCells ? spec.dentCells / size : 0;
  const dentDepth = spec.dentDepth ?? 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = fbm(x * noiseScale, y * noiseScale, spec.period, spec.octaves, spec.seed);
      if (spec.dentCells) {
        // Squaring the distance turns each cell into a shallow dome, which
        // reads as a planished hammer strike rather than a crater.
        const d = cellular(x * dentScale, y * dentScale, spec.dentCells, spec.seed + 31);
        h += dentDepth * (d * d - 0.35);
      }
      field[y * size + x] = h;
    }
  }
  return field;
}

function buildSurfaceMaps(spec: SurfaceSpec): SurfaceMaps {
  const size = TEXTURE_SIZE;
  const field = buildHeightField(spec, size);

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  /** Normalised height with wrapped lookup, so the derivative tiles too. */
  const at = (x: number, y: number): number =>
    (field[wrap(y, size) * size + wrap(x, size)] - min) / range;

  const normalData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Central differences → tangent-space normal (-dx, -dy, 1), normalised.
      const dx = (at(x + 1, y) - at(x - 1, y)) * spec.bumpStrength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * spec.bumpStrength;
      const len = Math.hypot(dx, dy, 1);

      const i = (y * size + x) * 4;
      normalData[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      normalData[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      normalData[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      normalData[i + 3] = 255;

      const rough = clamp01(spec.roughBase + (at(x, y) - 0.5) * 2 * spec.roughVariance);
      const r8 = Math.round(rough * 255);
      roughData[i] = r8;
      roughData[i + 1] = r8;
      roughData[i + 2] = r8;
      roughData[i + 3] = 255;
    }
  }

  return {
    normalMap: finishDataTexture(new THREE.DataTexture(normalData, size, size)),
    roughnessMap: finishDataTexture(new THREE.DataTexture(roughData, size, size)),
  };
}

/**
 * Common setup for a generated map. These are *data* textures (normals,
 * roughness), so they must stay in linear space — `NoColorSpace`, which is the
 * `DataTexture` default, is correct here.
 */
function finishDataTexture(texture: THREE.DataTexture): THREE.DataTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** The surface vocabulary shared by the upgraded worlds. */
const SURFACE_SPECS = {
  sandstone: {
    seed: 11,
    period: 7,
    octaves: 4,
    bumpStrength: 2.4,
    roughBase: 0.86,
    roughVariance: 0.13,
  },
  bronze: {
    seed: 23,
    period: 5,
    octaves: 3,
    bumpStrength: 1.5,
    roughBase: 0.33,
    roughVariance: 0.2,
    dentCells: 9,
    dentDepth: 0.55,
  },
  polishedStone: {
    seed: 37,
    period: 4,
    octaves: 4,
    bumpStrength: 0.7,
    roughBase: 0.22,
    roughVariance: 0.16,
  },
  glass: {
    seed: 53,
    period: 3,
    octaves: 2,
    bumpStrength: 0.22,
    roughBase: 0.04,
    roughVariance: 0.04,
  },
  wax: {
    seed: 71,
    period: 6,
    octaves: 3,
    bumpStrength: 1.1,
    roughBase: 0.52,
    roughVariance: 0.16,
  },
} as const satisfies Record<string, SurfaceSpec>;

export type SurfaceKind = keyof typeof SURFACE_SPECS;

const surfaceCache = new Map<SurfaceKind, SurfaceMaps>();

/**
 * Cached surface maps for a named material family. The first call rasterises
 * two 256² fields (a few milliseconds); every later call is a map hit.
 *
 * Each kind is consumed by exactly one material, so it is safe for callers to
 * set `repeat` directly on the returned textures.
 */
export function getSurfaceMaps(kind: SurfaceKind): SurfaceMaps {
  let maps = surfaceCache.get(kind);
  if (!maps) {
    maps = buildSurfaceMaps(SURFACE_SPECS[kind]);
    surfaceCache.set(kind, maps);
  }
  return maps;
}

/** Apply a UV repeat to both maps of a surface. */
function setRepeat(maps: SurfaceMaps, u: number, v: number): SurfaceMaps {
  maps.normalMap.repeat.set(u, v);
  maps.roughnessMap.repeat.set(u, v);
  return maps;
}

// =============================================================================
// Environment map
// =============================================================================

/**
 * Metals are almost entirely reflection — with no environment to sample they
 * render as flat black. These two tiny procedural skies give the bronze, gold
 * and glass something to catch.
 */
export type EnvMood = "warm" | "daylight";

interface SkyStop {
  /** Zenith → nadir colour ramp, as linear RGB (values may exceed 1 for HDR). */
  readonly zenith: readonly [number, number, number];
  readonly horizon: readonly [number, number, number];
  readonly nadir: readonly [number, number, number];
  /** Bright key blob: azimuth `0..1`, elevation `0..1` (0 = zenith), radius, gain. */
  readonly key: { u: number; v: number; radius: number; gain: number };
}

const SKY_STOPS: Readonly<Record<EnvMood, SkyStop>> = {
  // Candle-lit interior: a warm amber pool low down, deep indigo overhead.
  warm: {
    zenith: [0.03, 0.03, 0.07],
    horizon: [0.55, 0.26, 0.09],
    nadir: [0.05, 0.02, 0.02],
    key: { u: 0.5, v: 0.62, radius: 0.17, gain: 5.5 },
  },
  // Bright conservatory: cool sky above, warm bounce off a pale floor.
  daylight: {
    zenith: [0.42, 0.52, 0.72],
    horizon: [0.78, 0.74, 0.66],
    nadir: [0.34, 0.31, 0.28],
    key: { u: 0.32, v: 0.22, radius: 0.13, gain: 9.0 },
  },
};

/** Build a small equirectangular HDR sky for PMREM to prefilter. */
function buildEquirectSky(mood: EnvMood): THREE.DataTexture {
  const width = 128;
  const height = 64;
  const stop = SKY_STOPS[mood];
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    // v: 0 at the zenith (top row) → 1 at the nadir.
    const v = y / (height - 1);
    // Two-segment ramp meeting at the horizon.
    const t = v < 0.5 ? v / 0.5 : (v - 0.5) / 0.5;
    const from = v < 0.5 ? stop.zenith : stop.horizon;
    const to = v < 0.5 ? stop.horizon : stop.nadir;

    for (let x = 0; x < width; x++) {
      const u = x / width;
      const i = (y * width + x) * 4;

      let r = from[0] + (to[0] - from[0]) * t;
      let g = from[1] + (to[1] - from[1]) * t;
      let b = from[2] + (to[2] - from[2]) * t;

      // Soft HDR key light. Azimuth wraps, so measure the shorter arc.
      const du = Math.min(Math.abs(u - stop.key.u), 1 - Math.abs(u - stop.key.u));
      const dv = v - stop.key.v;
      const dist = Math.hypot(du * 2, dv) / stop.key.radius;
      if (dist < 1) {
        const falloff = (1 - dist) * (1 - dist);
        const punch = falloff * stop.key.gain;
        r += punch;
        g += punch * 0.88;
        b += punch * 0.7;
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 1;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const envCache = new Map<EnvMood, THREE.Texture>();

/**
 * Cached, PMREM-prefiltered environment map. Needs the live renderer, so
 * callers pass `useThree(s => s.gl)`. Generated once per mood on first use.
 */
export function getEnvMap(renderer: THREE.WebGLRenderer, mood: EnvMood): THREE.Texture {
  let env = envCache.get(mood);
  if (!env) {
    const sky = buildEquirectSky(mood);
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    // The render target's texture outlives the generator — only the generator's
    // scratch resources are released by `dispose()`.
    env = pmrem.fromEquirectangular(sky).texture;
    sky.dispose();
    pmrem.dispose();
    envCache.set(mood, env);
  }
  return env;
}

// =============================================================================
// Geometry builders
// =============================================================================

const geometryCache = new Map<string, THREE.BufferGeometry>();

function cachedGeometry(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = build();
    geometryCache.set(key, geometry);
  }
  return geometry;
}

/**
 * A box with true chamfered edges, via `ExtrudeGeometry`'s bevel. Catching a
 * specular highlight along every edge is most of what separates this from a
 * `boxGeometry`.
 *
 * The shape is inset by the bevel and the extrusion shortened by twice it, so
 * the finished solid measures exactly `w × h × d`.
 */
function bevelledBox(w: number, h: number, d: number, bevel: number): THREE.BufferGeometry {
  const b = Math.min(bevel, Math.min(w, h, d) / 2 - 1e-3);
  const halfW = w / 2 - b;
  const halfH = h / 2 - b;

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -halfH);
  shape.lineTo(halfW, -halfH);
  shape.lineTo(halfW, halfH);
  shape.lineTo(-halfW, halfH);
  shape.closePath();

  const depth = Math.max(d - 2 * b, 1e-3);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 1,
  });
  // Extrusion runs 0..depth along +Z; recentre it on the origin.
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** A rounded rectangle profile, for softer tabletops. */
function roundedRectShape(w: number, h: number, radius: number): THREE.Shape {
  const r = Math.min(radius, Math.min(w, h) / 2 - 1e-3);
  const x = w / 2;
  const y = h / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y);
  shape.closePath();
  return shape;
}

/** A bevelled slab from an arbitrary shape, extruded along +Y and centred. */
function bevelledSlab(shape: THREE.Shape, height: number, bevel: number): THREE.BufferGeometry {
  const b = Math.min(bevel, height / 2 - 1e-3);
  const depth = Math.max(height - 2 * b, 1e-3);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -depth / 2);
  // ExtrudeGeometry works in XY and extrudes along +Z; stand it up so the
  // extrusion axis becomes +Y.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * A square ring (a plate with a square hole) with bevelled inner and outer
 * edges, standing on the XZ plane. The stacked tiers of the havan kund.
 *
 * The hole path is grown by the bevel so the finished aperture measures
 * `inner` across.
 */
function bevelledSquareRing(
  outer: number,
  inner: number,
  height: number,
  bevel: number,
): THREE.BufferGeometry {
  const b = Math.min(bevel, height / 2 - 1e-3, (outer - inner) / 4);
  const o = outer / 2 - b;
  const i = inner / 2 + b;

  const shape = new THREE.Shape();
  shape.moveTo(-o, -o);
  shape.lineTo(o, -o);
  shape.lineTo(o, o);
  shape.lineTo(-o, o);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-i, -i);
  hole.lineTo(-i, i);
  hole.lineTo(i, i);
  hole.lineTo(i, -i);
  hole.closePath();
  shape.holes.push(hole);

  const depth = Math.max(height - 2 * b, 1e-3);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A surface of revolution from a `[radius, height]` profile. */
function lathe(
  profile: readonly (readonly [number, number])[],
  segments: number,
): THREE.BufferGeometry {
  // A hard zero radius collapses the pole and produces degenerate normals.
  const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  return new THREE.LatheGeometry(points, segments);
}

interface GeometryPart {
  readonly geometry: THREE.BufferGeometry;
  readonly matrix?: THREE.Matrix4;
}

/**
 * Merge parts into one buffer so a multi-component object (a chair, the kund)
 * costs a single draw call — and a single node for `applyWorldFade` to walk.
 *
 * `mergeGeometries` requires a uniform index mode across inputs; `LatheGeometry`
 * is indexed and `ExtrudeGeometry` is not, so everything is flattened first.
 */
function mergeParts(parts: readonly GeometryPart[]): THREE.BufferGeometry {
  const prepared = parts.map((part) => {
    const geometry = part.geometry.index
      ? part.geometry.toNonIndexed()
      : part.geometry.clone();
    if (part.matrix) geometry.applyMatrix4(part.matrix);
    return geometry;
  });

  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();

  if (!merged) throw new Error("mergeParts: incompatible geometry attributes");
  merged.computeBoundingSphere();
  return merged;
}

/** Convenience: a translation matrix. */
function at(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

// -----------------------------------------------------------------------------
// Shared geometry
// -----------------------------------------------------------------------------

/**
 * A teardrop flame body. Lathing a hand-tuned silhouette gives a far better
 * flame than a cone — the bulge near the base and the drawn-out tip are what
 * read as fire once bloom picks up the emissive.
 */
export function flameGeometry(): THREE.BufferGeometry {
  return cachedGeometry("flame", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.10, 0.05],
        [0.17, 0.16],
        [0.19, 0.31],
        [0.16, 0.5],
        [0.10, 0.72],
        [0.045, 0.88],
        [0.0, 1.0],
      ],
      16,
    ),
  );
}

// -----------------------------------------------------------------------------
// Wedding — havan kund
// -----------------------------------------------------------------------------

/** Bevelled sandstone plinth the whole rig stands on. */
export function plinthGeometry(): THREE.BufferGeometry {
  return cachedGeometry("plinth", () => bevelledBox(2.7, 0.18, 2.7, 0.045));
}

/** Square, chamfered pillar shaft. */
export function pillarShaftGeometry(): THREE.BufferGeometry {
  return cachedGeometry("pillarShaft", () => bevelledBox(0.26, 0.62, 0.26, 0.032));
}

/** Turned bronze collar — doubles as both pillar base and capital. */
export function pillarCollarGeometry(): THREE.BufferGeometry {
  return cachedGeometry("pillarCollar", () =>
    lathe(
      [
        [0.0, -0.05],
        [0.175, -0.05],
        [0.195, -0.032],
        [0.2, 0.0],
        [0.195, 0.032],
        [0.175, 0.05],
        [0.0, 0.05],
      ],
      20,
    ),
  );
}

/**
 * The kund itself: three stacked, bevelled square rings widening upward — the
 * inverted stepped profile of a real havan kund — merged into one buffer.
 */
export function havanKundGeometry(): THREE.BufferGeometry {
  return cachedGeometry("havanKund", () => {
    const tiers = [
      { outer: 1.5, inner: 1.0, height: 0.16, bevel: 0.03, y: 0.0 },
      { outer: 1.72, inner: 1.16, height: 0.17, bevel: 0.035, y: 0.155 },
      { outer: 1.95, inner: 1.34, height: 0.18, bevel: 0.04, y: 0.32 },
    ];
    return mergeParts(
      tiers.map((tier) => ({
        geometry: bevelledSquareRing(tier.outer, tier.inner, tier.height, tier.bevel),
        matrix: at(0, tier.y, 0),
      })),
    );
  });
}

/** Thin gold band capping the kund's top rim. */
export function kundRimBandGeometry(): THREE.BufferGeometry {
  return cachedGeometry("kundRimBand", () => bevelledSquareRing(1.99, 1.3, 0.055, 0.018));
}

/** Ash bed inside the kund, with a low central mound. */
export function ashBedGeometry(): THREE.BufferGeometry {
  return cachedGeometry("ashBed", () =>
    mergeParts([
      { geometry: bevelledBox(1.02, 0.05, 1.02, 0.012) },
      {
        geometry: lathe(
          [
            [0.0, 0.0],
            [0.34, 0.008],
            [0.27, 0.05],
            [0.16, 0.085],
            [0.0, 0.1],
          ],
          14,
        ),
        matrix: at(0, 0.025, 0),
      },
    ]),
  );
}

/** A single faceted ember. Instanced across the ash bed. */
export function emberGeometry(): THREE.BufferGeometry {
  return cachedGeometry("ember", () => new THREE.IcosahedronGeometry(0.032, 0));
}

// -----------------------------------------------------------------------------
// Reception — conservatory
// -----------------------------------------------------------------------------

/** Polished floor plate. */
export function conservatoryFloorGeometry(): THREE.BufferGeometry {
  return cachedGeometry("conservatoryFloor", () => bevelledBox(7.2, 0.09, 4.3, 0.03));
}

/** Turned column: moulded base, tapered shaft, flared capital. */
export function conservatoryColumnGeometry(): THREE.BufferGeometry {
  return cachedGeometry("conservatoryColumn", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.135, 0.0],
        [0.135, 0.055],
        [0.105, 0.095],
        [0.078, 0.17],
        [0.07, 1.9],
        [0.088, 1.99],
        [0.125, 2.07],
        [0.125, 2.15],
        [0.0, 2.22],
      ],
      24,
    ),
  );
}

/** Slender structural bar — ridge beam and rafters, instanced. */
export function mullionGeometry(): THREE.BufferGeometry {
  return cachedGeometry("mullion", () => bevelledBox(0.05, 0.05, 1.0, 0.012));
}

/** A single gabled glass pane. */
export function glassPaneGeometry(): THREE.BufferGeometry {
  return cachedGeometry("glassPane", () => bevelledBox(5.5, 0.022, 2.05, 0.008));
}

/** Rounded, bevelled glass tabletop. */
export function tableTopGeometry(): THREE.BufferGeometry {
  return cachedGeometry("tableTop", () =>
    bevelledSlab(roundedRectShape(4.5, 1.15, 0.22), 0.055, 0.016),
  );
}

/** Gold apron frame running under the tabletop. */
export function tableApronGeometry(): THREE.BufferGeometry {
  return cachedGeometry("tableApron", () =>
    mergeParts([
      { geometry: bevelledBox(4.3, 0.07, 0.05, 0.014), matrix: at(0, 0, 0.5) },
      { geometry: bevelledBox(4.3, 0.07, 0.05, 0.014), matrix: at(0, 0, -0.5) },
      { geometry: bevelledBox(0.05, 0.07, 1.0, 0.014), matrix: at(2.14, 0, 0) },
      { geometry: bevelledBox(0.05, 0.07, 1.0, 0.014), matrix: at(-2.14, 0, 0) },
    ]),
  );
}

/** Turned table leg. */
export function tableLegGeometry(): THREE.BufferGeometry {
  return cachedGeometry("tableLeg", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.06, 0.0],
        [0.06, 0.02],
        [0.038, 0.05],
        [0.03, 0.42],
        [0.046, 0.5],
        [0.04, 0.56],
        [0.055, 0.62],
        [0.055, 0.66],
        [0.0, 0.66],
      ],
      16,
    ),
  );
}

/**
 * A whole chair merged into one buffer: bevelled seat, two uprights, a shaped
 * top rail and four turned legs. Instanced eight times for one draw call.
 */
export function chairGeometry(): THREE.BufferGeometry {
  return cachedGeometry("chair", () => {
    const leg = lathe(
      [
        [0.0, 0.0],
        [0.036, 0.0],
        [0.036, 0.028],
        [0.023, 0.055],
        [0.02, 0.3],
        [0.03, 0.34],
        [0.028, 0.4],
        [0.0, 0.42],
      ],
      12,
    );

    const parts: GeometryPart[] = [
      // Seat.
      { geometry: bevelledBox(0.44, 0.055, 0.42, 0.014), matrix: at(0, 0.445, 0) },
      // Back uprights.
      { geometry: bevelledBox(0.045, 0.46, 0.045, 0.011), matrix: at(-0.19, 0.7, -0.185) },
      { geometry: bevelledBox(0.045, 0.46, 0.045, 0.011), matrix: at(0.19, 0.7, -0.185) },
      // Top rail.
      { geometry: bevelledBox(0.43, 0.1, 0.045, 0.016), matrix: at(0, 0.9, -0.185) },
      // Lower back splat.
      { geometry: bevelledBox(0.38, 0.06, 0.03, 0.012), matrix: at(0, 0.68, -0.185) },
    ];

    for (const [x, z] of [
      [-0.18, -0.17],
      [0.18, -0.17],
      [-0.18, 0.17],
      [0.18, 0.17],
    ] as const) {
      parts.push({ geometry: leg, matrix: at(x, 0, z) });
    }

    const merged = mergeParts(parts);
    leg.dispose();
    return merged;
  });
}

/**
 * The turned candelabra — the clearest showcase for `LatheGeometry` here.
 * The profile walks a real candlestick silhouette: spreading foot, ogee stem,
 * a central knop, and a flared drip cup.
 */
export function candelabraGeometry(): THREE.BufferGeometry {
  return cachedGeometry("candelabra", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.155, 0.0],
        [0.155, 0.022],
        [0.128, 0.042],
        [0.072, 0.072],
        [0.05, 0.105],
        [0.044, 0.13],
        [0.072, 0.152],
        [0.076, 0.175],
        [0.052, 0.198],
        [0.034, 0.235],
        [0.031, 0.32],
        [0.052, 0.352],
        [0.048, 0.378],
        [0.03, 0.398],
        [0.03, 0.44],
        [0.068, 0.475],
        [0.074, 0.5],
        [0.052, 0.518],
        [0.0, 0.518],
      ],
      28,
    ),
  );
}

/** Tapered candle with a softened, slightly melted lip. */
export function candleGeometry(): THREE.BufferGeometry {
  return cachedGeometry("candle", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.03, 0.0],
        [0.03, 0.17],
        [0.028, 0.2],
        [0.024, 0.215],
        [0.012, 0.222],
        [0.0, 0.224],
      ],
      14,
    ),
  );
}

/** Turned place-setting plate. */
export function plateGeometry(): THREE.BufferGeometry {
  return cachedGeometry("plate", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.13, 0.0],
        [0.145, 0.006],
        [0.152, 0.018],
        [0.148, 0.024],
        [0.125, 0.02],
        [0.1, 0.012],
        [0.0, 0.011],
      ],
      20,
    ),
  );
}

// =============================================================================
// Materials
// =============================================================================

/**
 * Base opacity a material wants at full world presence. `applyWorldFade`
 * multiplies the world's fade by this, so glass can stay glass at rest.
 */
export interface FadeAwareUserData {
  baseOpacity?: number;
}

function withBaseOpacity<T extends THREE.Material>(material: T, baseOpacity: number): T {
  (material.userData as FadeAwareUserData).baseOpacity = baseOpacity;
  material.transparent = true;
  material.opacity = baseOpacity;
  return material;
}

export interface WeddingMaterials {
  readonly sandstone: THREE.MeshStandardMaterial;
  readonly bronze: THREE.MeshStandardMaterial;
  readonly ash: THREE.MeshStandardMaterial;
  readonly ember: THREE.MeshStandardMaterial;
  readonly flame: THREE.MeshStandardMaterial;
}

export interface ReceptionMaterials {
  readonly stone: THREE.MeshStandardMaterial;
  readonly gold: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly wax: THREE.MeshStandardMaterial;
  readonly flame: THREE.MeshStandardMaterial;
  readonly porcelain: THREE.MeshStandardMaterial;
}

const weddingMaterialCache = new Map<string, WeddingMaterials>();
const receptionMaterialCache = new Map<string, ReceptionMaterials>();

/** Late-bind the environment map once the renderer has produced one. */
function bindEnv(
  material: THREE.MeshStandardMaterial,
  env: THREE.Texture | null,
  intensity: number,
): void {
  if (env && material.envMap !== env) {
    material.envMap = env;
    material.envMapIntensity = intensity;
    material.needsUpdate = true;
  }
}

/**
 * PBR set for the havan kund. Bronze is a true metal (`metalness = 1`) relying
 * on the environment map plus a hammered roughness map for its highlights.
 */
export function getWeddingMaterials(
  chapter: ChapterConfig,
  env: THREE.Texture | null,
): WeddingMaterials {
  let set = weddingMaterialCache.get(chapter.id);

  if (!set) {
    const sandstoneMaps = setRepeat(getSurfaceMaps("sandstone"), 2.5, 2.5);
    const bronzeMaps = setRepeat(getSurfaceMaps("bronze"), 3, 3);

    set = {
      sandstone: new THREE.MeshStandardMaterial({
        color: chapter.palette.secondary,
        roughness: 0.92,
        metalness: 0.04,
        normalMap: sandstoneMaps.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: sandstoneMaps.roughnessMap,
        transparent: true,
      }),
      // Bronze: warm-dark base tint, fully metallic, hammered roughness.
      bronze: new THREE.MeshStandardMaterial({
        color: "#8C5A2B",
        roughness: 0.38,
        metalness: 1.0,
        normalMap: bronzeMaps.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughnessMap: bronzeMaps.roughnessMap,
        transparent: true,
      }),
      ash: new THREE.MeshStandardMaterial({
        color: "#2A2622",
        roughness: 1.0,
        metalness: 0.0,
        normalMap: sandstoneMaps.normalMap,
        normalScale: new THREE.Vector2(1.2, 1.2),
        transparent: true,
      }),
      ember: new THREE.MeshStandardMaterial({
        color: chapter.palette.emissive,
        emissive: new THREE.Color(chapter.palette.emissive),
        emissiveIntensity: 2.6,
        roughness: 0.7,
        metalness: 0.0,
        transparent: true,
      }),
      flame: withBaseOpacity(
        new THREE.MeshStandardMaterial({
          color: chapter.palette.emissive,
          emissive: new THREE.Color(chapter.palette.emissive),
          emissiveIntensity: 2.8,
          roughness: 1.0,
          metalness: 0.0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
        0.85,
      ),
    };
    weddingMaterialCache.set(chapter.id, set);
  }

  bindEnv(set.bronze, env, 1.6);
  bindEnv(set.sandstone, env, 0.55);
  return set;
}

/**
 * PBR set for the conservatory. Glass uses `MeshPhysicalMaterial` for clearcoat
 * and IOR but deliberately avoids `transmission`, which would add a full
 * back-buffer pass per frame and is not affordable alongside the bloom pass.
 */
export function getReceptionMaterials(
  chapter: ChapterConfig,
  env: THREE.Texture | null,
): ReceptionMaterials {
  let set = receptionMaterialCache.get(chapter.id);

  if (!set) {
    const stoneMaps = setRepeat(getSurfaceMaps("polishedStone"), 4, 2.5);
    const glassMaps = setRepeat(getSurfaceMaps("glass"), 2, 2);
    const waxMaps = setRepeat(getSurfaceMaps("wax"), 1, 1);

    set = {
      stone: new THREE.MeshStandardMaterial({
        color: chapter.palette.secondary,
        roughness: 0.3,
        metalness: 0.15,
        normalMap: stoneMaps.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughnessMap: stoneMaps.roughnessMap,
        transparent: true,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: chapter.palette.primary,
        roughness: 0.24,
        metalness: 1.0,
        normalMap: glassMaps.normalMap,
        normalScale: new THREE.Vector2(0.15, 0.15),
        transparent: true,
      }),
      glass: withBaseOpacity(
        new THREE.MeshPhysicalMaterial({
          color: chapter.palette.secondary,
          roughness: 0.05,
          metalness: 0.0,
          ior: 1.52,
          reflectivity: 0.62,
          clearcoat: 1.0,
          clearcoatRoughness: 0.03,
          normalMap: glassMaps.normalMap,
          normalScale: new THREE.Vector2(0.08, 0.08),
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        0.19,
      ),
      wax: new THREE.MeshStandardMaterial({
        color: "#F6EFE2",
        roughness: 0.55,
        metalness: 0.0,
        normalMap: waxMaps.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughnessMap: waxMaps.roughnessMap,
        transparent: true,
      }),
      flame: withBaseOpacity(
        new THREE.MeshStandardMaterial({
          color: chapter.palette.emissive,
          emissive: new THREE.Color(chapter.palette.emissive),
          emissiveIntensity: 3.0,
          roughness: 1.0,
          metalness: 0.0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
        0.85,
      ),
      porcelain: new THREE.MeshStandardMaterial({
        color: chapter.palette.emissive,
        roughness: 0.18,
        metalness: 0.02,
        transparent: true,
      }),
    };
    receptionMaterialCache.set(chapter.id, set);
  }

  bindEnv(set.gold, env, 1.9);
  bindEnv(set.stone, env, 0.8);
  bindEnv(set.porcelain, env, 0.6);
  if (env && set.glass.envMap !== env) {
    set.glass.envMap = env;
    set.glass.envMapIntensity = 2.1;
    set.glass.needsUpdate = true;
  }
  return set;
}

// =============================================================================
// Instancing helper
// =============================================================================

/** One instance's transform. */
export interface Placement {
  readonly position: readonly [number, number, number];
  /** Euler XYZ in radians. */
  readonly rotation?: readonly [number, number, number];
  /** Uniform, or per-axis. */
  readonly scale?: number | readonly [number, number, number];
}

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();

/** Compose transform matrices for a set of instances. */
export function buildMatrices(placements: readonly Placement[]): THREE.Matrix4[] {
  return placements.map((placement) => {
    _position.set(...(placement.position as [number, number, number]));

    if (placement.rotation) {
      _euler.set(...(placement.rotation as [number, number, number]));
      _quaternion.setFromEuler(_euler);
    } else {
      _quaternion.identity();
    }

    if (placement.scale === undefined) {
      _scale.set(1, 1, 1);
    } else if (typeof placement.scale === "number") {
      _scale.setScalar(placement.scale);
    } else {
      _scale.set(...(placement.scale as [number, number, number]));
    }

    return new THREE.Matrix4().compose(_position, _quaternion, _scale);
  });
}
