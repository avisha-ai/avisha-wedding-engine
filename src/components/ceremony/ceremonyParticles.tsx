"use client";

/**
 * ceremonyParticles.tsx
 * -----------------------------------------------------------------------------
 * Phase II — Atmospheric VFX Particle Engine.
 *
 * GPU-driven `THREE.Points` systems, one physics profile per chapter. All
 * motion is computed in the vertex shader from a per-particle random seed +
 * `uTime`, so the per-frame CPU cost is only a handful of uniform writes — the
 * particle counts stay small and the frame rate stays pinned at 60 FPS.
 *
 *   Mehendi   → drifting marigold petals that sway and react to the cursor.
 *   Wedding   → translucent white smoke wisps rising from the fire pit.
 *   Legacy    → tiny dust motes drifting lazily, brightened inside light beams.
 *
 * Each system multiplies its alpha by `uOpacity`, driven from the same fade ref
 * the world cross-fade uses, so particles fade in/out with their chapter.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type JSX } from "react";
import * as THREE from "three";

import type { ChapterConfig } from "./ceremonyConfig";

/** Minimal structural shape of a mutable numeric ref we read each frame. */
type NumberRef = { current: number };

interface ParticleProps {
  readonly chapter: ChapterConfig;
  readonly fadeRef: NumberRef;
}

// -----------------------------------------------------------------------------
// Shared building blocks
// -----------------------------------------------------------------------------

/** A pure, seeded PRNG (mulberry32). Deterministic → SSR-safe and render-pure. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw a value in `[min, max)` from the given PRNG. */
const range = (rng: () => number, min: number, max: number): number =>
  min + rng() * (max - min);

type Rng = () => number;

/** Build a Points geometry with `position` (spawn), `aSeed`, and `aColor`. */
function useParticleGeometry(
  count: number,
  seed: number,
  spawn: (rng: Rng) => [number, number, number],
  color: (rng: Rng) => [number, number, number],
): THREE.BufferGeometry {
  return useMemo(() => {
    const rng = mulberry32(seed);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const [px, py, pz] = spawn(rng);
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
      seeds[i * 3] = rng();
      seeds[i * 3 + 1] = rng();
      seeds[i * 3 + 2] = rng();
      const [r, g, b] = color(rng);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    return geo;
    // Spawn/colour closures are stable for a given chapter mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, seed]);
}

/** Soft circular sprite shared by every system. */
const PARTICLE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float a = smoothstep(0.5, 0.05, d);
    if (a <= 0.001) discard;
    gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
  }
`;

const PARTICLE_HEADER = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSize;
  attribute vec3 aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
`;

// -----------------------------------------------------------------------------
// 1 — Mehendi: drifting marigold petals (cursor-reactive)
// -----------------------------------------------------------------------------

const PETAL_VERTEX = /* glsl */ `
  ${PARTICLE_HEADER}
  uniform vec2 uPointer;

  void main() {
    vColor = aColor;
    vec3 p = position;

    // Slow fall that wraps over a 6-unit column.
    float fall = uTime * (0.35 + aSeed.x * 0.4);
    p.y = mod(position.y - fall, 6.0);

    // Gentle sway on both horizontal axes.
    p.x += sin(uTime * (0.4 + aSeed.y * 0.5) + aSeed.z * 6.2831) * 0.5;
    p.z += cos(uTime * (0.3 + aSeed.z * 0.5) + aSeed.x * 6.2831) * 0.4;

    // Cursor wind — moving the pointer nudges the whole drift.
    p.x += uPointer.x * (0.9 + aSeed.y * 0.7);
    p.y += uPointer.y * (0.5 + aSeed.z * 0.5);

    vAlpha = 0.9;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

function MarigoldPetals({ fadeRef }: ParticleProps): JSX.Element {
  const count = 200;
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useParticleGeometry(
    count,
    101,
    (rng) => [range(rng, -4, 4), range(rng, 0, 6), range(rng, -3, 3)],
    (rng) => {
      // Blend marigold orange (#F4820B) and turmeric yellow (#E1A200).
      const t = rng();
      return [
        0.957 * t + 0.882 * (1 - t),
        0.51 * t + 0.635 * (1 - t),
        0.043 * t + 0.0 * (1 - t),
      ];
    },
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 150 },
      uOpacity: { value: 1 },
      uPointer: { value: new THREE.Vector2(0, 0) },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    (u.uTime as { value: number }).value += delta;
    (u.uOpacity as { value: number }).value = fadeRef.current;
    (u.uPointer as { value: THREE.Vector2 }).value.set(
      state.pointer.x,
      state.pointer.y,
    );
  });

  return (
    <points geometry={geometry} position={[0, 0, 0]}>
      <shaderMaterial
        ref={matRef}
        vertexShader={PETAL_VERTEX}
        fragmentShader={PARTICLE_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

// -----------------------------------------------------------------------------
// 2 — Wedding: rising translucent white smoke wisps
// -----------------------------------------------------------------------------

const SMOKE_VERTEX = /* glsl */ `
  ${PARTICLE_HEADER}

  void main() {
    vColor = aColor;
    vec3 p = position;

    // Rise from the pit (~y 1.1) and wrap over a 3-unit climb.
    float speed = 0.25 + aSeed.x * 0.3;
    float h = mod(uTime * speed + aSeed.y * 3.0, 3.0);
    p.y += 1.1 + h;

    // Widen and drift as the wisp climbs.
    float widen = 0.15 + h * 0.18;
    p.x += sin(uTime * (0.5 + aSeed.z * 0.5) + aSeed.y * 6.2831) * widen;
    p.z += cos(uTime * (0.4 + aSeed.x * 0.5) + aSeed.z * 6.2831) * widen;

    float hf = h / 3.0;
    vAlpha = (1.0 - hf) * 0.45;                 // fade out near the top

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.5 + hf * 1.4) * (1.0 / -mv.z);  // grow as it rises
    gl_Position = projectionMatrix * mv;
  }
