"use client";

// R3F pattern: memoised buffers and uniforms are mutated inside useFrame.
// React Compiler lint cannot see that this is imperative per-frame Three.js
// work, not render-time state.
/* eslint-disable react-hooks/immutability */

/**
 * worldEnvironment.tsx
 * -----------------------------------------------------------------------------
 * Phase 2 — turns each chapter's diorama into a place: gradient sky dome (with
 * stars at night), ground running to a fogged horizon, distant tree and haveli
 * silhouettes with lit windows, string lights, fireflies, diyas, coloured
 * sangeet lights, and the petal shower (tap) / petal rain (wedding).
 */

import { useFrame } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useMemo, useRef, type JSX } from "react";
import * as THREE from "three";

import type { ChapterId } from "./ceremonyConfig";
import type { QualityTier } from "./people/ChapterCast";

export interface EnvProfile {
  zenith: string;
  horizon: string;
  ground: string;
  /** Distant silhouette colour (before haze). */
  far: string;
  glowDir: [number, number, number];
  glow: string;
  stars: number;
  haveli: boolean;
  stringLights: boolean;
  fireflies: boolean;
  diyas: boolean;
  /** Camera drift amplitude, metres. */
  drift: number;
}

export const ENV: Record<ChapterId, EnvProfile> = {
  proposal: { zenith: "#14123A", horizon: "#B7687A", ground: "#1E3A2C", far: "#0C0E1E", glowDir: [-0.6, 0.12, -0.8], glow: "#F2A27A", stars: 1, haveli: false, stringLights: false, fireflies: true, diyas: false, drift: 0.35 },
  engagement: { zenith: "#4F7DB3", horizon: "#F7CF94", ground: "#6B7A4A", far: "#5B4A52", glowDir: [0.5, 0.08, -0.85], glow: "#FFD9A0", stars: 0, haveli: true, stringLights: false, fireflies: false, diyas: false, drift: 0.4 },
  mehendi: { zenith: "#2B3366", horizon: "#E9955A", ground: "#3D4A2A", far: "#1C1A2A", glowDir: [0.7, 0.1, -0.7], glow: "#FFB070", stars: 0.4, haveli: true, stringLights: true, fireflies: true, diyas: true, drift: 0.3 },
  sangeet: { zenith: "#08091F", horizon: "#3B2458", ground: "#1A1626", far: "#05060F", glowDir: [0, 0.15, -1], glow: "#7A3E8C", stars: 1, haveli: true, stringLights: true, fireflies: false, diyas: false, drift: 0.45 },
  wedding: { zenith: "#120E2C", horizon: "#7A3A36", ground: "#3A2A22", far: "#0A0812", glowDir: [0, 0.1, -1], glow: "#E07A3A", stars: 1, haveli: true, stringLights: true, fireflies: false, diyas: true, drift: 0.3 },
  reception: { zenith: "#7FA8D6", horizon: "#F8E6CC", ground: "#7D8A5C", far: "#8C8090", glowDir: [-0.6, 0.15, -0.8], glow: "#FFE8C0", stars: 0, haveli: true, stringLights: true, fireflies: false, diyas: false, drift: 0.35 },
  legacy: { zenith: "#0D1022", horizon: "#2E2643", ground: "#1C1A1A", far: "#07080F", glowDir: [0.4, 0.2, -0.9], glow: "#C9D6FF", stars: 1, haveli: false, stringLights: false, fireflies: false, diyas: true, drift: 0.2 },
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uGlow; uniform vec3 uGlowDir;
uniform float uStars; uniform float uTime; uniform float uOpacity;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.65, h), 0.75));
  col = mix(col, uGround, smoothstep(0.0, -0.25, h));
  float g = max(dot(d, normalize(uGlowDir)), 0.0);
  col += uGlow * (pow(g, 6.0) * 0.35 + pow(g, 60.0) * 0.6);
  vec3 cell = floor(d * 220.0);
  float s = hash(cell);
  float star = step(0.9965, s) * smoothstep(0.08, 0.35, h) * (0.6 + 0.4 * sin(uTime * (1.0 + s * 3.0) + s * 40.0));
  col += vec3(star) * uStars;
  gl_FragColor = vec4(col, uOpacity);
}`;

function SkyDome({ env }: { env: EnvProfile }): JSX.Element {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VS,
        fragmentShader: SKY_FS,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color(env.zenith) },
          uHorizon: { value: new THREE.Color(env.horizon) },
          uGround: { value: new THREE.Color(env.horizon).lerp(new THREE.Color(env.ground), 0.5) },
          uGlow: { value: new THREE.Color(env.glow) },
          uGlowDir: { value: new THREE.Vector3(...env.glowDir) },
          uStars: { value: env.stars },
          uTime: { value: 0 },
          uOpacity: { value: 1 },
        },
      }),
    [env],
  );
  useFrame((s) => {
    material.uniforms.uTime.value = s.clock.elapsedTime;
  });
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[95, 48, 24]} />
    </mesh>
  );
}

/** Instanced trees + haveli/palace blocks with chhatri domes and lit windows. */
function Silhouettes({ env, seed, tier }: { env: EnvProfile; seed: number; tier: QualityTier }): JSX.Element {
  const data = useMemo(() => {
    const rand = rng(seed);
    const haze = new THREE.Color(env.far).lerp(new THREE.Color(env.horizon), 0.38);
    const trunk = new THREE.Object3D();
    const trees: THREE.Matrix4[] = [];
    const nTrees = tier === "low" ? 26 : 54;
    for (let i = 0; i < nTrees; i++) {
      const a = rand() * Math.PI * 2;
      const r = 24 + rand() * 20;
      const s = 2.2 + rand() * 2.6;
      trunk.position.set(Math.cos(a) * r, s * 1.1, Math.sin(a) * r);
      trunk.scale.set(s, s * (0.9 + rand() * 0.5), s);
      trunk.updateMatrix();
      trees.push(trunk.matrix.clone());
    }
    const blocks: THREE.Matrix4[] = [];
    const domes: THREE.Matrix4[] = [];
    const windows: THREE.Matrix4[] = [];
    if (env.haveli) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.1 + (i / 8) * 0.8) + (rand() - 0.5) * 0.1;
        const r = 38 + rand() * 10;
        const w = 6 + rand() * 8, hgt = 4 + rand() * 6, d = 5;
        const o = new THREE.Object3D();
        o.position.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r);
        o.rotation.y = Math.atan2(o.position.x, o.position.z);
        o.scale.set(w, hgt, d);
        o.updateMatrix();
        blocks.push(o.matrix.clone());
        for (const dx of [-w / 2 + 0.8, w / 2 - 0.8]) {
          const c = o.clone();
          c.scale.setScalar(1.3);
          c.position.copy(o.localToWorld(new THREE.Vector3(dx / w, 0.5, 0)));
          c.updateMatrix();
          domes.push(c.matrix.clone());
        }
        for (let k = 0; k < 7; k++) {
          if (rand() < 0.35) continue;
          const c = new THREE.Object3D();
          c.position.copy(o.localToWorld(new THREE.Vector3(-0.42 + (k / 6) * 0.84, -0.2 + (rand() > 0.5 ? 0.3 : 0), -0.51)));
          c.rotation.y = o.rotation.y;
          c.updateMatrix();
          windows.push(c.matrix.clone());
        }
      }
    }
    return { haze, trees, blocks, domes, windows };
  }, [env, seed, tier]);

  const mats = useMemo(() => ({
    far: new THREE.MeshBasicMaterial({ color: data.haze, fog: false }),
    win: new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFC872").multiplyScalar(1.3), fog: false }),
  }), [data]);

  return (
    <>
      <Instanced matrices={data.trees} material={mats.far}><sphereGeometry args={[1, 10, 8]} /></Instanced>
      <Instanced matrices={data.blocks} material={mats.far}><boxGeometry args={[1, 1, 1]} /></Instanced>
      <Instanced matrices={data.domes} material={mats.far}><sphereGeometry args={[1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></Instanced>
      <Instanced matrices={data.windows} material={mats.win}><planeGeometry args={[0.6, 0.9]} /></Instanced>
    </>
  );
}

function Instanced({ matrices, material, children }: { matrices: THREE.Matrix4[]; material: THREE.Material; children: JSX.Element }): JSX.Element | null {
  const ref = useRef<THREE.InstancedMesh>(null);
  const setRef = (m: THREE.InstancedMesh | null) => {
    ref.current = m;
    if (!m) return;
    matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
  };
  if (matrices.length === 0) return null;
  return (
    <instancedMesh ref={setRef} args={[undefined, material, matrices.length]} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
}

/** Catenary strands of warm bulbs behind the scene. */
function StringLights({ seed }: { seed: number }): JSX.Element {
  const matrices = useMemo(() => {
    const rand = rng(seed);
    const out: THREE.Matrix4[] = [];
    const o = new THREE.Object3D();
    for (let s = 0; s < 6; s++) {
      const a0 = Math.PI * (1.05 + s * 0.15), a1 = a0 + Math.PI * 0.15;
      const r = 7 + rand() * 2;
      const A = new THREE.Vector3(Math.cos(a0) * r, 3.4, Math.sin(a0) * r);
      const B = new THREE.Vector3(Math.cos(a1) * r, 3.4, Math.sin(a1) * r);
      for (let k = 0; k <= 18; k++) {
        const u = k / 18;
        o.position.lerpVectors(A, B, u);
        o.position.y -= 0.7 * 4 * u * (1 - u);
        o.updateMatrix();
        out.push(o.matrix.clone());
      }
    }
    return out;
  }, [seed]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFD38A").multiplyScalar(2) }), []);
  return <Instanced matrices={matrices} material={material}><sphereGeometry args={[0.045, 8, 6]} /></Instanced>;
}

const FLY_VS = /* glsl */ `
uniform float uTime; attribute float aSeed; varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.4 + aSeed * 6.28) * 0.6;
  p.y += sin(uTime * 0.7 + aSeed * 12.0) * 0.35;
  p.z += cos(uTime * 0.35 + aSeed * 9.0) * 0.6;
  vA = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 30.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 70.0 / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FLY_FS = /* glsl */ `
uniform float uOpacity; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vA * uOpacity;
  gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * 2.0 * a, a);
}`;

