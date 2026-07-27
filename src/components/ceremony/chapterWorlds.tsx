"use client";

/**
 * chapterWorlds.tsx
 * -----------------------------------------------------------------------------
 * The seven per-chapter "structural worlds" for the Living Ceremony Layer.
 *
 * Each world is a self-contained R3F group built from primitives, themed by its
 * chapter's palette and lit by the scene's (tweened) lights. All materials are
 * marked `transparent` so the parent can cross-fade whole worlds by driving
 * their opacity — see `applyWorldFade` / <FadeWorld> in CeremonyCanvas.
 *
 * A reusable <GoldMaterial> re-applies the beaten-gold shader to hero accents so
 * the gold motif carries through the story.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type JSX } from "react";
import * as THREE from "three";

import { kelvinToRGB, type ChapterConfig, type ChapterId } from "./ceremonyConfig";
import { CEREMONY_SHADERS, createCeremonyUniforms } from "./shaders";
import {
  ashBedGeometry,
  buildMatrices,
  candelabraGeometry,
  candleGeometry,
  chairGeometry,
  conservatoryColumnGeometry,
  conservatoryFloorGeometry,
  emberGeometry,
  flameGeometry,
  getEnvMap,
  getReceptionMaterials,
  getWeddingMaterials,
  glassPaneGeometry,
  havanKundGeometry,
  kundRimBandGeometry,
  mullionGeometry,
  pillarCollarGeometry,
  pillarShaftGeometry,
  plateGeometry,
  plinthGeometry,
  tableApronGeometry,
  tableLegGeometry,
  tableTopGeometry,
  type Placement,
} from "./proceduralAssets";

// -----------------------------------------------------------------------------
// Instancing
// -----------------------------------------------------------------------------

interface InstancedPartProps {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly placements: readonly Placement[];
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/**
 * Repeated furniture (pillars, chairs, rafters) drawn as a single
 * `InstancedMesh` — one draw call, and one node for `applyWorldFade` to walk
 * instead of N.
 *
 * `dispose={null}` protects the shared geometry and material owned by
 * `proceduralAssets`; `InstancedMesh` does hold its own GPU instance buffer, so
 * that one resource is released by hand on unmount.
 */
function InstancedPart({
  geometry,
  material,
  placements,
  castShadow = true,
  receiveShadow = true,
}: InstancedPartProps): JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrices = useMemo(() => buildMatrices(placements), [placements]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);

  // Captured at mount: React detaches refs before effect cleanup runs.
  useEffect(() => {
    const mesh = ref.current;
    return () => mesh?.dispose();
  }, []);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, placements.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      userData={{ castsShadow: castShadow }}
      dispose={null}
    />
  );
}

/** A single mesh over a cached geometry/material pair. */
function Part({
  geometry,
  material,
  position,
  rotation,
  scale,
  castShadow = true,
  receiveShadow = true,
  renderOrder,
}: {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly renderOrder?: number;
}): JSX.Element {
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position as [number, number, number] | undefined}
      rotation={rotation as [number, number, number] | undefined}
      scale={scale as [number, number, number] | undefined}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      renderOrder={renderOrder}
      userData={{ castsShadow: castShadow }}
      dispose={null}
    />
  );
}

// -----------------------------------------------------------------------------
// Reusable beaten-gold material (own uniforms per instance)
// -----------------------------------------------------------------------------

function GoldMaterial({ chapter }: { chapter: ChapterConfig }): JSX.Element {
  const ref = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    const u = createCeremonyUniforms();
    const c = (hex: string): [number, number, number] => {
      const col = new THREE.Color(hex);
      return [col.r, col.g, col.b];
    };
    u.uPrimary.value = c(chapter.palette.primary);
    u.uSecondary.value = c(chapter.palette.secondary);
    u.uEmissive.value = c(chapter.palette.emissive);
    const lc = new THREE.Color().setRGB(
      ...kelvinToRGB(chapter.lighting.temperatureK),
    );
    u.uLightColor.value = [lc.r, lc.g, lc.b];
    const kd = chapter.lighting.keyDirection;
    const len = Math.hypot(kd[0], kd[1], kd[2]) || 1;
    u.uLightDir.value = [kd[0] / len, kd[1] / len, kd[2] / len];
    return u;
  }, [chapter]);

  useFrame((_state, delta) => {
    if (ref.current) {
      (ref.current.uniforms.uTime as { value: number }).value += delta;
    }
  });

  const program = CEREMONY_SHADERS.goldLeaf;
  return (
    <shaderMaterial
      ref={ref}
      vertexShader={program.vertexShader}
      fragmentShader={program.fragmentShader}
      uniforms={uniforms as unknown as { [name: string]: THREE.IUniform }}
      transparent
    />
  );
}

