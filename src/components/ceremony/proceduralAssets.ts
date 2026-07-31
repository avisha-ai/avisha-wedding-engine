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
 * Value noise with smoothstep interpolation, tiling seamlessly every
 * `periodX`/`periodY` units so the resulting texture can use `RepeatWrapping`
 * without a visible seam.
 *
 * The two axes carry independent periods so a field can be *stretched*: bark
 * and sawn timber are long-grained, and a square lattice cannot express that.
 */
function valueNoise(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const x0w = wrap(x0, periodX);
  const x1w = wrap(x0 + 1, periodX);
  const y0w = wrap(y0, periodY);
  const y1w = wrap(y0 + 1, periodY);

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

/** Fractal Brownian motion. Periods double with frequency to stay tileable. */
function fbm(
  x: number,
  y: number,
  basePeriodX: number,
  basePeriodY: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): number {
  let amplitude = 1;
  let frequency = 1;
  let periodX = basePeriodX;
  let periodY = basePeriodY;
  let sum = 0;
  let norm = 0;

  for (let o = 0; o < octaves; o++) {
    sum +=
      amplitude *
      valueNoise(x * frequency, y * frequency, periodX, periodY, seed + o * 101);
    norm += amplitude;
    amplitude *= gain;
    frequency *= 2;
    periodX *= 2;
    periodY *= 2;
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
  /** Noise cells down the texture (V). Higher = finer grain. */
  readonly period: number;
  /**
   * Noise cells across the texture (U). Defaults to `period`. Setting the two
   * apart stretches the grain: a low `period` with a high `periodX` gives long
   * features running along V, which is what bark and sawn timber look like on a
   * lathed or extruded surface (U runs around, V runs along).
   */
  readonly periodX?: number;
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
  const periodX = spec.periodX ?? spec.period;
  const periodY = spec.period;
  const scaleX = periodX / size;
  const scaleY = periodY / size;
  const dentScale = spec.dentCells ? spec.dentCells / size : 0;
  const dentDepth = spec.dentDepth ?? 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = fbm(x * scaleX, y * scaleY, periodX, periodY, spec.octaves, spec.seed);
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
  // Banyan bark: deep vertical fissures. Long grain along V, fine across U.
  bark: {
    seed: 89,
    period: 3,
    periodX: 20,
    octaves: 4,
    bumpStrength: 3.4,
    roughBase: 0.93,
    roughVariance: 0.1,
  },
  // Oiled teak for the daybed frame — the same long grain, far shallower.
  teak: {
    seed: 97,
    period: 2,
    periodX: 16,
    octaves: 3,
    bumpStrength: 1.3,
    roughBase: 0.44,
    roughVariance: 0.2,
  },
  // Lantern and hardware brass: finer planishing than the wedding bronze.
  brass: {
    seed: 103,
    period: 4,
    octaves: 3,
    bumpStrength: 1.2,
    roughBase: 0.29,
    roughVariance: 0.18,
    dentCells: 7,
    dentDepth: 0.4,
  },
  // Slub-woven cushion linen. High frequency, isotropic, near-matte.
  linen: {
    seed: 109,
    period: 12,
    octaves: 2,
    bumpStrength: 2.0,
    roughBase: 0.78,
    roughVariance: 0.12,
  },
  // Weathered courtyard flagstone under the banyan.
  courtyardStone: {
    seed: 127,
    period: 6,
    octaves: 4,
    bumpStrength: 1.8,
    roughBase: 0.72,
    roughVariance: 0.18,
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
// Organic displacement
//
// Everything below deforms an already-built buffer in place and recomputes
// normals. All three sample `fbm` as a pure function of *position*, which is the
// property that makes them safe on non-indexed geometry: duplicated vertices
// sitting at the same point receive the same displacement, so seams stay welded
// and no cracks open up.
// -----------------------------------------------------------------------------

/**
 * Push every vertex out along its XZ radius by a low-frequency field, so a
 * lathed solid stops reading as a surface of revolution. `lobes` is the number
 * of noise cells around the circumference and must be an integer, or the field
 * will not close at the ±π seam.
 */
function roughenRadial(
  geometry: THREE.BufferGeometry,
  amount: number,
  lobes: number,
  seed: number,
): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;
  const spanY = Math.max(box.max.y - box.min.y, 1e-3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-4) continue; // pole vertex — nothing to push

    const u = (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * lobes;
    const v = ((y - box.min.y) / spanY) * 3;
    const k = 1 + (fbm(u, v, lobes, 3, 3, seed) - 0.5) * amount;

    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A lumpy, squashed foliage shell: an icosahedron whose radius is modulated by
 * two octaves of noise in spherical coordinates. `IcosahedronGeometry` is
 * non-indexed, so `computeVertexNormals` leaves it flat-shaded — exactly the
 * faceted read the low-poly canopy wants, with the leaf shader supplying the
 * organic detail on top.
 */
function lumpyShell(
  radius: number,
  detail: number,
  squashY: number,
  amount: number,
  seed: number,
): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;

    // Azimuth wraps over `6` cells; elevation runs 0..4 pole to pole.
    const u = (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * 6;
    const v = (Math.acos(Math.min(Math.max(y / len, -1), 1)) / Math.PI) * 4;

    const broad = fbm(u, v, 6, 4, 3, seed) - 0.5;
    const fine = fbm(u * 3, v * 3, 18, 12, 2, seed + 17) - 0.5;
    const k = 1 + broad * amount + fine * amount * 0.45;

    pos.setXYZ(i, x * k, y * k * squashY, z * k);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A hanging cloth panel: a subdivided plane with pleats and a slight inward
 * catenary baked in, standing in the XY plane with its face along +Z.
 *
 * The folds are *geometry*, not a normal map — the silk shader needs real
 * curvature for its lustre to sweep across, and the panel is cheap enough
 * (`segU × segV` quads) that there is no reason to fake it.
 *
 * UVs come straight from `PlaneGeometry`, so `uv.y == 1` at the top edge. That
 * is the contract the silk vertex stage reads its sway envelope from: the top
 * edge is the rail, and it does not move.
 */
function pleatedPanel(
  width: number,
  height: number,
  folds: number,
  foldDepth: number,
  segU: number,
  segV: number,
  seed: number,
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, segU, segV);
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const u = x / width + 0.5;
    // 0 at the hem, 1 at the rail. Clamped because `PlaneGeometry` builds its
    // rows by accumulation, so the last one can land a few ulps past the half
    // height — and a fractional `Math.pow` of the resulting -1e-17 is NaN,
    // which propagates into the whole buffer.
    const v = Math.min(Math.max(pos.getY(i) / height + 0.5, 0), 1);

    // Pleats are pinched where the cloth is tied off and open toward the hem.
    const open = 0.32 + 0.68 * Math.pow(1 - v, 1.3);

    let z = Math.sin(u * folds * Math.PI * 2) * foldDepth * open;
    // Irregularity, so the pleating is hand-hung rather than machine-perfect.
    z += (fbm(u * 5, v * 4, 5, 4, 2, seed) - 0.5) * foldDepth * 0.55 * open;
    // The cloth falls a little away from the frame as it descends.
    z -= (1 - v) * (1 - v) * foldDepth * 0.5;

    pos.setZ(i, z);
    pos.setX(i, x * (1 + (1 - v) * 0.1)); // slight flare at the hem
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A tube swept along a curve with a per-station radius.
 *
 * `THREE.TubeGeometry` is fixed-radius, and a branch that does not taper reads
 * as pipework. The frames come from the curve's own Frenet solve, so the
 * cross-sections stay square to the path around a bend.
 */
function taperedTube(
  curve: THREE.Curve<THREE.Vector3>,
  segments: number,
  sides: number,
  radiusAt: (t: number) => number,
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    const radius = radiusAt(t);

    for (let j = 0; j <= sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = -Math.cos(angle);

      const nx = cos * n.x + sin * b.x;
      const ny = cos * n.y + sin * b.y;
      const nz = cos * n.z + sin * b.z;
      const len = Math.hypot(nx, ny, nz) || 1;

      normals.push(nx / len, ny / len, nz / len);
      positions.push(
        point.x + nx * radius,
        point.y + ny * radius,
        point.z + nz * radius,
      );
      uvs.push(j / sides, t);
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
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

// -----------------------------------------------------------------------------
// Mehendi — banyan courtyard and canopy daybed
//
// The daybed is authored around its own base: local Y 0 is the underside of the
// posts, and the canopy rail sits at `DAYBED_RAIL_Y`. The world places the whole
// group on top of the dais.
// -----------------------------------------------------------------------------

/** Height of the daybed's canopy rail above its own base. */
export const DAYBED_RAIL_Y = 2.02;
/** Half-extents of the daybed footprint, post centre to post centre. */
export const DAYBED_HALF_X = 1.02;
export const DAYBED_HALF_Z = 0.6;

/** Rotate-then-translate placement matrix, for merged parts that must turn. */
function place(x: number, y: number, z: number, rotY = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
}

/** Flagstone courtyard plate with the daybed's raised dais merged into it. */
export function courtyardGeometry(): THREE.BufferGeometry {
  return cachedGeometry("courtyard", () =>
    mergeParts([
      { geometry: bevelledBox(7.0, 0.1, 5.8, 0.03), matrix: at(0, -0.05, 0) },
      { geometry: bevelledBox(2.9, 0.18, 2.0, 0.04), matrix: at(0, 0.09, 0) },
    ]),
  );
}

/**
 * Banyan trunk. A hand-walked profile with two knots, then pushed off-round by
 * `roughenRadial` — a perfectly circular trunk is the single thing that most
 * gives away a lathed tree.
 */
export function banyanTrunkGeometry(): THREE.BufferGeometry {
  return cachedGeometry("banyanTrunk", () =>
    roughenRadial(
      lathe(
        [
          [0.0, 0.0],
          [0.62, 0.0],
          [0.5, 0.14],
          [0.42, 0.34],
          [0.375, 0.7],
          [0.355, 1.05],
          [0.385, 1.22],
          [0.335, 1.42],
          [0.305, 1.85],
          [0.325, 2.05],
          [0.275, 2.35],
          [0.245, 2.65],
          [0.3, 2.85],
          [0.36, 2.95],
          [0.0, 3.0],
        ],
        14,
      ),
      0.24,
      7,
      41,
    ),
  );
}

/** Slender hanging aerial root, one unit long. Instanced and scaled to length. */
export function banyanAerialRootGeometry(): THREE.BufferGeometry {
  return cachedGeometry("banyanAerialRoot", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.05, -0.02],
        [0.042, -0.3],
        [0.03, -0.62],
        [0.022, -0.85],
        [0.0, -1.0],
      ],
      6,
    ),
  );
}

/** Thick prop root that has reached the ground and taken hold, one unit long. */
export function banyanPropRootGeometry(): THREE.BufferGeometry {
  return cachedGeometry("banyanPropRoot", () =>
    roughenRadial(
      lathe(
        [
          [0.0, 0.0],
          [0.11, -0.05],
          [0.085, -0.35],
          [0.07, -0.7],
          [0.09, -0.92],
          [0.135, -1.0],
          [0.0, -1.0],
        ],
        8,
      ),
      0.2,
      5,
      59,
    ),
  );
}

/** Radius, tessellation, squash, lumpiness and seed of each foliage shell. */
const BANYAN_SHELLS = [
  { radius: 2.6, detail: 2, squashY: 0.52, amount: 0.3, seed: 5 },
  { radius: 2.25, detail: 2, squashY: 0.55, amount: 0.34, seed: 19 },
  { radius: 1.75, detail: 1, squashY: 0.6, amount: 0.38, seed: 33 },
] as const;

/** How many concentric foliage shells the canopy is built from. */
export const BANYAN_SHELL_COUNT = BANYAN_SHELLS.length;

/**
 * The outer shell's envelope, exported so the world can hang roots and lanterns
 * off the canopy's actual underside rather than off a duplicated guess.
 */
export const BANYAN_CANOPY_RADIUS = BANYAN_SHELLS[0].radius;
export const BANYAN_CANOPY_HALF_HEIGHT =
  BANYAN_SHELLS[0].radius * BANYAN_SHELLS[0].squashY;

/** One foliage shell, `index` 0 (outermost) → 2 (innermost). */
export function banyanCanopyShellGeometry(index: number): THREE.BufferGeometry {
  const shell = BANYAN_SHELLS[index];
  return cachedGeometry(`banyanShell${index}`, () =>
    lumpyShell(shell.radius, shell.detail, shell.squashY, shell.amount, shell.seed),
  );
}

/** Turned daybed post, base at local Y 0, finial just above the rail. */
export function daybedPostGeometry(): THREE.BufferGeometry {
  return cachedGeometry("daybedPost", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.075, 0.0],
        [0.075, 0.035],
        [0.055, 0.07],
        [0.046, 0.3],
        [0.052, 0.36],
        [0.042, 0.42],
        [0.04, 1.8],
        [0.05, 1.88],
        [0.044, 1.96],
        [0.038, 2.02],
        [0.055, 2.06],
        [0.03, 2.1],
        [0.0, 2.12],
      ],
      14,
    ),
  );
}

/**
 * The daybed's teak carcass in one buffer: the canopy rail rectangle overhead,
 * the bed rails, and the slatted platform.
 */
export function daybedFrameGeometry(): THREE.BufferGeometry {
  return cachedGeometry("daybedFrame", () => {
    const spanX = DAYBED_HALF_X * 2 + 0.08;
    const spanZ = DAYBED_HALF_Z * 2 + 0.06;
    return mergeParts([
      // Canopy rail rectangle.
      {
        geometry: bevelledBox(spanX, 0.06, 0.055, 0.014),
        matrix: at(0, DAYBED_RAIL_Y, -DAYBED_HALF_Z),
      },
      {
        geometry: bevelledBox(spanX, 0.06, 0.055, 0.014),
        matrix: at(0, DAYBED_RAIL_Y, DAYBED_HALF_Z),
      },
      {
        geometry: bevelledBox(0.055, 0.06, spanZ, 0.014),
        matrix: at(-DAYBED_HALF_X, DAYBED_RAIL_Y, 0),
      },
      {
        geometry: bevelledBox(0.055, 0.06, spanZ, 0.014),
        matrix: at(DAYBED_HALF_X, DAYBED_RAIL_Y, 0),
      },
      // Bed rails.
      {
        geometry: bevelledBox(spanX, 0.09, 0.07, 0.018),
        matrix: at(0, 0.4, -DAYBED_HALF_Z),
      },
      {
        geometry: bevelledBox(spanX, 0.09, 0.07, 0.018),
        matrix: at(0, 0.4, DAYBED_HALF_Z),
      },
      {
        geometry: bevelledBox(0.07, 0.09, spanZ, 0.018),
        matrix: at(-DAYBED_HALF_X, 0.4, 0),
      },
      {
        geometry: bevelledBox(0.07, 0.09, spanZ, 0.018),
        matrix: at(DAYBED_HALF_X, 0.4, 0),
      },
      // Platform.
      { geometry: bevelledBox(2.0, 0.04, 1.16, 0.01), matrix: at(0, 0.44, 0) },
    ]);
  });
}

/** Deep, soft mattress — a rounded slab with a generous bevel. */
export function daybedMattressGeometry(): THREE.BufferGeometry {
  return cachedGeometry("daybedMattress", () =>
    bevelledSlab(roundedRectShape(2.02, 1.18, 0.1), 0.16, 0.05),
  );
}

/** Turned bolster cushion, lying along Z and centred on its own origin. */
export function bolsterGeometry(): THREE.BufferGeometry {
  return cachedGeometry("bolster", () => {
    const geometry = lathe(
      [
        [0.0, 0.0],
        [0.07, 0.005],
        [0.1, 0.03],
        [0.105, 0.08],
        [0.105, 0.62],
        [0.1, 0.67],
        [0.07, 0.695],
        [0.0, 0.7],
      ],
      14,
    );
    // The lathe runs up +Y; lay it down along +Z and centre it.
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -0.35);
    return geometry;
  });
}

/** Height of a drape panel — rail to hem. */
export const DRAPE_HEIGHT = 1.95;

/** A hanging silk drape panel. Its top edge is the rail; see {@link pleatedPanel}. */
export function drapePanelGeometry(): THREE.BufferGeometry {
  return cachedGeometry("drapePanel", () =>
    pleatedPanel(0.86, DRAPE_HEIGHT, 3.5, 0.075, 12, 16, 73),
  );
}

/** Pleated valance skirting the canopy rail on all four sides, merged to one buffer. */
export function drapeValanceGeometry(): THREE.BufferGeometry {
  return cachedGeometry("drapeValance", () => {
    const long = pleatedPanel(2.14, 0.3, 7, 0.045, 16, 3, 81);
    const short = pleatedPanel(1.28, 0.3, 4, 0.045, 10, 3, 87);
    const y = DAYBED_RAIL_Y - 0.18;
    const outZ = DAYBED_HALF_Z + 0.035;
    const outX = DAYBED_HALF_X + 0.035;

    const merged = mergeParts([
      { geometry: long, matrix: place(0, y, outZ) },
      { geometry: long, matrix: place(0, y, -outZ, Math.PI) },
      { geometry: short, matrix: place(-outX, y, 0, -Math.PI / 2) },
      { geometry: short, matrix: place(outX, y, 0, Math.PI / 2) },
    ]);
    long.dispose();
    short.dispose();
    return merged;
  });
}

/**
 * The taut silk canopy top. Built face-up with a slight central sag so the
 * cloth does not read as a rigid lid.
 */
export function daybedCanopyTopGeometry(): THREE.BufferGeometry {
  return cachedGeometry("daybedCanopyTop", () => {
    const geometry = new THREE.PlaneGeometry(2.12, 1.28, 10, 6);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / 2.12;
      const v = pos.getY(i) / 1.28;
      // Sag is deepest at the centre and pinned along all four edges.
      pos.setZ(i, -0.055 * (1 - 4 * u * u) * (1 - 4 * v * v));
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    // The plane faces +Z; stand it up so it faces +Y.
    geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingSphere();
    return geometry;
  });
}

/** Turned brass lantern with an open waist for the flame. Base at local Y 0. */
export function lanternGeometry(): THREE.BufferGeometry {
  return cachedGeometry("lantern", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.055, 0.0],
        [0.062, 0.02],
        [0.045, 0.045],
        [0.038, 0.055],
        [0.075, 0.075],
        [0.078, 0.09],
        [0.052, 0.1],
        [0.045, 0.16],
        [0.07, 0.185],
        [0.072, 0.2],
        [0.04, 0.225],
        [0.028, 0.26],
        [0.02, 0.3],
        [0.0, 0.31],
      ],
      10,
    ),
  );
}

