"use client";

/**
 * people/ChapterCast.tsx
 * -----------------------------------------------------------------------------
 * Phase 2 — who is where in each chapter, and what they are doing.
 *
 * Full characters (`Character.tsx`) for the couple and the people near them;
 * an instanced crowd of simplified figures for everyone further away. Counts
 * scale with the render tier. All positions are in this one file: if someone
 * stands inside a prop once it is built, nudge the numbers in CASTS.
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type JSX } from "react";
import * as THREE from "three";

import type { ChapterId } from "../ceremonyConfig";
import { gladeGroundHeight } from "../proceduralAssets";
import { PHERA_TIMING, pheraClock } from "../ritualConfig";
import { breezeTime, Character, FESTIVE, SKIN_TONES, type Look, type Role } from "./Character";
import type { Motion } from "./rig";

export type QualityTier = "high" | "medium" | "low";

type Path =
  | { kind: "line"; from: [number, number]; delay: number; duration: number }
  | { kind: "pheras"; radius: number; lead: number };

interface Member {
  role: Role;
  at: [number, number, number];
  /** Facing, radians (0 = toward +Z / the default camera side). */
  face: number;
  motion: Motion;
  path?: Path;
  couple?: boolean;
  /** +1 partner on the left, −1 on the right (holdHands). */
  side?: number;
  min?: QualityTier;
  look?: Partial<Look>;
}

interface Crowd {
  /** Count per tier. */
  n: Record<QualityTier, number>;
  inner: number;
  outer: number;
  /** Arc in radians, angle measured as (cos a, sin a) on (x, z). */
  from: number;
  to: number;
  y: number;
  seated?: boolean;
}

const BRIDE: Partial<Look> = { primary: "#A3122A", secondary: "#C8102E" };
const GROOM: Partial<Look> = { primary: "#F1E4C3", secondary: "#B0122B" };

