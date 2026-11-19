"use client";

// R3F pattern: joint refs live in a plain object and are only attached via ref= (read in useFrame).
// React Compiler lint cannot see that this is imperative per-frame Three.js
// work, not render-time state.
/* eslint-disable react-hooks/refs */

/**
 * people/Character.tsx
 * -----------------------------------------------------------------------------
 * Phase 2 — one procedural wedding guest: smooth lathe/capsule body on the
 * joint hierarchy from `rig.ts`, a friendly face (eyes, brows, smile), hair,
 * and attire generated as geometry. Geometry is shared module-wide; materials
 * are cached per chapter so the world cross-fade (`applyWorldFade`) on one
 * chapter never touches the other chapter's cast.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type JSX, type RefObject } from "react";
import * as THREE from "three";

import { applyMotion, HIP_HEIGHT, type Joints, type Motion } from "./rig";

export type Role = "bride" | "groom" | "pandit" | "woman" | "man" | "child";

export interface Look {
  readonly role: Role;
  readonly skin: string;
  readonly hair: string;
  /** Main garment colour. */
  readonly primary: string;
  /** Drape / trim colour. */
  readonly secondary: string;
  /** Overall scale (1 ≈ 1.72 m adult). */
  readonly scale: number;
  readonly garland?: boolean;
  /** Mehendi: warm glow on the hands. */
  readonly henna?: boolean;
}

export const SKIN_TONES = ["#8D5524", "#A0662F", "#C68642", "#B9805A", "#D9A066", "#E0AC69", "#7A4A2A", "#C98E62"] as const;
export const FESTIVE = ["#C2185B", "#F4820B", "#E1A200", "#0B6E6E", "#6A1B9A", "#2E7D32", "#D84315", "#1565C0", "#AD1457", "#F9A825"] as const;

// -----------------------------------------------------------------------------
// Breeze: drapes sway in the vertex shader off one shared clock.
// -----------------------------------------------------------------------------

export const breezeTime = { value: 0 };

function addBreeze(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBreeze = breezeTime;
    shader.vertexShader = "uniform float uBreeze;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float bw = clamp(-position.y, 0.0, 1.2);
       transformed.z += sin(uBreeze * 1.7 + position.y * 5.0 + position.x * 3.0) * 0.035 * bw;
       transformed.x += sin(uBreeze * 1.1 + position.y * 4.0) * 0.015 * bw;`,
    );
  };
  m.customProgramCacheKey = () => "avisha-breeze";
  return m;
}

// -----------------------------------------------------------------------------
// Caches
// -----------------------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
type MatKind = "plain" | "cloth" | "drape" | "gold" | "glow";
function mat(scope: string, kind: MatKind, color: string): THREE.MeshStandardMaterial {
  const key = `${scope}|${kind}|${color}`;
  let m = matCache.get(key);
  if (!m) {
    if (kind === "gold") {
      m = new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.3, emissive: "#8A5A10", emissiveIntensity: 0.7 });
    } else if (kind === "glow") {
      m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.6 });
    } else {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: kind === "plain" ? 0.62 : 0.78,
        side: kind === "plain" ? THREE.FrontSide : THREE.DoubleSide,
      });
      if (kind === "drape") addBreeze(m);
    }
    matCache.set(key, m);
  }
  return m;
}

/** Capsule whose origin is its top end, hanging along −Y. */
function limb(r: number, len: number): THREE.BufferGeometry {
  return geo(`limb${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 10).translate(0, -len / 2, 0));
}

function lathe(key: string, pts: ReadonlyArray<readonly [number, number]>, depth = 0.74): THREE.BufferGeometry {
  return geo(key, () => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    g.scale(1, 1, depth);
    g.computeVertexNormals();
    return g;
  });
}

const TORSO_F = [[0.001, -0.05], [0.15, -0.04], [0.14, 0.1], [0.112, 0.22], [0.142, 0.34], [0.15, 0.44], [0.07, 0.5], [0.001, 0.51]] as const;
const TORSO_M = [[0.001, -0.05], [0.155, -0.04], [0.152, 0.12], [0.15, 0.24], [0.168, 0.36], [0.182, 0.45], [0.07, 0.51], [0.001, 0.52]] as const;
const LEHENGA = [[0.15, 0.08], [0.17, -0.05], [0.24, -0.3], [0.34, -0.6], [0.46, -0.9], [0.47, -0.92]] as const;
const SAREE = [[0.15, 0.06], [0.16, -0.1], [0.19, -0.5], [0.23, -0.9], [0.24, -0.92]] as const;
const SHERWANI = [[0.16, 0.06], [0.17, -0.1], [0.2, -0.35], [0.22, -0.55]] as const;
const KURTA = [[0.158, 0.06], [0.165, -0.1], [0.19, -0.38]] as const;
const DHOTI = [[0.158, 0.04], [0.17, -0.15], [0.2, -0.62]] as const;