/** Shared props for every world. */
interface WorldProps {
  readonly chapter: ChapterConfig;
}

// -----------------------------------------------------------------------------
// 1 — Proposal: minimalist glasshouse frame
// -----------------------------------------------------------------------------

function GlasshouseWorld({ chapter }: WorldProps): JSX.Element {
  const { primary, secondary } = chapter.palette;
  const w = 1.6;
  const h = 1.3;
  const d = 1.4;
  const mullion = secondary; // slender frame colour
  const bar = 0.05;

  // Twelve edges of the box as thin beams.
  const edges: Array<{ pos: [number, number, number]; size: [number, number, number] }> = [
    // verticals
    { pos: [-w, 0, -d], size: [bar, h * 2, bar] },
    { pos: [w, 0, -d], size: [bar, h * 2, bar] },
    { pos: [-w, 0, d], size: [bar, h * 2, bar] },
    { pos: [w, 0, d], size: [bar, h * 2, bar] },
    // top rails
    { pos: [0, h, -d], size: [w * 2, bar, bar] },
    { pos: [0, h, d], size: [w * 2, bar, bar] },
    { pos: [-w, h, 0], size: [bar, bar, d * 2] },
    { pos: [w, h, 0], size: [bar, bar, d * 2] },
    // bottom rails
    { pos: [0, -h, -d], size: [w * 2, bar, bar] },
    { pos: [0, -h, d], size: [w * 2, bar, bar] },
    { pos: [-w, -h, 0], size: [bar, bar, d * 2] },
    { pos: [w, -h, 0], size: [bar, bar, d * 2] },
  ];

  return (
    <group position={[0, 1.4, 0]}>
      {/* Glass skin */}
      <mesh>
        <boxGeometry args={[w * 2, h * 2, d * 2]} />
        <meshStandardMaterial
          color={primary}
          transparent
          opacity={0.14}
          roughness={0.05}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Pitched glass roof */}
      <mesh position={[0, h + 0.45, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[w * 1.5, 0.9, 4]} />
        <meshStandardMaterial
          color={primary}
          transparent
          opacity={0.16}
          roughness={0.05}
        />
      </mesh>
      {/* Frame */}
      {edges.map((e, i) => (
        <mesh key={i} position={e.pos}>
          <boxGeometry args={e.size} />
          <meshStandardMaterial
            color={mullion}
            transparent
            metalness={0.7}
            roughness={0.35}
          />
        </mesh>
      ))}
      {/* The proposal ring — a floating gold torus */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.42, 0.07, 20, 48]} />
        <GoldMaterial chapter={chapter} />
      </mesh>
    </group>
  );
}

// -----------------------------------------------------------------------------
// 2 — Engagement: geometric sandstone stepwell
// -----------------------------------------------------------------------------