const CASTS: Record<ChapterId, { members: Member[]; crowd?: Crowd[] }> = {
  proposal: {
    members: [
      { role: "groom", at: [0.32, 0, 0.35], face: -1.25, motion: "kneel", couple: true, path: { kind: "line", from: [2.6, 3.2], delay: 0.5, duration: 7 }, look: { primary: "#2B3A55", secondary: "#2B3A55" } },
      { role: "bride", at: [-0.32, 0, 0.3], face: 1.3, motion: "idle", couple: true, path: { kind: "line", from: [-2.4, 3.0], delay: 0, duration: 7 }, look: { primary: "#E8899E", secondary: "#F6D3DC" } },
    ],
  },
  engagement: {
    members: [
      { role: "bride", at: [-0.35, 0.18, 0], face: 1.4, motion: "ringExchange", couple: true, look: { primary: "#C2185B", secondary: "#F8BBD0" } },
      { role: "groom", at: [0.35, 0.18, 0], face: -1.4, motion: "ringExchange", couple: true, look: { primary: "#1A1B4B", secondary: "#C8A24B" } },
      { role: "woman", at: [-2.6, 0, 1.6], face: 0.9, motion: "clap", min: "medium" },
      { role: "man", at: [-3.1, 0, 0.9], face: 1.1, motion: "idle", min: "medium" },
      { role: "woman", at: [2.7, 0, 1.4], face: -0.9, motion: "namaste", min: "high" },
      { role: "child", at: [2.2, 0, 2.0], face: -0.7, motion: "wave", min: "high" },
    ],
  },
  mehendi: {
    members: [
      { role: "bride", at: [0, 0.18, 0.1], face: 0, motion: "sitRaised", couple: true, look: { primary: "#F9A825", secondary: "#2E7D32", henna: true } },
      { role: "woman", at: [-1.1, 0.18, 0.8], face: 0.9, motion: "sit" },
      { role: "woman", at: [1.1, 0.18, 0.8], face: -0.9, motion: "clap" },
      { role: "woman", at: [-1.5, 0, -0.4], face: 1.6, motion: "clap", min: "medium" },
      { role: "woman", at: [1.6, 0, -0.3], face: -1.6, motion: "sit", min: "medium" },
      { role: "child", at: [0.7, 0, 1.6], face: 3.1, motion: "dance", min: "high" },
    ],
    crowd: [{ n: { high: 18, medium: 10, low: 0 }, inner: 3.2, outer: 4.4, from: Math.PI * 1.1, to: Math.PI * 1.9, y: 0, seated: true }],
  },
  sangeet: {
    members: [
      { role: "bride", at: [-0.5, 0.31, 0.2], face: 0.3, motion: "dance", couple: true, look: { primary: "#6A1B9A", secondary: "#E1A200" } },
      { role: "groom", at: [0.5, 0.31, 0.2], face: -0.3, motion: "dance", couple: true, look: { primary: "#0B6E6E", secondary: "#E1A200" } },
      { role: "woman", at: [-1.4, 0.31, -0.6], face: 0.5, motion: "garba" },
      { role: "woman", at: [1.4, 0.31, -0.6], face: -0.5, motion: "garba", min: "medium" },
      { role: "man", at: [0, 0.31, -1.3], face: 0, motion: "dance", min: "medium" },
      { role: "man", at: [-1.8, 0.31, 0.5], face: 0.8, motion: "dance", min: "high" },
    ],
    crowd: [{ n: { high: 60, medium: 28, low: 12 }, inner: 3.4, outer: 6.2, from: Math.PI * 1.05, to: Math.PI * 1.95, y: 0 }],
  },
  wedding: {
    members: [
      { role: "groom", at: [0, 0, 0], face: 0, motion: "walk", couple: true, path: { kind: "pheras", radius: 2.05, lead: 0 }, look: { ...GROOM, garland: true } },
      { role: "bride", at: [0, 0, 0], face: 0, motion: "walk", couple: true, path: { kind: "pheras", radius: 2.05, lead: -0.38 }, look: { ...BRIDE, garland: true } },
      { role: "pandit", at: [-2.2, 0, -1.4], face: 1.0, motion: "chant" },
      { role: "woman", at: [2.8, 0, -1.2], face: -1.2, motion: "petalThrow", min: "medium" },
      { role: "man", at: [3.1, 0, -0.4], face: -1.4, motion: "namaste", min: "high" },
    ],
    crowd: [
      { n: { high: 44, medium: 22, low: 10 }, inner: 3.6, outer: 5.6, from: Math.PI * 1.1, to: Math.PI * 1.9, y: 0, seated: true },
      { n: { high: 16, medium: 8, low: 0 }, inner: 3.8, outer: 5.0, from: -0.5, to: 0.25, y: 0, seated: true },
    ],
  },
  reception: {
    members: [
      { role: "bride", at: [-0.3, 0.045, 1.3], face: 0.25, motion: "namaste", couple: true, look: { primary: "#E8C9A0", secondary: "#C8A24B" } },
      { role: "groom", at: [0.3, 0.045, 1.3], face: -0.25, motion: "wave", couple: true, look: { primary: "#1A1B4B", secondary: "#C8A24B" } },
      { role: "woman", at: [-1.6, 0.045, 0.9], face: 0.8, motion: "idle" },
      { role: "man", at: [-2.2, 0.045, 0.3], face: 1.2, motion: "clap", min: "medium" },
      { role: "woman", at: [2.0, 0.045, 0.6], face: -1.0, motion: "idle", min: "medium" },
      { role: "man", at: [2.6, 0.045, -0.6], face: -1.4, motion: "idle", min: "high" },
    ],
    crowd: [{ n: { high: 24, medium: 12, low: 0 }, inner: 2.4, outer: 3.4, from: Math.PI * 1.15, to: Math.PI * 1.85, y: 0.045 }],
  },
  legacy: {
    members: [
      { role: "bride", at: [-0.28, 0, 0.35], face: 2.6, motion: "holdHands", side: -1, couple: true, look: { primary: "#8A2E4D", secondary: "#C8A24B" } },
      { role: "groom", at: [0.28, 0, 0.35], face: -2.6, motion: "holdHands", side: 1, couple: true, look: { primary: "#3E2C23", secondary: "#C8A24B" } },
    ],
  },
};

const TIER_RANK: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 };

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lookFor(m: Member, i: number, rand: () => number): Look {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
  const base: Look = {
    role: m.role,
    skin: pick(SKIN_TONES),
    hair: pick(["#1B120D", "#2A1B12", "#151010"]),
    primary: pick(FESTIVE),
    secondary: pick(FESTIVE),
    scale: m.role === "child" ? 0.6 : m.role === "groom" || m.role === "man" ? 1.03 + rand() * 0.05 : 0.95 + rand() * 0.05,
  };
  if (m.role === "bride") Object.assign(base, BRIDE);
  if (m.role === "groom") Object.assign(base, GROOM);
  if (m.role === "pandit") Object.assign(base, { primary: "#F7F3EA", secondary: "#F4820B", hair: "#3A3A3A" });
  return { ...base, ...m.look, role: m.role };
}