/** The glowing body inside a lantern. */
export function lanternGlowGeometry(): THREE.BufferGeometry {
  return cachedGeometry("lanternGlow", () => new THREE.SphereGeometry(0.058, 10, 8));
}

/** Footed brass brazier — the firelight the silk drapes transmit. */
export function brazierGeometry(): THREE.BufferGeometry {
  return cachedGeometry("brazier", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.13, 0.0],
        [0.12, 0.025],
        [0.055, 0.06],
        [0.05, 0.14],
        [0.09, 0.19],
        [0.22, 0.31],
        [0.235, 0.35],
        [0.225, 0.375],
        [0.205, 0.355],
        [0.075, 0.24],
        [0.0, 0.235],
      ],
      18,
    ),
  );
}

// -----------------------------------------------------------------------------
// Proposal — the twilight glade
// -----------------------------------------------------------------------------

/** Radius of the mossy glade floor. */
export const GLADE_RADIUS = 4.6;
/** Radius of the lantern ring, and how many lanterns stand on it. */
export const GLADE_RING_RADIUS = 2.4;
export const GLADE_RING_COUNT = 8;
/** Height of a lantern post above the nominal ground plane. */
export const GLADE_POST_HEIGHT = 2.55;

/**
 * Height of the glade floor at a point.
 *
 * Exported because the flora has to *sit* on the moss: the ground plate and
 * every scattered tuft, bloom and toadstool solve their Y from this one
 * function, so nothing floats or sinks when the field is retuned.
 *
 * The dish term lifts the floor toward the treeline, which frames the ring and
 * hides the plate's edge in the fog.
 */