`;

function SmokeWisps({ fadeRef }: ParticleProps): JSX.Element {
  const count = 80;
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useParticleGeometry(
    count,
    202,
    (rng) => [range(rng, -0.35, 0.35), range(rng, 0, 0.3), range(rng, -0.35, 0.35)],
    (rng) => {
      // Grey, not white. At 0.92 these sat well over the bloom pass's 0.55
      // luminance threshold, so every wisp came back as a blown-out ball.
      const v = 0.34 + rng() * 0.1;
      return [v, v * 0.97, v * 0.95];
    },
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 130 },
      uOpacity: { value: 1 },
    }),
    [],
  );

  useFrame((_state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    (u.uTime as { value: number }).value += delta;
    (u.uOpacity as { value: number }).value = fadeRef.current;
  });

  return (
    <points geometry={geometry} position={[0, 0, 0]}>
      <shaderMaterial
        ref={matRef}
        vertexShader={SMOKE_VERTEX}
        fragmentShader={PARTICLE_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

// -----------------------------------------------------------------------------
// 3 — Legacy: lazy dust motes drifting through light beams
// -----------------------------------------------------------------------------

const DUST_VERTEX = /* glsl */ `
  ${PARTICLE_HEADER}

  void main() {
    vColor = aColor;
    vec3 p = position;

    // Lazy, near-Brownian drift on all axes.
    p.x += sin(uTime * (0.14 + aSeed.x * 0.1) + aSeed.y * 6.2831) * 0.25;
    p.y += sin(uTime * (0.10 + aSeed.y * 0.1) + aSeed.z * 6.2831) * 0.20;
    p.z += cos(uTime * (0.12 + aSeed.z * 0.1) + aSeed.x * 6.2831) * 0.20;

    // Two vertical light shafts (x = -1.2 and x = 1.0): motes glow inside them.
    float b1 = exp(-pow(p.x + 1.2, 2.0) * 3.5);
    float b2 = exp(-pow(p.x - 1.0, 2.0) * 3.5);
    float beam = clamp(b1 + b2, 0.0, 1.0);
    vAlpha = (0.12 + beam * 0.8) * 0.8;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

function DustMotes({ fadeRef }: ParticleProps): JSX.Element {
  const count = 240;
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useParticleGeometry(
    count,
    303,
    (rng) => [range(rng, -3, 3), range(rng, 0, 3), range(rng, -1.5, 1.5)],
    (rng) => {
      // Warm amber dust (#E8863C) fading to ivory (#FDFBF7).
      const t = rng();
      return [
        0.909 * t + 0.992 * (1 - t),
        0.525 * t + 0.984 * (1 - t),
        0.235 * t + 0.969 * (1 - t),
      ];
    },
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 34 },
      uOpacity: { value: 1 },
    }),
    [],
  );

  useFrame((_state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    (u.uTime as { value: number }).value += delta;
    (u.uOpacity as { value: number }).value = fadeRef.current;
  });

  return (
    <points geometry={geometry} position={[0, 0, 0]}>
      <shaderMaterial
        ref={matRef}
        vertexShader={DUST_VERTEX}
        fragmentShader={PARTICLE_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

/**
 * Renders the atmospheric particle system for a chapter, or nothing for
 * chapters that have no VFX profile.
 */
export function ChapterParticles({ chapter, fadeRef }: ParticleProps): JSX.Element | null {
  switch (chapter.id) {
    case "mehendi":
      return <MarigoldPetals chapter={chapter} fadeRef={fadeRef} />;
    case "wedding":
      return <SmokeWisps chapter={chapter} fadeRef={fadeRef} />;
    case "legacy":
      return <DustMotes chapter={chapter} fadeRef={fadeRef} />;
    default:
      return null;
  }
}