function groundY(chapter: ChapterId, x: number, z: number, y: number): number {
  return chapter === "proposal" ? gladeGroundHeight(x, z) : y;
}

/** A character that follows its path and switches motion when it arrives. */
function CastMember({ m, look, chapter, index, shadows, onTap, anchor }: {
  m: Member; look: Look; chapter: ChapterId; index: number; shadows: boolean;
  onTap?: () => void; anchor?: (g: THREE.Group | null) => void;
}): JSX.Element {
  const group = useRef<THREE.Group>(null);
  const motionRef = useRef({ motion: m.path ? ("walk" as Motion) : m.motion, side: m.side ?? 1 });
  const born = useRef<number | null>(null);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    if (born.current === null) born.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - born.current;
    const p = m.path;
    if (!p) return;
    if (p.kind === "line") {
      const k = THREE.MathUtils.clamp((t - p.delay) / p.duration, 0, 1);
      const e = k * k * (3 - 2 * k);
      const x = THREE.MathUtils.lerp(p.from[0], m.at[0], e);
      const z = THREE.MathUtils.lerp(p.from[1], m.at[2], e);
      g.position.set(x, groundY(chapter, x, z, m.at[1]), z);
      if (k < 1) g.rotation.y = Math.atan2(m.at[0] - p.from[0], m.at[2] - p.from[1]);
      else g.rotation.y += (m.face - g.rotation.y) * 0.05;
      motionRef.current.motion = k > 0 && k < 1 ? "walk" : k >= 1 ? m.motion : "idle";
    } else {
      // Pheras: clockwise around the agni (fire on the right), one shared clock.
      const now = performance.now() / 1000;
      const cycle = PHERA_TIMING.round * PHERA_TIMING.rounds + PHERA_TIMING.rest;
      const k = (now - pheraClock.epoch) % cycle;
      const walking = k < PHERA_TIMING.round * PHERA_TIMING.rounds;
      const a = (walking ? (k / PHERA_TIMING.round) * Math.PI * 2 : 0) + Math.PI / 2 + p.lead;
      g.position.set(Math.cos(a) * p.radius, m.at[1], Math.sin(a) * p.radius);
      g.rotation.y = walking ? Math.atan2(-Math.sin(a), Math.cos(a)) : Math.atan2(-Math.cos(a), -Math.sin(a));
      motionRef.current.motion = walking ? "walk" : "namaste";
    }
  });

  return (
    <group
      ref={(g) => {
        group.current = g;
        anchor?.(g);
      }}
      position={m.at}
      rotation={[0, m.face, 0]}
      onClick={onTap ? (e) => { if (e.delta < 8) { e.stopPropagation(); onTap(); } } : undefined}
    >
      <Character look={look} scope={chapter} motionRef={motionRef} phase={index * 1.37} castShadow={shadows && !!m.couple} />
    </group>
  );
}

/** Cheap distant guests: one instanced body + one instanced head. */
function CrowdField({ crowd, count, chapter, seed }: { crowd: Crowd; count: number; chapter: ChapterId; seed: number }): JSX.Element | null {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const geos = useMemo(() => {
    const body = new THREE.LatheGeometry(
      [[0.2, 0], [0.2, 0.05], [0.15, 0.7], [0.13, 0.95], [0.17, 1.25], [0.15, 1.36], [0.05, 1.42], [0.001, 1.43]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
    body.scale(1, 1, 0.75);
    return { body, head: new THREE.SphereGeometry(0.11, 12, 10) };
  }, []);
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    head: new THREE.MeshStandardMaterial({ roughness: 0.65 }),
  }), []);
  const people = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: count }, () => {
      const a = THREE.MathUtils.lerp(crowd.from, crowd.to, rand());
      const r = THREE.MathUtils.lerp(crowd.inner, crowd.outer, rand());
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return { x, z, y: groundY(chapter, x, z, crowd.y), face: Math.atan2(-x, -z), s: 0.9 + rand() * 0.18, ph: rand() * 6.28 };
    });
  }, [count, crowd, chapter, seed]);

  useEffect(() => {
    const b = bodyRef.current, h = headRef.current;
    if (!b || !h) return;
    const rand = rng(seed + 7);
    const c = new THREE.Color();
    people.forEach((_, i) => {
      b.setColorAt(i, c.set(FESTIVE[Math.floor(rand() * FESTIVE.length)]));
      h.setColorAt(i, c.set(SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)]));
    });
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
  }, [people, seed]);

  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    const b = bodyRef.current, h = headRef.current;
    if (!b || !h) return;
    const t = state.clock.elapsedTime;
    const sy = crowd.seated ? 0.62 : 1;
    people.forEach((p, i) => {
      const sway = Math.sin(t * 1.3 + p.ph) * 0.04;
      tmp.position.set(p.x, p.y + (crowd.seated ? 0 : Math.max(0, Math.sin(t * 5 + p.ph)) * 0.015), p.z);
      tmp.rotation.set(0, p.face, sway);
      tmp.scale.set(p.s, p.s * sy, p.s);
      tmp.updateMatrix();
      b.setMatrixAt(i, tmp.matrix);
      tmp.position.y += 1.55 * p.s * sy + 0.02;
      tmp.position.x += Math.sin(sway) * -0.3;
      tmp.scale.setScalar(p.s);
      tmp.updateMatrix();
      h.setMatrixAt(i, tmp.matrix);
    });
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;
  return (
    <>
      <instancedMesh ref={bodyRef} args={[geos.body, mats.body, count]} frustumCulled={false} />
      <instancedMesh ref={headRef} args={[geos.head, mats.head, count]} frustumCulled={false} />
    </>
  );
}