export function gladeGroundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const dish = 0.1 * Math.pow(Math.min(r / GLADE_RADIUS, 1), 2.2);
  const hummock = (fbm(x * 0.55 + 8, z * 0.55 + 8, 8, 8, 3, 211) - 0.5) * 0.22;
  return dish + hummock;
}

/** The mossy glade floor: a disc of concentric rings pushed into hummocks. */
export function gladeFloorGeometry(): THREE.BufferGeometry {
  return cachedGeometry("gladeFloor", () => {
    // Concentric rings rather than a fan of triangles from the centre, so the
    // displacement has vertices to work with all the way across.
    const geometry = new THREE.RingGeometry(0.0001, GLADE_RADIUS, 72, 16);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, gladeGroundHeight(pos.getX(i), pos.getZ(i)));
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  });
}

/**
 * A lantern post. Runs from below the ground plane so the base stays buried
 * whatever the hummocks are doing underneath it.
 */
export function gladePostGeometry(): THREE.BufferGeometry {
  return cachedGeometry("gladePost", () =>
    roughenRadial(
      lathe(
        [
          [0.0, -0.15],
          [0.095, -0.15],
          [0.075, 0.0],
          [0.055, 0.14],
          [0.046, 0.6],
          [0.042, 1.05],
          [0.047, 1.32],
          [0.038, 1.72],
          [0.034, 2.16],
          [0.041, 2.36],
          [0.028, 2.5],
          [0.0, GLADE_POST_HEIGHT],
        ],
        9,
      ),
      0.18,
      5,
      307,
    ),
  );
}