function StepwellWorld({ chapter }: WorldProps): JSX.Element {
  const { primary, secondary } = chapter.palette;
  const levels = 5;

  return (
    <group position={[0, 0.4, 0]}>
      {Array.from({ length: levels }).map((_, i) => {
        const t = i / (levels - 1);
        const size = 3.4 - t * 2.6; // narrows as it descends
        const y = -t * 1.8;
        return (
          <mesh key={i} position={[0, y, 0]}>
            <boxGeometry args={[size, 0.28, size]} />
            <meshStandardMaterial
              color={primary}
              transparent
              roughness={0.9}
              metalness={0.05}
            />
          </mesh>
        );
      })}
      {/* Central pedestal at the base of the well */}
      <mesh position={[0, -1.55, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <GoldMaterial chapter={chapter} />
      </mesh>
      {/* Corner lamps */}
      {[
        [-1.5, 0, -1.5],
        [1.5, 0, -1.5],
        [-1.5, 0, 1.5],
        [1.5, 0, 1.5],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], 0.4, p[2]]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial
            color={secondary}
            emissive={chapter.palette.emissive}
            emissiveIntensity={1.4}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}

// -----------------------------------------------------------------------------
// 3 — Mehendi: low-poly banyan canopy + floating swing
// -----------------------------------------------------------------------------

function BanyanWorld({ chapter }: WorldProps): JSX.Element {
  const { primary, secondary, emissive } = chapter.palette;
  const swingRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_state, delta) => {
    t.current += delta;
    if (swingRef.current) {
      swingRef.current.rotation.x = Math.sin(t.current * 1.1) * 0.18;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Trunk */}
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.28, 0.42, 2.0, 7]} />
        <meshStandardMaterial color={secondary} roughness={0.9} transparent />
      </mesh>
      {/* Canopy — flattened low-poly dome */}
      <mesh position={[0, 2.5, 0]} scale={[1, 0.6, 1]}>
        <icosahedronGeometry args={[1.7, 1]} />
        <meshStandardMaterial
          color={primary}
          flatShading
          roughness={0.85}
          transparent
        />
      </mesh>
      {/* Hanging aerial roots */}
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        const r = 1.2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, 1.6, Math.sin(a) * r]}
          >
            <cylinderGeometry args={[0.03, 0.03, 1.2, 5]} />
            <meshStandardMaterial color={secondary} roughness={0.9} transparent />
          </mesh>
        );
      })}
      {/* Floating swing */}
      <group ref={swingRef} position={[1.7, 2.4, 0]}>
        <mesh position={[-0.4, -0.6, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 1.2, 5]} />
          <meshStandardMaterial color={emissive} roughness={0.6} transparent />
        </mesh>
        <mesh position={[0.4, -0.6, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 1.2, 5]} />
          <meshStandardMaterial color={emissive} roughness={0.6} transparent />
        </mesh>
        <mesh position={[0, -1.2, 0]}>
          <boxGeometry args={[1.0, 0.08, 0.35]} />
          <meshStandardMaterial color={secondary} roughness={0.7} transparent />
        </mesh>
      </group>
      {/* Lantern glow */}
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2 + 0.5;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.5, 2.1, Math.sin(a) * 1.5]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={2.0}
              transparent
            />
          </mesh>
        );
      })}
    </group>
  );
}

// -----------------------------------------------------------------------------
// 4 — Sangeet: dark multi-faceted amphitheatre stage
// -----------------------------------------------------------------------------

function AmphitheaterWorld({ chapter }: WorldProps): JSX.Element {
  const { primary, secondary, emissive } = chapter.palette;
  const tiers = 4;

  return (
    <group position={[0, 0, 0]}>
      {/* Faceted stage platform */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[1.6, 1.8, 0.3, 8]} />
        <meshStandardMaterial
          color={primary}
          flatShading
          metalness={0.4}
          roughness={0.5}
          transparent
        />
      </mesh>
      {/* Rising faceted seating tiers */}
      {Array.from({ length: tiers }).map((_, i) => {
        const r = 2.4 + i * 0.7;
        const y = 0.3 + i * 0.35;
        return (
          <mesh key={i} position={[0, y, 0]}>
            <cylinderGeometry args={[r, r, 0.25, 8, 1, true]} />
            <meshStandardMaterial
              color={primary}
              flatShading
              metalness={0.3}
              roughness={0.7}
              side={THREE.DoubleSide}
              transparent
            />
          </mesh>
        );
      })}
      {/* Stage-edge crimson footlights */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 1.7, 0.32, Math.sin(a) * 1.7]}
          >
            <boxGeometry args={[0.16, 0.1, 0.16]} />
            <meshStandardMaterial
              color={secondary}
              emissive={emissive}
              emissiveIntensity={1.8}
              transparent
            />
          </mesh>
        );
      })}
    </group>
  );
}

// -----------------------------------------------------------------------------
// 5 — Wedding: heavy bronze havan kund on sandstone pillars
// -----------------------------------------------------------------------------

/** Corner footprint of the four pillars carrying the kund. */
const KUND_PILLARS: readonly Placement[] = [
  { position: [-0.9, 0.59, -0.9] },
  { position: [0.9, 0.59, -0.9] },
  { position: [-0.9, 0.59, 0.9] },
  { position: [0.9, 0.59, 0.9] },
];