function Fireflies({ count }: { count: number }): JSX.Element {
  const { geometry, material } = useMemo(() => {
    const rand = rng(99);
    const p = new Float32Array(count * 3), s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, r = 1.5 + rand() * 6;
      p.set([Math.cos(a) * r, 0.3 + rand() * 2.2, Math.sin(a) * r], i * 3);
      s[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: FLY_VS, fragmentShader: FLY_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    });
    m.userData.baseOpacity = 0.95;
    return { geometry: g, material: m };
  }, [count]);
  useFrame((s) => {
    material.uniforms.uTime.value = s.clock.elapsedTime;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/** A ring of clay diyas with flickering flames (instanced; flicker via scale). */
function Diyas({ radius, count }: { radius: number; count: number }): JSX.Element {
  const flames = useRef<THREE.InstancedMesh>(null);
  const cups = useMemo(() => {
    const o = new THREE.Object3D();
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      o.position.set(Math.cos(a) * radius, 0.03, Math.sin(a) * radius);
      o.updateMatrix();
      return o.matrix.clone();
    });
  }, [radius, count]);
  const mats = useMemo(() => ({
    clay: new THREE.MeshStandardMaterial({ color: "#8A4A2A", roughness: 0.9 }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFB347").multiplyScalar(3) }),
  }), []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame((s) => {
    const f = flames.current;
    if (!f) return;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const k = 0.8 + 0.25 * Math.sin(t * 13 + i * 7.1) + 0.1 * Math.sin(t * 29 + i);
      tmp.position.set(Math.cos(a) * radius, 0.1, Math.sin(a) * radius);
      tmp.scale.set(0.7 + 0.15 * k, k, 0.7 + 0.15 * k);
      tmp.updateMatrix();
      f.setMatrixAt(i, tmp.matrix);
    }
    f.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <Instanced matrices={cups} material={mats.clay}><cylinderGeometry args={[0.06, 0.035, 0.05, 12]} /></Instanced>
      <instancedMesh ref={flames} args={[undefined, mats.flame, count]} frustumCulled={false}>
        <sphereGeometry args={[0.022, 8, 6]} />
      </instancedMesh>
    </>
  );
}

/** Sangeet: coloured lights orbiting over the stage. */
function StageLights({ count }: { count: number }): JSX.Element {
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const colours = ["#FF2E88", "#22D3EE", "#FFB020"];
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    refs.current.forEach((l, i) => {
      if (!l) return;
      const a = t * (0.5 + i * 0.17) + i * 2.1;
      l.position.set(Math.cos(a) * 2.2, 3 + Math.sin(t + i) * 0.4, Math.sin(a) * 2.2);
    });
  });
  return (
    <>
      {colours.slice(0, count).map((c, i) => (
        <pointLight key={c} ref={(l) => { refs.current[i] = l; }} color={c} intensity={9} distance={9} decay={2} />
      ))}
    </>
  );
}