const sphere = (r: number, ws = 20, hs = 14) => geo(`s${r}_${ws}`, () => new THREE.SphereGeometry(r, ws, hs));

// -----------------------------------------------------------------------------
// The component
// -----------------------------------------------------------------------------

export interface CharacterProps {
  readonly look: Look;
  readonly scope: string;
  /** Motion for this frame; read every frame so callers can change it in place. */
  readonly motionRef: RefObject<{ motion: Motion; side: number }>;
  readonly phase: number;
  readonly castShadow?: boolean;
  readonly onJoints?: (j: Joints) => void;
}

export function Character({ look, scope, motionRef, phase, castShadow = false, onJoints }: CharacterProps): JSX.Element {
  const r = {
    root: useRef<THREE.Group>(null), hips: useRef<THREE.Group>(null), spine: useRef<THREE.Group>(null),
    chest: useRef<THREE.Group>(null), neck: useRef<THREE.Group>(null), head: useRef<THREE.Group>(null),
    shoulderL: useRef<THREE.Group>(null), elbowL: useRef<THREE.Group>(null), shoulderR: useRef<THREE.Group>(null),
    elbowR: useRef<THREE.Group>(null), hipL: useRef<THREE.Group>(null), kneeL: useRef<THREE.Group>(null),
    hipR: useRef<THREE.Group>(null), kneeR: useRef<THREE.Group>(null),
  };
  const joints = useRef<Joints | null>(null);
  const start = useRef<number | null>(null);

  const female = look.role === "bride" || look.role === "woman";
  const fullSkirt = look.role === "bride" || look.role === "woman";
  const m = useMemo(() => ({
    skin: mat(scope, "plain", look.skin),
    hair: mat(scope, "plain", look.hair),
    top: mat(scope, "cloth", look.role === "pandit" ? look.skin : look.primary),
    skirt: mat(scope, "cloth", look.role === "pandit" ? "#F7F3EA" : look.role === "groom" ? look.primary : look.role === "man" ? "#F2E8D5" : look.primary),
    drape: mat(scope, "drape", look.secondary),
    legs: mat(scope, "cloth", look.role === "groom" ? "#F3E6C8" : look.role === "pandit" ? "#F7F3EA" : "#EFE6D6"),
    gold: mat(scope, "gold", "#D9A93C"),
    dark: mat(scope, "plain", "#22140E"),
    white: mat(scope, "glow", "#FFFFFF"),
    lip: mat(scope, "plain", "#8C3B3B"),
    bindi: mat(scope, "plain", "#B00020"),
    tilak: mat(scope, "glow", "#E65100"),
    hand: look.henna ? mat(scope, "glow", "#B5532A") : mat(scope, "plain", look.skin),
    garland: mat(scope, "glow", "#F08A0B"),
    safa: mat(scope, "cloth", look.secondary),
  }), [scope, look]);

  useFrame((state) => {
    if (!joints.current) {
      const all = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.current]));
      if (Object.values(all).some((v) => !v)) return;
      joints.current = all as unknown as Joints;
      onJoints?.(joints.current);
    }
    if (start.current === null) start.current = state.clock.elapsedTime;
    const mr = motionRef.current;
    applyMotion(joints.current, mr.motion, state.clock.elapsedTime - start.current, phase, mr.side);
  });

  const cs = castShadow;
  const ud = cs ? { castsShadow: true } : undefined;
  const torso = female ? lathe("torsoF", TORSO_F) : lathe("torsoM", TORSO_M);

  return (
    <group ref={r.root} scale={look.scale}>
      <group ref={r.hips} position={[0, HIP_HEIGHT, 0]}>
        {/* Lower garment hangs from the hips. */}
        {look.role === "bride" && <mesh geometry={lathe("lehenga", LEHENGA, 0.92)} material={m.skirt} castShadow={cs} userData={ud} />}
        {look.role === "woman" && <mesh geometry={lathe("saree", SAREE, 0.85)} material={m.skirt} castShadow={cs} userData={ud} />}
        {look.role === "groom" && <mesh geometry={lathe("sherwani", SHERWANI, 0.8)} material={m.top} castShadow={cs} userData={ud} />}
        {(look.role === "man" || look.role === "child") && <mesh geometry={lathe("kurta", KURTA, 0.8)} material={m.top} />}
        {look.role === "pandit" && <mesh geometry={lathe("dhoti", DHOTI, 0.8)} material={m.skirt} />}

        {!fullSkirt &&
          ([[r.hipL, r.kneeL, 0.09], [r.hipR, r.kneeR, -0.09]] as const).map(([hip, knee, x]) => (
            <group key={x} ref={hip} position={[x, -0.02, 0]}>
              <mesh geometry={limb(0.066, 0.34)} material={m.legs} />
              <group ref={knee} position={[0, -0.43, 0]}>
                <mesh geometry={limb(0.054, 0.34)} material={m.legs} />
                <mesh geometry={geo("foot", () => new THREE.CapsuleGeometry(0.045, 0.12, 3, 8).rotateX(Math.PI / 2))} material={m.dark} position={[0, -0.45, 0.06]} />
              </group>
            </group>
          ))}
        {/* Skirted figures keep the leg joints (the rig expects them) but no leg meshes. */}
        {fullSkirt && (
          <>
            <group ref={r.hipL}><group ref={r.kneeL} /></group>
            <group ref={r.hipR}><group ref={r.kneeR} /></group>
          </>
        )}

        <group ref={r.spine}>
          <mesh geometry={torso} material={m.top} castShadow={cs} userData={ud} />
          {look.role === "woman" && <mesh geometry={geo("pallu", () => new THREE.PlaneGeometry(0.26, 1.0, 2, 12).translate(0, -0.5, 0))} material={m.drape} position={[0.08, 0.47, -0.1]} rotation={[0.25, 0.3, -0.35]} />}
          {(look.role === "groom" || look.role === "pandit") && <mesh geometry={geo("stole", () => new THREE.PlaneGeometry(0.16, 0.95, 1, 12).translate(0, -0.47, 0))} material={m.drape} position={[0.1, 0.48, 0.1]} rotation={[-0.15, 0, 0.42]} />}

          <group ref={r.chest} position={[0, 0.24, 0]}>
            {(["L", "R"] as const).map((s) => {
              const x = s === "L" ? 0.2 : -0.2;
              return (
                <group key={s} ref={s === "L" ? r.shoulderL : r.shoulderR} position={[female ? x * 0.92 : x, 0.19, 0]}>
                  <mesh geometry={limb(0.046, 0.22)} material={look.role === "pandit" || look.role === "bride" ? m.skin : m.top} />
                  <group ref={s === "L" ? r.elbowL : r.elbowR} position={[0, -0.28, 0]}>
                    <mesh geometry={limb(0.039, 0.2)} material={m.skin} />
                    <mesh geometry={sphere(0.047, 12, 10)} material={m.hand} position={[0, -0.27, 0]} scale={[0.85, 1.1, 0.6]} />
                    {female && <mesh geometry={geo("bangle", () => new THREE.TorusGeometry(0.045, 0.009, 6, 16).rotateX(Math.PI / 2))} material={m.gold} position={[0, -0.21, 0]} />}
                  </group>
                </group>
              );
            })}
            {look.garland && <mesh geometry={geo("garland", () => new THREE.TorusGeometry(0.17, 0.035, 8, 24).rotateX(Math.PI / 2 - 0.5))} material={m.garland} position={[0, 0.12, 0.05]} />}
            {(female || look.role === "groom") && <mesh geometry={geo("necklace", () => new THREE.TorusGeometry(0.085, 0.012, 6, 20).rotateX(Math.PI / 2 - 0.35))} material={m.gold} position={[0, 0.21, 0.03]} />}

            <group ref={r.neck} position={[0, 0.24, 0]}>
              <mesh geometry={limb(0.045, 0.05)} material={m.skin} position={[0, 0.07, 0]} />
              <group ref={r.head} position={[0, 0.06, 0]}>
                <Face m={m} role={look.role} female={female} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

type Mats = Record<"skin" | "hair" | "dark" | "white" | "lip" | "bindi" | "tilak" | "gold" | "drape" | "safa", THREE.Material>;

function Face({ m, role, female }: { readonly m: Mats; readonly role: Role; readonly female: boolean }): JSX.Element {
  const head = role === "child" ? 1.12 : 1;
  return (
    <group scale={head}>
      <mesh geometry={sphere(0.115, 28, 20)} material={m.skin} position={[0, 0.12, 0]} scale={[1, 1.1, 1.02]} />
      {/* Ears, nose */}
      <mesh geometry={sphere(0.024, 10, 8)} material={m.skin} position={[0.112, 0.115, -0.005]} />
      <mesh geometry={sphere(0.024, 10, 8)} material={m.skin} position={[-0.112, 0.115, -0.005]} />
      <mesh geometry={sphere(0.017, 10, 8)} material={m.skin} position={[0, 0.1, 0.115]} />
      {/* Eyes with a catchlight, soft brows, a small smile. */}
      {[0.041, -0.041].map((x) => (
        <group key={x} position={[x, 0.127, 0.1]}>
          <mesh geometry={sphere(0.017, 12, 10)} material={m.dark} scale={[1, 1.15, 0.7]} />
          <mesh geometry={sphere(0.005, 6, 6)} material={m.white} position={[0.005, 0.006, 0.011]} />
          <mesh geometry={geo("brow", () => new THREE.CapsuleGeometry(0.006, 0.03, 2, 6).rotateZ(Math.PI / 2))} material={m.dark} position={[0, 0.036, 0.004]} rotation={[0, 0, x > 0 ? -0.12 : 0.12]} />
        </group>
      ))}
      <mesh geometry={geo("smile", () => new THREE.TorusGeometry(0.026, 0.005, 6, 16, Math.PI).rotateZ(Math.PI))} material={m.lip} position={[0, 0.082, 0.106]} rotation={[-0.25, 0, 0]} />

      {female && <mesh geometry={sphere(0.007, 8, 6)} material={m.bindi} position={[0, 0.162, 0.111]} />}
      {role === "pandit" && <mesh geometry={geo("tilak", () => new THREE.CapsuleGeometry(0.006, 0.03, 2, 6))} material={m.tilak} position={[0, 0.175, 0.108]} />}

      {/* Hair */}
      {role !== "groom" && role !== "pandit" && (
        <mesh geometry={geo("hair", () => new THREE.SphereGeometry(0.123, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55))} material={m.hair} position={[0, 0.13, -0.012]} rotation={[-0.42, 0, 0]} />
      )}
      {female && <mesh geometry={sphere(0.058, 14, 10)} material={m.hair} position={[0, 0.12, -0.125]} />}
      {role === "pandit" && <mesh geometry={sphere(0.02, 8, 6)} material={m.hair} position={[0, 0.235, -0.04]} />}

      {/* Bride: dupatta over the head, falling down the back; maang tikka and earrings. */}
      {role === "bride" && (
        <>
          <mesh geometry={geo("hood", () => new THREE.SphereGeometry(0.138, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.6))} material={m.drape} position={[0, 0.13, -0.02]} rotation={[-0.62, 0, 0]} />
          <mesh geometry={geo("dupatta", () => new THREE.PlaneGeometry(0.4, 1.15, 2, 14).translate(0, -0.575, 0))} material={m.drape} position={[0, 0.17, -0.12]} rotation={[0.12, 0, 0]} />
          <mesh geometry={sphere(0.014, 8, 6)} material={m.gold} position={[0, 0.178, 0.112]} />
        </>
      )}
      {female && [0.112, -0.112].map((x) => <mesh key={x} geometry={sphere(0.012, 8, 6)} material={m.gold} position={[x, 0.08, 0.01]} />)}

      {/* Groom: safa (turban) with a gold kalgi plume. */}
      {role === "groom" && (
        <>
          <mesh geometry={lathe("safa", [[0.001, 0.31], [0.08, 0.305], [0.125, 0.27], [0.135, 0.2], [0.126, 0.14], [0.118, 0.12]], 1)} material={m.safa} position={[0, 0.02, -0.005]} />
          <mesh geometry={geo("kalgi", () => new THREE.ConeGeometry(0.018, 0.12, 8))} material={m.gold} position={[0, 0.3, 0.09]} rotation={[0.35, 0, 0]} />
          <mesh geometry={sphere(0.02, 10, 8)} material={m.gold} position={[0, 0.25, 0.125]} />
        </>
      )}
    </group>
  );
}