/**
 * One bough of the woven crown, arcing from a post to its neighbour.
 *
 * Authored across a single sector so the ring can be built by instancing this
 * one buffer at `i * sector` — which is also why the posts are a uniform height
 * rather than following the hummocks beneath them.
 */
export function gladeArchGeometry(): THREE.BufferGeometry {
  return cachedGeometry("gladeArch", () => {
    const sector = (Math.PI * 2) / GLADE_RING_COUNT;
    const r = GLADE_RING_RADIUS;
    const y = GLADE_POST_HEIGHT - 0.12;

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(r, y, 0),
      // Pulled inward and lifted, so the crown leans over the glade.
      new THREE.Vector3(
        Math.cos(sector / 2) * r * 0.86,
        GLADE_POST_HEIGHT + 0.8,
        Math.sin(sector / 2) * r * 0.86,
      ),
      new THREE.Vector3(Math.cos(sector) * r, y, Math.sin(sector) * r),
    );

    // Boughs thin as they arch — thickest where they leave the posts.
    return taperedTube(curve, 18, 5, (t) => 0.036 - Math.sin(t * Math.PI) * 0.013);
  });
}

/**
 * A lantern crystal: a six-sided quartz point. Deliberately coarse — the facet
 * shading comes from the shader's derivative pass, not from tessellation.
 */