export function WorldEnvironment({ chapter, tier }: { chapter: ChapterId; tier: QualityTier }): JSX.Element {
  const env = ENV[chapter];
  const seed = chapter.length * 131 + chapter.charCodeAt(0);
  const ground = useMemo(() => new THREE.MeshStandardMaterial({ color: env.ground, roughness: 1 }), [env]);
  return (
    <group>
      <SkyDome env={env} />
      <mesh material={ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]}>
        <circleGeometry args={[90, 64]} />
      </mesh>
      <Silhouettes env={env} seed={seed} tier={tier} />
      {env.stringLights && <StringLights seed={seed} />}
      {env.fireflies && <Fireflies count={tier === "low" ? 30 : tier === "medium" ? 60 : 110} />}
      {env.diyas && <Diyas radius={chapter === "wedding" ? 2.9 : chapter === "legacy" ? 1.2 : 1.9} count={tier === "low" ? 10 : 18} />}
      {chapter === "sangeet" && tier !== "low" && <StageLights count={tier === "high" ? 3 : 1} />}
    </group>
  );
}

// -----------------------------------------------------------------------------
// Petals: tap-to-shower anywhere, plus gentle marigold rain at the wedding.
// Lives outside the world fade (it is not part of any one chapter).
// -----------------------------------------------------------------------------