/** Bronze collars capping each pillar top and bottom. */
const KUND_COLLARS: readonly Placement[] = [
  { position: [-0.9, 0.23, -0.9] },
  { position: [0.9, 0.23, -0.9] },
  { position: [-0.9, 0.23, 0.9] },
  { position: [0.9, 0.23, 0.9] },
  { position: [-0.9, 0.95, -0.9] },
  { position: [0.9, 0.95, -0.9] },
  { position: [-0.9, 0.95, 0.9] },
  { position: [0.9, 0.95, 0.9] },
];

/** Embers strewn across the ash bed. Hand-placed so the scatter reads evenly. */
const KUND_EMBERS: readonly Placement[] = [
  { position: [0.16, 1.07, 0.09], scale: 1.0 },
  { position: [-0.2, 1.06, 0.17], scale: 0.75 },
  { position: [0.05, 1.08, -0.21], scale: 1.15 },
  { position: [-0.13, 1.06, -0.1], scale: 0.65 },
  { position: [0.27, 1.06, -0.06], scale: 0.85 },
  { position: [-0.28, 1.07, -0.24], scale: 0.95 },
  { position: [0.11, 1.06, 0.28], scale: 0.7 },
];

/** Offset, scale and beat rate of each of the three flame bodies. */
const KUND_FLAMES = [
  { x: -0.17, z: 0.04, scale: 0.62, rate: 5.4, phase: 0.0 },
  { x: 0.0, z: -0.03, scale: 0.86, rate: 6.7, phase: 1.7 },
  { x: 0.16, z: 0.05, scale: 0.55, rate: 7.9, phase: 3.1 },
] as const;

function HavanKundWorld({ chapter }: WorldProps): JSX.Element {
  const renderer = useThree((state) => state.gl);
  const env = useMemo(() => getEnvMap(renderer, "warm"), [renderer]);
  const materials = useMemo(() => getWeddingMaterials(chapter, env), [chapter, env]);

  const flameRefs = useRef<(THREE.Group | null)[]>([]);
  const clock = useRef(0);

  // Each flame breathes on its own rate and phase, so the fire never pulses as
  // one block. Vertical scale only — the base stays anchored in the ash.
  useFrame((_state, delta) => {
    clock.current += delta;
    for (let i = 0; i < KUND_FLAMES.length; i++) {
      const group = flameRefs.current[i];
      if (!group) continue;
      const flame = KUND_FLAMES[i];
      const beat = Math.sin(clock.current * flame.rate + flame.phase);
      const flicker = Math.sin(clock.current * flame.rate * 2.7 + flame.phase) * 0.06;
      group.scale.set(
        flame.scale * (1 + flicker * 0.5),
        flame.scale * (0.86 + Math.abs(beat) * 0.32 + flicker),
        flame.scale * (1 + flicker * 0.5),
      );
      group.rotation.y = beat * 0.12;
    }
  });

  return (
    <group>
      {/* Sandstone plinth — the only surface that reads the key light broadly,
          so it carries most of the contact shadow. */}
      <Part geometry={plinthGeometry()} material={materials.sandstone} position={[0, 0.09, 0]} />

      {/* Four chamfered pillars with turned bronze collars top and bottom. */}
      <InstancedPart
        geometry={pillarShaftGeometry()}
        material={materials.sandstone}
        placements={KUND_PILLARS}
      />
      <InstancedPart
        geometry={pillarCollarGeometry()}
        material={materials.bronze}
        placements={KUND_COLLARS}
      />

      {/* The kund: three bevelled square tiers widening upward, merged to one
          draw call, in hammered bronze. */}
      <Part geometry={havanKundGeometry()} material={materials.bronze} position={[0, 1.08, 0]} />

      {/* Beaten-gold band capping the top rim — carries the gold motif. */}
      <mesh
        geometry={kundRimBandGeometry()}
        position={[0, 1.517, 0]}
        castShadow
        receiveShadow
        userData={{ castsShadow: true }}
        dispose={null}
      >
        <GoldMaterial chapter={chapter} />
      </mesh>

      {/* Ash bed and mound sunk into the aperture. */}
      <Part
        geometry={ashBedGeometry()}
        material={materials.ash}
        position={[0, 1.03, 0]}
        castShadow={false}
      />
      <InstancedPart
        geometry={emberGeometry()}
        material={materials.ember}
        placements={KUND_EMBERS}
        castShadow={false}
      />

      {/* Sacred fire — lathed teardrops rather than cones. */}
      {KUND_FLAMES.map((flame, i) => (
        <group
          key={i}
          ref={(node) => {
            flameRefs.current[i] = node;
          }}
          position={[flame.x, 1.1, flame.z]}
        >
          <mesh
            geometry={flameGeometry()}
            material={materials.flame}
            castShadow={false}
            receiveShadow={false}
            renderOrder={2}
            userData={{ castsShadow: false }}
            dispose={null}
          />
        </group>
      ))}
    </group>
  );
}