export function fairyLanternGeometry(): THREE.BufferGeometry {
  return cachedGeometry("fairyLantern", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.055, 0.075],
        [0.085, 0.16],
        [0.09, 0.3],
        [0.07, 0.42],
        [0.03, 0.5],
        [0.0, 0.545],
      ],
      6,
    ),
  );
}

/** The burning core suspended inside a lantern crystal. */
export function lanternCoreGeometry(): THREE.BufferGeometry {
  return cachedGeometry("lanternCore", () => new THREE.SphereGeometry(0.05, 8, 6));
}

/**
 * The volume a lantern's light hangs in: an open cone, widening downward.
 *
 * `CylinderGeometry` puts `uv.y = 1` at the top ring, which is where the
 * lantern sits — the shaft shader reads its falloff straight off that.
 */
export function lightShaftGeometry(): THREE.BufferGeometry {
  return cachedGeometry("lightShaft", () =>
    new THREE.CylinderGeometry(0.1, 0.8, 1.0, 14, 6, true),
  );
}

/** A clump of moss blades, merged. Instanced across the whole glade floor. */
export function mossTuftGeometry(): THREE.BufferGeometry {
  return cachedGeometry("mossTuft", () => {
    const blade = new THREE.ConeGeometry(0.014, 0.06, 4, 1);
    const parts: GeometryPart[] = [];
    // Hand-placed rather than random: six blades is few enough that an even
    // spread reads better than a draw from a generator.
    for (const [x, z, lift] of [
      [0.0, 0.0, 1.15],
      [0.03, 0.018, 0.85],
      [-0.028, 0.022, 0.95],
      [0.012, -0.032, 1.05],
      [-0.02, -0.026, 0.8],
      [0.038, -0.008, 0.7],
    ] as const) {
      const part = blade.clone();
      part.scale(1, lift, 1);
      parts.push({ geometry: part, matrix: at(x, 0.03 * lift, z) });
    }
    const merged = mergeParts(parts);
    for (const part of parts) part.geometry.dispose();
    blade.dispose();
    return merged;
  });
}

/**
 * The UV split every wildflower is authored to: stem below, bloom above.
 *
 * Both species publish the same contract so one fragment shader can mask petal
 * from stem without knowing which flower it is drawing.
 */
export const FLOWER_BLOOM_V = 0.72;

/**
 * Rewrite a lathed flower's V so the bloom starts exactly at
 * {@link FLOWER_BLOOM_V}.
 *
 * `LatheGeometry` distributes V by *point index*, not arc length, so where the
 * bloom lands in UV space is an accident of how many points the stem happens to
 * use. Remapping about the known split makes it deliberate.
 */