export interface PetalHandle {
  burst: (at: THREE.Vector3) => void;
}

const PETAL_COLOURS = ["#F4820B", "#FFB300", "#E65100", "#C2185B", "#FFF3E0"];

export const Petals = forwardRef<PetalHandle, { max: number; rain: boolean }>(function Petals({ max, rain }, ref) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const state = useMemo(() => ({
    p: new Float32Array(max * 3), v: new Float32Array(max * 3), life: new Float32Array(max), spin: new Float32Array(max), next: 0, rainAcc: 0,
  }), [max]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }), []);

  const spawn = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
    const i = state.next;
    state.next = (i + 1) % max;
    state.p.set([x, y, z], i * 3);
    state.v.set([vx, vy, vz], i * 3);
    state.life[i] = 9;
    state.spin[i] = Math.random() * 6.28;
    mesh.current?.setColorAt(i, new THREE.Color(PETAL_COLOURS[i % PETAL_COLOURS.length]));
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  };

  useImperativeHandle(ref, () => ({
    burst: (at) => {
      for (let k = 0; k < Math.min(36, max / 3); k++) {
        spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
      }
    },
  }));

  useFrame((s, dt) => {
    const m = mesh.current;
    if (!m) return;
    const d = Math.min(dt, 0.05);
    if (rain) {
      state.rainAcc += d * 9;
      while (state.rainAcc > 1) {
        state.rainAcc -= 1;
        spawn((Math.random() - 0.5) * 7, 4.5, (Math.random() - 0.5) * 5, 0, -0.2, 0);
      }
    }
    const t = s.clock.elapsedTime;
    for (let i = 0; i < max; i++) {
      if (state.life[i] <= 0) {
        tmp.scale.setScalar(0);
      } else {
        state.life[i] -= d;
        const o = i * 3;
        const grounded = state.p[o + 1] <= 0.02;
        if (!grounded) {
          state.v[o + 1] = Math.max(state.v[o + 1] - 2.2 * d, -0.55);
          state.v[o] *= 1 - 0.8 * d;
          state.v[o + 2] *= 1 - 0.8 * d;
          state.p[o] += (state.v[o] + Math.sin(t * 2 + i) * 0.25) * d;
          state.p[o + 1] += state.v[o + 1] * d;
          state.p[o + 2] += (state.v[o + 2] + Math.cos(t * 1.7 + i) * 0.25) * d;
        }
        tmp.position.set(state.p[o], Math.max(state.p[o + 1], 0.02), state.p[o + 2]);
        tmp.rotation.set(grounded ? Math.PI / 2 : t * 3 + state.spin[i], state.spin[i], grounded ? 0 : t * 2.1 + i);
        tmp.scale.setScalar(Math.min(1, state.life[i]));
      }
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, material, max]} frustumCulled={false}>
      <circleGeometry args={[0.03, 6]} />
    </instancedMesh>
  );
});