/** The thin cloth knot (gathbandhan) that links the couple during the pheras. */
function Gathbandhan({ a, b, scope }: { a: { current: THREE.Group | null }; b: { current: THREE.Group | null }; scope: string }): JSX.Element {
  const s1 = useRef<THREE.Mesh>(null);
  const s2 = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: "#F4C430", roughness: 0.7, side: THREE.DoubleSide, name: scope }), [scope]);
  const geometry = useMemo(() => new THREE.BoxGeometry(0.05, 0.012, 1), []);
  const pa = useMemo(() => new THREE.Vector3(), []);
  const pb = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!a.current || !b.current || !s1.current || !s2.current) return;
    pa.copy(a.current.position).setY(a.current.position.y + 0.95);
    pb.copy(b.current.position).setY(b.current.position.y + 0.85);
    mid.addVectors(pa, pb).multiplyScalar(0.5).setY((pa.y + pb.y) / 2 - 0.14);
    for (const [seg, from, to] of [[s1.current, pa, mid], [s2.current, mid, pb]] as const) {
      seg.position.addVectors(from, to).multiplyScalar(0.5);
      seg.scale.z = from.distanceTo(to);
      seg.lookAt(to);
    }
  });
  return (
    <>
      <mesh ref={s1} geometry={geometry} material={material} />
      <mesh ref={s2} geometry={geometry} material={material} />
    </>
  );
}

export interface ChapterCastProps {
  readonly chapter: ChapterId;
  readonly tier: QualityTier;
  readonly onCoupleTap?: () => void;
}

export function ChapterCast({ chapter, tier, onCoupleTap }: ChapterCastProps): JSX.Element {
  const cast = CASTS[chapter];
  const groom = useRef<THREE.Group | null>(null);
  const bride = useRef<THREE.Group | null>(null);

  const members = useMemo(() => {
    const rand = rng(chapter.length * 97 + 11);
    return cast.members
      .map((m, i) => ({ m, look: lookFor(m, i, rand), i }))
      .filter(({ m }) => TIER_RANK[tier] >= TIER_RANK[m.min ?? "low"]);
  }, [cast, chapter, tier]);

  useEffect(() => {
    if (chapter === "wedding") pheraClock.epoch = performance.now() / 1000;
  }, [chapter]);

  useFrame((state) => {
    breezeTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      {members.map(({ m, look, i }) => (
        <CastMember
          key={i}
          m={m}
          look={look}
          chapter={chapter}
          index={i}
          shadows={tier === "high"}
          onTap={m.couple ? onCoupleTap : undefined}
          anchor={m.couple ? (g) => { if (m.role === "groom") groom.current = g; if (m.role === "bride") bride.current = g; } : undefined}
        />
      ))}
      {chapter === "wedding" && <Gathbandhan a={groom} b={bride} scope={chapter} />}
      {cast.crowd?.map((c, k) => (
        <CrowdField key={`${k}-${tier}`} crowd={c} count={c.n[tier]} chapter={chapter} seed={k * 31 + chapter.length} />
      ))}
    </group>
  );
}