function remapBloomV(geometry: THREE.BufferGeometry, split: number): THREE.BufferGeometry {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const v = uv.getY(i);
    uv.setY(
      i,
      v < split
        ? (v / split) * FLOWER_BLOOM_V
        : FLOWER_BLOOM_V + ((v - split) / (1 - split)) * (1 - FLOWER_BLOOM_V),
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * A bell-shaped wildflower: a narrow stem opening into a flared, rolled lip.
 * Lathed in one piece, then re-split so the flare owns the top of the UV range.
 */
export function bellflowerGeometry(): THREE.BufferGeometry {
  return cachedGeometry("bellflower", () =>
    remapBloomV(
      lathe(
        [
          [0.0, 0.0],
          [0.008, 0.005],
          [0.008, 0.09],
          [0.007, 0.17],
          [0.007, 0.24],
          [0.006, 0.29],
          [0.007, 0.33],
          [0.014, 0.355],
          [0.028, 0.378],
          [0.046, 0.404],
          [0.062, 0.428],
          [0.068, 0.45],
          [0.056, 0.462],
          [0.026, 0.452],
        ],
        7,
      ),
      // The flare begins at the eighth of fourteen points.
      8 / 13,
    ),
  );
}

/**
 * A five-petalled star bloom.
 *
 * Built from real petals rather than lathed, because a surface of revolution on
 * a stem is a *mushroom* silhouette however it is profiled — which is exactly
 * what the first pass of this glade looked like. Each petal is a flat diamond
 * splayed outward and tipped up, with its UVs written by hand so the bloom mask
 * and the throat glow land where the shader expects them.
 */
export function starflowerGeometry(): THREE.BufferGeometry {
  return cachedGeometry("starflower", () => {
    const petals = 5;
    const stemTop = 0.17;

    const stem = remapBloomV(
      lathe(
        [
          [0.0, 0.0],
          [0.005, 0.004],
          [0.005, 0.06],
          [0.0045, 0.12],
          [0.006, stemTop],
        ],
        5,
      ),
      1,
    );

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let p = 0; p < petals; p++) {
      const angle = (p / petals) * Math.PI * 2;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);

      // `along` runs out from the stem, `across` is the petal's width.
      const vertex = (along: number, across: number, y: number, v: number): void => {
        positions.push(ca * along - sa * across, y, sa * along + ca * across);
        uvs.push(0.5, v);
      };

      const base = positions.length / 3;
      vertex(0.008, 0, stemTop, FLOWER_BLOOM_V + 0.02);
      vertex(0.038, -0.019, stemTop + 0.011, 0.88);
      vertex(0.038, 0.019, stemTop + 0.011, 0.88);
      vertex(0.07, 0, stemTop + 0.018, 1.0);

      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    const bloom = new THREE.BufferGeometry();
    bloom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    bloom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    bloom.setIndex(indices);
    bloom.computeVertexNormals();

    const merged = mergeParts([{ geometry: stem }, { geometry: bloom }]);
    stem.dispose();
    bloom.dispose();
    return merged;
  });
}

/** A toadstool, for the ring of them the glade is named after. */
export function toadstoolGeometry(): THREE.BufferGeometry {
  return cachedGeometry("toadstool", () =>
    lathe(
      [
        [0.0, 0.0],
        [0.022, 0.0],
        [0.018, 0.03],
        [0.016, 0.08],
        [0.018, 0.115],
        [0.062, 0.125],
        [0.07, 0.145],
        [0.058, 0.175],
        [0.032, 0.192],
        [0.0, 0.198],
      ],
      10,
    ),
  );
}

// -----------------------------------------------------------------------------
// Deterministic scatter
// -----------------------------------------------------------------------------

/** A circular region flora must stay out of — a post footing, say. */
export interface KeepOut {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface ScatterOptions {
  readonly count: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly seed: number;
  readonly minScale: number;
  readonly maxScale: number;
  /** Ground height at a point — normally {@link gladeGroundHeight}. */
  readonly height: (x: number, z: number) => number;
  readonly keepOut?: readonly KeepOut[];
  /** Sink each instance by this much, so stems start below the surface. */
  readonly bury?: number;
}

/**
 * Scatter instances across an annulus of ground.
 *
 * Seeded from the same integer hash as the surface maps, so a given seed always
 * produces the same meadow — the scatter is authored content, not something
 * that should reshuffle between reloads.
 *
 * Radii are drawn through a square root so the result is uniform by *area*; a
 * linear draw crowds everything into the middle.
 */
export function scatterOnGround(options: ScatterOptions): Placement[] {
  const {
    count,
    innerRadius,
    outerRadius,
    seed,
    minScale,
    maxScale,
    height,
    keepOut = [],
    bury = 0,
  } = options;

  const placements: Placement[] = [];
  const inner2 = innerRadius * innerRadius;
  const outer2 = outerRadius * outerRadius;

  // Draws are cheap and rejections are rare, so oversample rather than risk
  // returning fewer instances than asked for.
  for (let i = 0; placements.length < count && i < count * 4; i++) {
    const r = Math.sqrt(inner2 + (outer2 - inner2) * hash2(i, 1, seed));
    const angle = hash2(i, 2, seed) * Math.PI * 2;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    let blocked = false;
    for (const zone of keepOut) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const scale = minScale + (maxScale - minScale) * hash2(i, 3, seed);
    placements.push({
      position: [x, height(x, z) - bury, z],
      rotation: [0, hash2(i, 4, seed) * Math.PI * 2, 0],
      scale,
    });
  }

  return placements;
}

// -----------------------------------------------------------------------------
// Engagement — the marble pavilion and its reflecting pool
// -----------------------------------------------------------------------------

/** Columns in the ring, and the radius they stand on. */
export const PAVILION_COLUMN_COUNT = 8;
export const PAVILION_RADIUS = 1.9;
/** Top of the stepped platform — the pavilion floor. */
export const PAVILION_FLOOR_Y = 0.28;
/** Height of a column, floor to the springing of the arches. */
export const PAVILION_COLUMN_HEIGHT = 1.95;
/** Where the arches spring from, in world Y. */
export const PAVILION_SPRING_Y = PAVILION_FLOOR_Y + PAVILION_COLUMN_HEIGHT;

/**
 * Cut vertical flutes into a lathed solid by modulating its radius with the
 * azimuth. Classical columns are fluted, and a smooth cylinder is the single
 * thing that most gives away a lathed order.
 */
function fluteRadial(
  geometry: THREE.BufferGeometry,
  flutes: number,
  depth: number,
): THREE.BufferGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;

    // Cosine grooves; the flat top of the wave is the arris between them.
    const k = 1 - depth * (0.5 - 0.5 * Math.cos(Math.atan2(z, x) * flutes));
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A fluted marble column: moulded base, entasis-tapered fluted shaft, and a
 * flared capital. Only the shaft is fluted — running the grooves through the
 * base and capital would read as a machining error rather than an order.
 */
export function pavilionColumnGeometry(): THREE.BufferGeometry {
  return cachedGeometry("pavilionColumn", () => {
    const h = PAVILION_COLUMN_HEIGHT;

    const base = lathe(
      [
        [0.0, 0.0],
        [0.2, 0.0],
        [0.2, 0.05],
        [0.17, 0.09],
        [0.155, 0.14],
        [0.135, 0.18],
      ],
      20,
    );

    // Entasis: the shaft swells slightly below the middle, then tapers.
    const shaft = fluteRadial(
      lathe(
        [
          [0.132, 0.18],
          [0.138, h * 0.32],
          [0.134, h * 0.55],
          [0.12, h * 0.78],
          [0.107, h - 0.16],
        ],
        // Six segments per flute. Fluting a lathe with fewer samples per groove
        // than the groove has sides aliases it into flat panels.
        96,
      ),
      16,
      0.1,
    );

    const capital = lathe(
      [
        [0.107, h - 0.16],
        [0.125, h - 0.115],
        [0.15, h - 0.07],
        [0.152, h - 0.03],
        [0.185, h - 0.02],
        [0.185, h],
        [0.0, h],
      ],
      20,
    );

    const merged = mergeParts([
      { geometry: base },
      { geometry: shaft },
      { geometry: capital },
    ]);
    base.dispose();
    shaft.dispose();
    capital.dispose();
    return merged;
  });
}

/**
 * A semicircular arch spanning one bay, built from real voussoirs.
 *
 * Authored across a single bay springing at Y 0, so the colonnade is one
 * instanced draw call rotated `i * sector` — the same trick the glade's crown
 * uses. Each wedge is oriented by an explicit basis: along the arc, radial, and
 * out of the arch's plane.
 */
export function pavilionArchGeometry(): THREE.BufferGeometry {
  return cachedGeometry("pavilionArch", () => {
    const sector = (Math.PI * 2) / PAVILION_COLUMN_COUNT;
    const start = new THREE.Vector3(PAVILION_RADIUS, 0, 0);
    const end = new THREE.Vector3(
      Math.cos(sector) * PAVILION_RADIUS,
      0,
      Math.sin(sector) * PAVILION_RADIUS,
    );

    const chord = new THREE.Vector3().subVectors(end, start);
    const arcRadius = chord.length() / 2;
    const centre = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const along = chord.clone().normalize();
    const planeNormal = new THREE.Vector3()
      .crossVectors(along, new THREE.Vector3(0, 1, 0))
      .normalize();
    const up = new THREE.Vector3(0, 1, 0);

    const voussoirs = 9;
    const step = Math.PI / voussoirs;
    // A hair of overlap, so the joints never open up under perspective.
    const width = arcRadius * step * 1.06;

    const parts: GeometryPart[] = [];
    const block = bevelledBox(width, 0.26, 0.3, 0.012);

    for (let i = 0; i < voussoirs; i++) {
      const theta = (i + 0.5) * step;
      const position = centre
        .clone()
        .addScaledVector(along, -arcRadius * Math.cos(theta))
        .addScaledVector(up, arcRadius * Math.sin(theta));

      const radial = position.clone().sub(centre).normalize();
      const tangent = new THREE.Vector3().crossVectors(planeNormal, radial);

      parts.push({
        geometry: block,
        matrix: new THREE.Matrix4()
          .makeBasis(tangent, radial, planeNormal)
          .setPosition(position),
      });
    }

    const merged = mergeParts(parts);
    block.dispose();
    return merged;
  });
}

/** Stepped octagonal platform the pavilion stands on. */
export function pavilionPlatformGeometry(): THREE.BufferGeometry {
  return cachedGeometry("pavilionPlatform", () =>
    // Eight lathe segments make an octagon rather than a disc.
    lathe(
      // Every station sits at or above the waterline: a platform that
      // straddled Y 0 would have its own mirror image overlap it.
      [
        [0.0, 0.0],
        [3.15, 0.0],
        [3.15, 0.08],
        [2.95, 0.08],
        [2.95, 0.15],
        [2.72, 0.15],
        [2.72, 0.21],
        [2.55, 0.21],
        [2.55, PAVILION_FLOOR_Y],
        [0.0, PAVILION_FLOOR_Y],
      ],
      8,
    ),
  );
}

/** Moulded cornice ring carried on the arches. */
export function pavilionCorniceGeometry(): THREE.BufferGeometry {
  return cachedGeometry("pavilionCornice", () =>
    lathe(
      [
        [2.02, 0.0],
        [2.16, 0.06],
        [2.22, 0.14],
        [2.18, 0.2],
        [2.06, 0.24],
        [1.98, 0.34],
        [1.92, 0.36],
      ],
      PAVILION_COLUMN_COUNT * 3,
    ),
  );
}

/** Ribbed marble dome with its finial, merged into one buffer. */
export function pavilionDomeGeometry(): THREE.BufferGeometry {
  return cachedGeometry("pavilionDome", () => {
    const dome = fluteRadial(
      lathe(
        [
          [1.92, 0.0],
          [1.9, 0.14],
          [1.82, 0.36],
          [1.66, 0.6],
          [1.42, 0.82],
          [1.08, 1.0],
          [0.66, 1.12],
          [0.26, 1.18],
          [0.0, 1.2],
        ],
        96,
      ),
      16,
      0.045,
    );

    const finial = lathe(
      [
        [0.0, 1.16],
        [0.14, 1.2],
        [0.16, 1.27],
        [0.1, 1.33],
        [0.06, 1.42],
        [0.09, 1.5],
        [0.05, 1.58],
        [0.0, 1.66],
      ],
      12,
    );

    const merged = mergeParts([{ geometry: dome }, { geometry: finial }]);
    dome.dispose();
    finial.dispose();
    return merged;
  });
}

/**
 * The reflecting pool. Flat and barely tessellated on purpose — every ripple in
 * this world is a per-pixel normal, so vertices here would buy nothing.
 */
export function reflectingPoolGeometry(): THREE.BufferGeometry {
  return cachedGeometry("reflectingPool", () => {
    // Wide enough that its edge sits well beyond the fog rather than cutting a
    // visible circle across the horizon.
    const geometry = new THREE.CircleGeometry(30, 64);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });
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

export interface ProposalMaterials {
  readonly bough: THREE.MeshStandardMaterial;
  readonly toadstool: THREE.MeshStandardMaterial;
  readonly core: THREE.MeshStandardMaterial;
}

export interface MehendiMaterials {
  readonly bark: THREE.MeshStandardMaterial;
  readonly teak: THREE.MeshStandardMaterial;
  readonly brass: THREE.MeshStandardMaterial;
  readonly linen: THREE.MeshStandardMaterial;
  readonly stone: THREE.MeshStandardMaterial;
  readonly glow: THREE.MeshStandardMaterial;
  readonly coal: THREE.MeshStandardMaterial;
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
const mehendiMaterialCache = new Map<string, MehendiMaterials>();
const proposalMaterialCache = new Map<string, ProposalMaterials>();

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
 * PBR set for the twilight glade — the handful of surfaces that are *not*
 * hand-authored shaders (moss, flora, crystal and shafts all are).
 *
 * Deliberately map-free. Every other world pays a one-off cost to rasterise
 * surface maps on first entry; here the posts and toadstools are small, dark
 * and backlit, the post geometry already carries its own irregularity from
 * `roughenRadial`, and a normal map would not survive the twilight key. Skipping
 * them means this chapter — the one the app opens on — has no texture-build
 * hitch at all.
 */
export function getProposalMaterials(
  chapter: ChapterConfig,
  env: THREE.Texture | null,
): ProposalMaterials {
  let set = proposalMaterialCache.get(chapter.id);

  if (!set) {
    set = {
      // Pale birch, so the posts read as a bright silhouette against the dark.
      bough: new THREE.MeshStandardMaterial({
        color: "#C4BBA8",
        roughness: 0.82,
        metalness: 0.0,
        transparent: true,
      }),
      toadstool: new THREE.MeshStandardMaterial({
        color: "#C9A48C",
        emissive: new THREE.Color(chapter.palette.emissive),
        emissiveIntensity: 0.5,
        roughness: 0.7,
        metalness: 0.0,
        transparent: true,
      }),
      // Driven per-frame so the cores breathe with the ring.
      core: new THREE.MeshStandardMaterial({
        color: chapter.palette.emissive,
        emissive: new THREE.Color(chapter.palette.emissive),
        emissiveIntensity: 4.0,
        roughness: 1.0,
        metalness: 0.0,
        transparent: true,
      }),
    };
    proposalMaterialCache.set(chapter.id, set);
  }

  bindEnv(set.bough, env, 0.35);
  bindEnv(set.toadstool, env, 0.3);
  return set;
}

/**
 * PBR set for the mehendi courtyard — everything in that world that is *not*
 * cloth or foliage, both of which are hand-authored shaders in `chapterWorlds`.
 *
 * Colours here are physical rather than palette-driven (bark is bark, brass is
 * brass); the chapter's 2900K key light and saffron lantern glow are what tie
 * them to the rest of the scene. Only the emissive members read the palette.
 *
 * This set rasterises five surface-map pairs on first use — the largest of the
 * three sets — so the first entry into the chapter pays a one-off cost of a few
 * tens of milliseconds. It lands inside the 2.6s transition tween, and every
 * later entry is a cache hit.
 */
export function getMehendiMaterials(
  chapter: ChapterConfig,
  env: THREE.Texture | null,
): MehendiMaterials {
  let set = mehendiMaterialCache.get(chapter.id);

  if (!set) {
    const barkMaps = setRepeat(getSurfaceMaps("bark"), 2, 1.5);
    const teakMaps = setRepeat(getSurfaceMaps("teak"), 1.5, 4);
    const brassMaps = setRepeat(getSurfaceMaps("brass"), 2, 2);
    const linenMaps = setRepeat(getSurfaceMaps("linen"), 3, 2);
    const stoneMaps = setRepeat(getSurfaceMaps("courtyardStone"), 5, 3.5);

    set = {
      // Deep, fissured bark. The bump strength is the whole effect here — the
      // base colour is almost flat.
      bark: new THREE.MeshStandardMaterial({
        color: "#3A2E24",
        roughness: 0.96,
        metalness: 0.0,
        normalMap: barkMaps.normalMap,
        normalScale: new THREE.Vector2(1.5, 1.5),
        roughnessMap: barkMaps.roughnessMap,
        transparent: true,
      }),
      teak: new THREE.MeshStandardMaterial({
        color: "#6B4527",
        roughness: 0.5,
        metalness: 0.04,
        normalMap: teakMaps.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: teakMaps.roughnessMap,
        transparent: true,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: "#B08A3E",
        roughness: 0.31,
        metalness: 1.0,
        normalMap: brassMaps.normalMap,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughnessMap: brassMaps.roughnessMap,
        transparent: true,
      }),
      linen: new THREE.MeshStandardMaterial({
        color: "#EFE3CC",
        roughness: 0.85,
        metalness: 0.0,
        normalMap: linenMaps.normalMap,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughnessMap: linenMaps.roughnessMap,
        transparent: true,
      }),
      stone: new THREE.MeshStandardMaterial({
        color: "#57514A",
        roughness: 0.8,
        metalness: 0.03,
        normalMap: stoneMaps.normalMap,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughnessMap: stoneMaps.roughnessMap,
        transparent: true,
      }),
      // Lantern bodies. `emissiveIntensity` is driven per-frame to flicker.
      glow: new THREE.MeshStandardMaterial({
        color: chapter.palette.emissive,
        emissive: new THREE.Color(chapter.palette.emissive),
        emissiveIntensity: 2.4,
        roughness: 0.8,
        metalness: 0.0,
        transparent: true,
      }),
      coal: new THREE.MeshStandardMaterial({
        color: "#2B1F18",
        emissive: new THREE.Color(chapter.palette.emissive),
        emissiveIntensity: 1.9,
        roughness: 0.9,
        metalness: 0.0,
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
    };
    mehendiMaterialCache.set(chapter.id, set);
  }

  bindEnv(set.brass, env, 1.7);
  bindEnv(set.teak, env, 0.45);
  bindEnv(set.stone, env, 0.5);
  bindEnv(set.bark, env, 0.22);
  bindEnv(set.linen, env, 0.35);
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