// -----------------------------------------------------------------------------
// 6 — Reception: expansive conservatory dining glass layout
// -----------------------------------------------------------------------------

// Gable geometry: eaves sit on the column capitals, the ridge rides above the
// centreline. Every roof member derives its tilt from this one angle.
const EAVE_Y = 2.22;
const EAVE_Z = 1.85;
const RIDGE_Y = 2.62;
const ROOF_RUN = Math.hypot(EAVE_Z, RIDGE_Y - EAVE_Y);
const ROOF_PITCH = Math.atan2(RIDGE_Y - EAVE_Y, EAVE_Z);
const ROOF_MID_Y = (EAVE_Y + RIDGE_Y) / 2;
/** Ridge length — the column span plus a little overhang at each gable end. */
const RIDGE_SPAN = 5.6;

const CONSERVATORY_COLUMNS: readonly Placement[] = [
  { position: [-2.6, 0, -1.4] },
  { position: [2.6, 0, -1.4] },
  { position: [-2.6, 0, 1.4] },
  { position: [2.6, 0, 1.4] },
];

/** Rafters running ridge → eave on both slopes. */
const CONSERVATORY_RAFTERS: readonly Placement[] = [-2.4, -1.2, 0, 1.2, 2.4].flatMap(
  (x): Placement[] => [
    {
      position: [x, ROOF_MID_Y, EAVE_Z / 2],
      rotation: [ROOF_PITCH, 0, 0],
      scale: [1, 1, ROOF_RUN],
    },
    {
      position: [x, ROOF_MID_Y, -EAVE_Z / 2],
      rotation: [Math.PI - ROOF_PITCH, 0, 0],
      scale: [1, 1, ROOF_RUN],
    },
  ],
);

const TABLE_LEGS: readonly Placement[] = [
  { position: [-1.95, 0, -0.42] },
  { position: [1.95, 0, -0.42] },
  { position: [-1.95, 0, 0.42] },
  { position: [1.95, 0, 0.42] },
];

const SEAT_X = [-1.5, -0.5, 0.5, 1.5] as const;

/** Eight chairs, each turned to face the table. */
const CONSERVATORY_CHAIRS: readonly Placement[] = SEAT_X.flatMap((x): Placement[] => [
  { position: [x, 0, -0.95] },
  { position: [x, 0, 0.95], rotation: [0, Math.PI, 0] },
]);

/** A place setting opposite every chair. */
const CONSERVATORY_PLATES: readonly Placement[] = SEAT_X.flatMap((x): Placement[] => [
  { position: [x, 0.748, -0.36] },
  { position: [x, 0.748, 0.36] },
]);

const CANDELABRA_X = [-1.3, 0, 1.3] as const;

const CONSERVATORY_CANDELABRA: readonly Placement[] = CANDELABRA_X.map((x) => ({
  position: [x, 0.748, 0] as const,
}));

const CONSERVATORY_CANDLES: readonly Placement[] = CANDELABRA_X.map((x) => ({
  position: [x, 1.26, 0] as const,
}));

function ConservatoryWorld({ chapter }: WorldProps): JSX.Element {
  const renderer = useThree((state) => state.gl);
  const env = useMemo(() => getEnvMap(renderer, "daylight"), [renderer]);
  const materials = useMemo(() => getReceptionMaterials(chapter, env), [chapter, env]);

  const flameRefs = useRef<(THREE.Group | null)[]>([]);
  const clock = useRef(0);

  useFrame((_state, delta) => {
    clock.current += delta;
    for (let i = 0; i < CANDELABRA_X.length; i++) {
      const group = flameRefs.current[i];
      if (!group) continue;
      // Table candles are sheltered, so the motion is far subtler than the
      // open fire in the wedding chapter.
      const beat = Math.sin(clock.current * (4.1 + i * 0.7) + i * 2.2);
      const flicker = Math.sin(clock.current * (9.3 + i) + i) * 0.04;
      group.scale.set(
        0.13 * (1 + flicker),
        0.13 * (0.94 + Math.abs(beat) * 0.12 + flicker),
        0.13 * (1 + flicker),
      );
    }
  });

  return (
    <group>
      {/* Polished floor plate — the primary shadow catcher. */}
      <Part
        geometry={conservatoryFloorGeometry()}
        material={materials.stone}
        position={[0, -0.045, 0]}
        castShadow={false}
      />

      {/* Four turned columns carrying the gable. */}
      <InstancedPart
        geometry={conservatoryColumnGeometry()}
        material={materials.gold}
        placements={CONSERVATORY_COLUMNS}
      />

      {/* Ridge beam and rafters. The shared 1-unit bar is turned onto the X
          axis and stretched to span the full gable. */}
      <Part
        geometry={mullionGeometry()}
        material={materials.gold}
        position={[0, RIDGE_Y, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[1, 1, RIDGE_SPAN]}
      />
      <InstancedPart
        geometry={mullionGeometry()}
        material={materials.gold}
        placements={CONSERVATORY_RAFTERS}
      />

      {/* Glazing. Kept out of the shadow pass — an opaque shadow from clear
          glass is worse than no shadow at all. */}
      <Part
        geometry={glassPaneGeometry()}
        material={materials.glass}
        position={[0, ROOF_MID_Y, EAVE_Z / 2]}
        rotation={[ROOF_PITCH, 0, 0]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={3}
      />
      <Part
        geometry={glassPaneGeometry()}
        material={materials.glass}
        position={[0, ROOF_MID_Y, -EAVE_Z / 2]}
        rotation={[Math.PI - ROOF_PITCH, 0, 0]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={3}
      />

      {/* Dining table: glass top on a gold apron and four turned legs. */}
      <InstancedPart
        geometry={tableLegGeometry()}
        material={materials.gold}
        placements={TABLE_LEGS}
      />
      <Part
        geometry={tableApronGeometry()}
        material={materials.gold}
        position={[0, 0.66, 0]}
      />
      <Part
        geometry={tableTopGeometry()}
        material={materials.glass}
        position={[0, 0.72, 0]}
        castShadow={false}
        receiveShadow={false}
        renderOrder={2}
      />

      {/* Eight chairs, one draw call. */}
      <InstancedPart
        geometry={chairGeometry()}
        material={materials.gold}
        placements={CONSERVATORY_CHAIRS}
      />

      {/* Place settings. */}
      <InstancedPart
        geometry={plateGeometry()}
        material={materials.porcelain}
        placements={CONSERVATORY_PLATES}
        castShadow={false}
      />

      {/* Turned candelabra and their candles. */}
      <InstancedPart
        geometry={candelabraGeometry()}
        material={materials.gold}
        placements={CONSERVATORY_CANDELABRA}
      />
      <InstancedPart
        geometry={candleGeometry()}
        material={materials.wax}
        placements={CONSERVATORY_CANDLES}
      />

      {CANDELABRA_X.map((x, i) => (
        <group
          key={x}
          ref={(node) => {
            flameRefs.current[i] = node;
          }}
          position={[x, 1.484, 0]}
        >
          <mesh
            geometry={flameGeometry()}
            material={materials.flame}
            castShadow={false}
            receiveShadow={false}
            renderOrder={4}
            userData={{ castsShadow: false }}
            dispose={null}
          />
        </group>
      ))}
    </group>
  );
}

// -----------------------------------------------------------------------------
// 7 — Legacy: intimate estate library hearth
// -----------------------------------------------------------------------------

function LibraryHearthWorld({ chapter }: WorldProps): JSX.Element {
  const { primary, secondary, emissive } = chapter.palette;
  const fireRef = useRef<THREE.Mesh>(null);
  const t = useRef(0);

  useFrame((_state, delta) => {
    t.current += delta;
    if (fireRef.current) {
      const mat = fireRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity =
        1.8 + Math.sin(t.current * 7.0) * 0.5 + Math.sin(t.current * 13.0) * 0.3;
    }
  });

  const bookColors = [secondary, primary, chapter.palette.emissive, "#4A5568"];

  return (
    <group position={[0, 0, 0]}>
      {/* Back wall */}
      <mesh position={[0, 1.2, -1.0]}>
        <boxGeometry args={[4.0, 2.4, 0.2]} />
        <meshStandardMaterial color={primary} roughness={0.85} transparent opacity={0.9} />
      </mesh>
      {/* Fireplace surround */}
      <mesh position={[0, 0.7, -0.85]}>
        <boxGeometry args={[1.6, 1.4, 0.3]} />
        <meshStandardMaterial color={secondary} roughness={0.6} transparent />
      </mesh>
      {/* Hearth opening (dark) */}
      <mesh position={[0, 0.55, -0.75]}>
        <boxGeometry args={[1.0, 0.9, 0.25]} />
        <meshStandardMaterial color={chapter.palette.background} transparent />
      </mesh>
      {/* Mantel */}
      <mesh position={[0, 1.5, -0.8]}>
        <boxGeometry args={[2.0, 0.16, 0.5]} />
        <GoldMaterial chapter={chapter} />
      </mesh>
      {/* Fire */}
      <mesh ref={fireRef} position={[0, 0.45, -0.72]}>
        <coneGeometry args={[0.3, 0.7, 6]} />
        <meshStandardMaterial
          color={emissive}
          emissive={emissive}
          emissiveIntensity={2.0}
          transparent
          opacity={0.92}
        />
      </mesh>
      {/* Bookshelves flanking */}
      {[-1.5, 1.5].map((x) => (
        <group key={x} position={[x, 1.0, -0.9]}>
          <mesh>
            <boxGeometry args={[0.7, 2.0, 0.3]} />
            <meshStandardMaterial color={secondary} roughness={0.8} transparent />
          </mesh>
          {Array.from({ length: 5 }).map((_, r) => (
            <mesh key={r} position={[0, -0.8 + r * 0.4, 0.08]}>
              <boxGeometry args={[0.6, 0.28, 0.18]} />
              <meshStandardMaterial
                color={bookColors[r % bookColors.length]}
                roughness={0.9}
                transparent
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

const WORLD_BY_ID: Record<ChapterId, (props: WorldProps) => JSX.Element> = {
  proposal: GlasshouseWorld,
  engagement: StepwellWorld,
  mehendi: BanyanWorld,
  sangeet: AmphitheaterWorld,
  wedding: HavanKundWorld,
  reception: ConservatoryWorld,
  legacy: LibraryHearthWorld,
};

/** Renders the structural world for a given chapter. */
export function ChapterWorld({ chapter }: WorldProps): JSX.Element {
  const World = WORLD_BY_ID[chapter.id];
  return <World chapter={chapter} />;
}

// -----------------------------------------------------------------------------
// Fade helper — applied by the parent each frame to cross-fade whole worlds
// -----------------------------------------------------------------------------

/**
 * Set the opacity of every material under `root` to `o`. Handles standard
 * materials (`.opacity`) and ceremony shader materials (`uOpacity` uniform),
 * including multi-material meshes. Marks everything transparent so the fade is
 * visible.
 *
 * A material may declare `userData.baseOpacity` to opt into being *partly*
 * transparent at full world presence — glass, flames. The world fade is then a
 * multiplier over that base rather than an absolute overwrite, which is what
 * lets the conservatory glazing stay glazing once a transition settles.
 * Materials that declare nothing default to a base of `1` and behave exactly as
 * they did before.
 *
 * Meshes tagged `userData.castsShadow` also drop out of the shadow pass once
 * they fade past the halfway point: both the incoming and outgoing world are
 * mounted mid-transition, and two overlapping sets of shadow casters read as
 * mud.
 */
export function applyWorldFade(root: THREE.Object3D, o: number): void {
  const dominant = o > 0.5;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;

    if (obj.userData.castsShadow === true) obj.castShadow = dominant;

    const material = mesh.material;
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const m of mats) {
      const base = typeof m.userData?.baseOpacity === "number" ? m.userData.baseOpacity : 1;
      const resolved = o * base;

      const shader = m as THREE.ShaderMaterial;
      if (shader.uniforms && shader.uniforms.uOpacity) {
        shader.uniforms.uOpacity.value = resolved;
      } else {
        (m as THREE.Material).opacity = resolved;
      }
      m.transparent = true;
      // Only fully-opaque-by-design surfaces write depth; anything with a
      // fractional base must keep depth writes off to sort correctly.
      m.depthWrite = o > 0.98 && base > 0.98;
    }
  });
}
