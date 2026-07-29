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
import {
  CEREMONY_SHADERS,
  createCeremonyUniforms,
  createCrystalUniforms,
  createFlowerUniforms,
  createLeafUniforms,
  createMossUniforms,
  createShaftUniforms,
  createSilkUniforms,
  type CeremonyUniforms,
  type GladeRingUniforms,
  type LeafUniforms,
  type SilkUniforms,
} from "./shaders";
import {
  ashBedGeometry,
  banyanAerialRootGeometry,
  banyanCanopyShellGeometry,
  banyanPropRootGeometry,
  banyanTrunkGeometry,
  bellflowerGeometry,
  bolsterGeometry,
  brazierGeometry,
  buildMatrices,
  candelabraGeometry,
  candleGeometry,
  chairGeometry,
  conservatoryColumnGeometry,
  conservatoryFloorGeometry,
  courtyardGeometry,
  daybedCanopyTopGeometry,
  daybedFrameGeometry,
  daybedMattressGeometry,
  daybedPostGeometry,
  drapePanelGeometry,
  drapeValanceGeometry,
  emberGeometry,
  fairyLanternGeometry,
  flameGeometry,
  gladeArchGeometry,
  gladeFloorGeometry,
  gladeGroundHeight,
  gladePostGeometry,
  getEnvMap,
  getProposalMaterials,
  getMehendiMaterials,
  getReceptionMaterials,
  getWeddingMaterials,
  glassPaneGeometry,
  havanKundGeometry,
  kundRimBandGeometry,
  lanternCoreGeometry,
  lanternGeometry,
  lanternGlowGeometry,
  lightShaftGeometry,
  mossTuftGeometry,
  mullionGeometry,
  pillarCollarGeometry,
  pillarShaftGeometry,
  plateGeometry,
  plinthGeometry,
  scatterOnGround,
  starflowerGeometry,
  toadstoolGeometry,
  tableApronGeometry,
  tableLegGeometry,
  tableTopGeometry,
  BANYAN_CANOPY_HALF_HEIGHT,
  BANYAN_CANOPY_RADIUS,
  BANYAN_SHELL_COUNT,
  GLADE_POST_HEIGHT,
  GLADE_RADIUS,
  GLADE_RING_COUNT,
  GLADE_RING_RADIUS,
  DAYBED_HALF_X,
  DAYBED_HALF_Z,
  DAYBED_RAIL_Y,
  DRAPE_HEIGHT,
  type KeepOut,
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
// Shader material plumbing
// -----------------------------------------------------------------------------

/** A hex colour as the linear RGB triple the ceremony uniform block expects. */
function rgb(hex: string): [number, number, number] {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
}

/**
 * Bind a chapter's palette and key light into the shared ceremony uniform
 * block. Every ceremony shader reads these names, so this is the one place a
 * chapter's look reaches the custom materials.
 */
function applyChapterUniforms(u: CeremonyUniforms, chapter: ChapterConfig): void {
  u.uPrimary.value = rgb(chapter.palette.primary);
  u.uSecondary.value = rgb(chapter.palette.secondary);
  u.uEmissive.value = rgb(chapter.palette.emissive);

  const light = new THREE.Color().setRGB(
    ...kelvinToRGB(chapter.lighting.temperatureK),
  );
  u.uLightColor.value = [light.r, light.g, light.b];

  const kd = chapter.lighting.keyDirection;
  const len = Math.hypot(kd[0], kd[1], kd[2]) || 1;
  u.uLightDir.value = [kd[0] / len, kd[1] / len, kd[2] / len];
}

/** Three.js wants an index signature; our uniform sets are typed structs. */
function asUniformMap(u: CeremonyUniforms): { [name: string]: THREE.IUniform } {
  return u as unknown as { [name: string]: THREE.IUniform };
}

// -----------------------------------------------------------------------------
// Reusable beaten-gold material (own uniforms per instance)
// -----------------------------------------------------------------------------

function GoldMaterial({ chapter }: { chapter: ChapterConfig }): JSX.Element {
  const ref = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    const u = createCeremonyUniforms();
    applyChapterUniforms(u, chapter);
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
      uniforms={asUniformMap(uniforms)}
      transparent
    />
  );
}

/** Shared props for every world. */
interface WorldProps {
  readonly chapter: ChapterConfig;
}

// -----------------------------------------------------------------------------
// 1 — Proposal: an enchanted twilight glade ringed with crystal lanterns
// -----------------------------------------------------------------------------

/** Lantern head height above the ground plane — the post top plus the crystal. */
const GLADE_LANTERN_Y = GLADE_POST_HEIGHT + 0.28;
/** Height the single lantern at the centre of the ring floats at. */
const GLADE_CENTRE_Y = 2.1;
/** Radius of the classic toadstool ring, set inside the lanterns. */
const TOADSTOOL_RING_RADIUS = 1.55;

const GLADE_SECTOR = (Math.PI * 2) / GLADE_RING_COUNT;

/** Where each post stands. Uniform by design — see `gladeArchGeometry`. */
const GLADE_RING_SLOTS = Array.from({ length: GLADE_RING_COUNT }, (_, i) => {
  const angle = i * GLADE_SECTOR;
  return {
    angle,
    x: Math.cos(angle) * GLADE_RING_RADIUS,
    z: Math.sin(angle) * GLADE_RING_RADIUS,
  };
});

const GLADE_POSTS: readonly Placement[] = GLADE_RING_SLOTS.map(({ x, z, angle }) => ({
  position: [x, 0, z] as const,
  // Turning each post hides the fact that they share one roughened buffer.
  rotation: [0, angle * 2.7, 0] as const,
}));

const GLADE_ARCHES: readonly Placement[] = GLADE_RING_SLOTS.map(({ angle }) => ({
  position: [0, 0, 0] as const,
  rotation: [0, angle, 0] as const,
}));

/** Crystals vary in size and turn, so a single instanced draw call still reads
 *  as eight individually grown stones. */
const GLADE_CRYSTALS: readonly Placement[] = GLADE_RING_SLOTS.map(
  ({ x, z, angle }, i) => ({
    position: [x, GLADE_POST_HEIGHT - 0.06, z] as const,
    rotation: [0, angle * 3.1 + i, 0] as const,
    scale: 0.86 + ((i * 5) % 4) * 0.11,
  }),
);

const GLADE_CORES: readonly Placement[] = GLADE_RING_SLOTS.map(({ x, z }) => ({
  position: [x, GLADE_LANTERN_Y - 0.06, z] as const,
}));

/**
 * One light shaft per lantern. The shared cone is a unit tall, so scaling Y by
 * the drop and centring it puts the apex at the crystal and the mouth just
 * under the moss.
 */
const GLADE_SHAFT_TOP = GLADE_LANTERN_Y - 0.1;
const GLADE_SHAFT_BOTTOM = -0.15;
const GLADE_SHAFT_HEIGHT = GLADE_SHAFT_TOP - GLADE_SHAFT_BOTTOM;

const GLADE_SHAFTS: readonly Placement[] = GLADE_RING_SLOTS.map(({ x, z }) => ({
  position: [x, (GLADE_SHAFT_TOP + GLADE_SHAFT_BOTTOM) / 2, z] as const,
  scale: [1, GLADE_SHAFT_HEIGHT, 1] as const,
}));

/** Footings the flora has to keep clear of. */
const GLADE_KEEP_OUT: readonly KeepOut[] = GLADE_RING_SLOTS.map(({ x, z }) => ({
  x,
  z,
  radius: 0.2,
}));

const MOSS_TUFTS: readonly Placement[] = scatterOnGround({
  count: 620,
  innerRadius: 0.15,
  outerRadius: GLADE_RADIUS - 0.75,
  seed: 401,
  minScale: 0.7,
  maxScale: 1.9,
  height: gladeGroundHeight,
  keepOut: GLADE_KEEP_OUT,
  bury: 0.015,
});

const GLADE_BELLFLOWERS: readonly Placement[] = scatterOnGround({
  count: 180,
  innerRadius: 0.4,
  outerRadius: GLADE_RADIUS - 1.1,
  seed: 419,
  minScale: 0.34,
  maxScale: 0.62,
  height: gladeGroundHeight,
  keepOut: GLADE_KEEP_OUT,
  bury: 0.02,
});

const GLADE_STARFLOWERS: readonly Placement[] = scatterOnGround({
  count: 240,
  innerRadius: 0.3,
  outerRadius: GLADE_RADIUS - 1.0,
  seed: 433,
  minScale: 0.36,
  maxScale: 0.7,
  height: gladeGroundHeight,
  keepOut: GLADE_KEEP_OUT,
  bury: 0.02,
});

/**
 * Toadstools: a true ring of them — the folk sign of a fairy circle — plus a
 * looser scatter so the ring reads as found rather than planted.
 */
const GLADE_TOADSTOOLS: readonly Placement[] = [
  ...Array.from({ length: 22 }, (_, i) => {
    const angle = (i / 22) * Math.PI * 2 + 0.17;
    // Wobble the radius so the circle is organic, not surveyed.
    const r = TOADSTOOL_RING_RADIUS + Math.sin(i * 2.7) * 0.16;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    return {
      position: [x, gladeGroundHeight(x, z) - 0.01, z] as const,
      rotation: [0, i * 1.9, 0] as const,
      scale: 0.5 + ((i * 3) % 5) * 0.09,
    };
  }),
  ...scatterOnGround({
    count: 14,
    innerRadius: 2.95,
    outerRadius: GLADE_RADIUS - 1.1,
    seed: 457,
    minScale: 0.6,
    maxScale: 1.25,
    height: gladeGroundHeight,
    keepOut: GLADE_KEEP_OUT,
    bury: 0.01,
  }),
];

/**
 * The glade's hand-authored shader materials.
 *
 * Every one of these is instancing-aware, which is what keeps a carpet of a
 * thousand-odd plants and eight volumetric shafts inside a dozen draw calls.
 */
interface GladeShaders {
  readonly moss: THREE.ShaderMaterial;
  readonly bellflower: THREE.ShaderMaterial;
  readonly starflower: THREE.ShaderMaterial;
  readonly crystal: THREE.ShaderMaterial;
  readonly shaft: THREE.ShaderMaterial;
  /** Sets taking the per-frame time tick. */
  readonly timed: readonly CeremonyUniforms[];
  /** Sets taking the lantern-ring breath. */
  readonly pulsed: readonly { uRingPulse: { value: number } }[];
}

function buildGladeShaders(chapter: ChapterConfig): GladeShaders {
  const program = (
    name: "mossCarpet" | "wildflower" | "crystalFacet" | "lightShaft",
    uniforms: CeremonyUniforms,
    extra?: Partial<THREE.ShaderMaterialParameters>,
  ): THREE.ShaderMaterial => {
    applyChapterUniforms(uniforms, chapter);

    // The shared uniform block carries the key light's *colour* but not its
    // strength. This chapter's key is deliberately starved (0.55) so the
    // lanterns can carry the scene, and a shader that ignored that would light
    // the glade like noon. Folded into the colour here rather than into
    // `applyChapterUniforms`, so the already-tuned worlds are untouched.
    const gain = chapter.lighting.keyIntensity;
    const [lr, lg, lb] = uniforms.uLightColor.value;
    uniforms.uLightColor.value = [lr * gain, lg * gain, lb * gain];

    const source = CEREMONY_SHADERS[name];
    return new THREE.ShaderMaterial({
      vertexShader: source.vertexShader,
      fragmentShader: source.fragmentShader,
      uniforms: asUniformMap(uniforms),
      transparent: true,
      ...extra,
    });
  };

  const bindRing = <T extends GladeRingUniforms>(u: T): T => {
    u.uRingRadius.value = GLADE_RING_RADIUS;
    u.uRingCount.value = GLADE_RING_COUNT;
    u.uRingHeight.value = GLADE_LANTERN_Y;
    u.uCentreHeight.value = GLADE_CENTRE_Y;
    return u;
  };

  const mossUniforms = bindRing(createMossUniforms());
  mossUniforms.uGladeRadius.value = GLADE_RADIUS;
  const bellUniforms = bindRing(createFlowerUniforms());
  const starUniforms = bindRing(createFlowerUniforms());
  const crystalUniforms = createCrystalUniforms();
  const shaftUniforms = createShaftUniforms();
  shaftUniforms.uIntensity.value = 0.72;
  shaftUniforms.uMotes.value = 0.62;

  // Two species, two tints. Pale lilac bells and a warmer cream star.
  bellUniforms.uBloom.value = [0.82, 0.68, 0.95];
  bellUniforms.uSway.value = 0.04;
  starUniforms.uBloom.value = [0.97, 0.9, 0.76];
  starUniforms.uSway.value = 0.022;
  starUniforms.uBloomGlow.value = 1.35;

  const moss = program("mossCarpet", mossUniforms);
  const bellflower = program("wildflower", bellUniforms, {
    side: THREE.DoubleSide,
  });
  const starflower = program("wildflower", starUniforms, {
    side: THREE.DoubleSide,
  });

  // Glass: never allowed to write depth, so the shafts and cores behind it
  // still come through. A base opacity under the fade helper's 0.98 threshold
  // is what pins that off permanently.
  const crystal = program("crystalFacet", crystalUniforms, {
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  crystal.userData.baseOpacity = 0.95;

  // Shafts are pure light: added to whatever is already in the buffer, never
  // occluding it.
  const shaft = program("lightShaft", shaftUniforms, {
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  shaft.userData.baseOpacity = 0.9;

  return {
    moss,
    bellflower,
    starflower,
    crystal,
    shaft,
    timed: [
      mossUniforms,
      bellUniforms,
      starUniforms,
      crystalUniforms,
      shaftUniforms,
    ],
    pulsed: [mossUniforms, bellUniforms, starUniforms, crystalUniforms, shaftUniforms],
  };
}

const gladeShaderCache = new Map<ChapterId, GladeShaders>();

/** Cached per chapter and never disposed — see {@link getMehendiShaders}. */
function getGladeShaders(chapter: ChapterConfig): GladeShaders {
  let set = gladeShaderCache.get(chapter.id);
  if (!set) {
    set = buildGladeShaders(chapter);
    gladeShaderCache.set(chapter.id, set);
  }
  return set;
}

function ProposalWorld({ chapter }: WorldProps): JSX.Element {
  const renderer = useThree((state) => state.gl);
  const env = useMemo(() => getEnvMap(renderer, "daylight"), [renderer]);
  const materials = useMemo(() => getProposalMaterials(chapter, env), [chapter, env]);
  const shaders = useMemo(() => getGladeShaders(chapter), [chapter]);

  const centreRef = useRef<THREE.Group>(null);
  const ringLightRef = useRef<THREE.PointLight>(null);
  const clock = useRef(0);

  useFrame((_state, delta) => {
    clock.current += delta;
    const t = clock.current;

    const live = getGladeShaders(chapter);
    const surfaces = getProposalMaterials(chapter, env);

    // The ring breathes slowly and together; individual lanterns take their own
    // phase from their instance seed inside the crystal shader.
    const pulse = 0.86 + Math.sin(t * 0.9) * 0.1 + Math.sin(t * 1.7 + 1.1) * 0.05;

    for (const uniforms of live.timed) uniforms.uTime.value = t;
    for (const uniforms of live.pulsed) uniforms.uRingPulse.value = pulse;

    // The fade helper writes uOpacity every frame, so this is a free read of
    // the world's presence — and the point light has to be scaled by it by
    // hand, since the helper only walks materials.
    const presence = live.timed[0].uOpacity.value;

    if (ringLightRef.current) {
      ringLightRef.current.intensity = 7.5 * pulse * presence;
    }
    surfaces.core.emissiveIntensity = 3.2 + pulse * 1.6;
    surfaces.toadstool.emissiveIntensity = 0.3 + pulse * 0.35;

    // The centre lantern drifts, so the glade never feels quite still.
    const centre = centreRef.current;
    if (centre) {
      centre.position.y = GLADE_CENTRE_Y + Math.sin(t * 0.62) * 0.07;
      centre.rotation.y = t * 0.18;
    }
  });

  return (
    <group>
      {/* Moss floor — the shadow catcher, and the surface every plant below
          solves its height from. */}
      <Part
        geometry={gladeFloorGeometry()}
        material={shaders.moss}
        castShadow={false}
      />
      <InstancedPart
        geometry={mossTuftGeometry()}
        material={shaders.moss}
        placements={MOSS_TUFTS}
        castShadow={false}
      />

      {/* Wildflowers. Both species share one program and one vertex stage; only
          their tint and sway differ. */}
      <InstancedPart
        geometry={bellflowerGeometry()}
        material={shaders.bellflower}
        placements={GLADE_BELLFLOWERS}
        castShadow={false}
      />
      <InstancedPart
        geometry={starflowerGeometry()}
        material={shaders.starflower}
        placements={GLADE_STARFLOWERS}
        castShadow={false}
      />
      <InstancedPart
        geometry={toadstoolGeometry()}
        material={materials.toadstool}
        placements={GLADE_TOADSTOOLS}
        castShadow={false}
      />

      {/* The ring: posts, and the woven crown of boughs arcing between them. */}
      <InstancedPart
        geometry={gladePostGeometry()}
        material={materials.bough}
        placements={GLADE_POSTS}
      />
      <InstancedPart
        geometry={gladeArchGeometry()}
        material={materials.bough}
        placements={GLADE_ARCHES}
      />

      {/* Crystal lanterns and the cores burning inside them. Glass is kept out
          of the shadow pass — the depth pass cannot see the shader's alpha, so
          a crystal that cast would drop an opaque block of shade. */}
      <InstancedPart
        geometry={fairyLanternGeometry()}
        material={shaders.crystal}
        placements={GLADE_CRYSTALS}
        castShadow={false}
        receiveShadow={false}
      />
      <InstancedPart
        geometry={lanternCoreGeometry()}
        material={materials.core}
        placements={GLADE_CORES}
        castShadow={false}
      />

      {/* God rays. Additive cones, drawn last so they lay over the glade. */}
      <InstancedPart
        geometry={lightShaftGeometry()}
        material={shaders.shaft}
        placements={GLADE_SHAFTS}
        castShadow={false}
        receiveShadow={false}
      />

      {/* The lantern that floats untethered at the centre of the ring. */}
      <group ref={centreRef} position={[0, GLADE_CENTRE_Y, 0]}>
        <Part
          geometry={fairyLanternGeometry()}
          material={shaders.crystal}
          position={[0, -0.28, 0]}
          scale={[1.5, 1.5, 1.5]}
          castShadow={false}
          receiveShadow={false}
        />
        <Part
          geometry={lanternCoreGeometry()}
          material={materials.core}
          position={[0, 0.02, 0]}
          scale={[1.4, 1.4, 1.4]}
          castShadow={false}
        />

        {/* One real light for the whole glade. The crystals and shafts are
            emissive geometry, and the moss and flora solve the ring
            analytically, so this only has to serve the posts and toadstools. */}
        <pointLight
          ref={ringLightRef}
          color={chapter.palette.emissive}
          intensity={7.5}
          distance={14}
          decay={2}
        />
      </group>

      {/* The centre lantern's own shaft, anchored to the ground rather than to
          the bobbing group so the beam stays planted. */}
      <Part
        geometry={lightShaftGeometry()}
        material={shaders.shaft}
        position={[0, (GLADE_CENTRE_Y - 0.35 + GLADE_SHAFT_BOTTOM) / 2, 0]}
        scale={[1.35, GLADE_CENTRE_Y - 0.35 - GLADE_SHAFT_BOTTOM, 1.35]}
        castShadow={false}
        receiveShadow={false}
      />
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
// 3 — Mehendi: banyan courtyard with a silk-draped canopy daybed
// -----------------------------------------------------------------------------

/** Top of the raised dais. The daybed is authored from its own base, and sits here. */
const DAIS_Y = 0.18;

/** Where the banyan stands, and where the centre of its canopy floats. */
const BANYAN_TRUNK: readonly [number, number, number] = [-2.25, 0, -1.55];

/**
 * Canopy centre. Offset back and left of the daybed so the foliage arches
 * *over* the silk canopy top rather than intersecting it — at this axis the
 * underside clears the daybed's rail by about 0.15 units.
 */
const BANYAN_CANOPY: readonly [number, number, number] = [-1.0, 3.55, -0.8];

/**
 * Y of the canopy's lower surface at horizontal distance `r` from its axis.
 * Roots and lantern cords are hung off this so they appear to grow out of the
 * foliage rather than to start in mid-air.
 */
function canopyUndersideY(r: number): number {
  const t = Math.min(r / BANYAN_CANOPY_RADIUS, 1);
  return BANYAN_CANOPY[1] - BANYAN_CANOPY_HALF_HEIGHT * Math.sqrt(1 - t * t);
}

/** Horizontal distance from a point to the canopy axis. */
function distanceToCanopyAxis(x: number, z: number): number {
  return Math.hypot(x - BANYAN_CANOPY[0], z - BANYAN_CANOPY[2]);
}

/** The brazier stands off the dais, on the flagstones behind and right of the bed. */
const BRAZIER_POS: readonly [number, number, number] = [1.62, 0, -1.15];

/**
 * World position of the brazier's flame. This is the point source the silk
 * shader transmits — it sits *behind* the daybed relative to the chapter's
 * camera, which is the whole reason the drapes glow from within.
 */
const HEARTH_POS: readonly [number, number, number] = [
  BRAZIER_POS[0],
  BRAZIER_POS[1] + 0.34,
  BRAZIER_POS[2],
];

/** Peak intensity of the brazier's point light, before flicker and world fade. */
const BRAZIER_LIGHT_INTENSITY = 5.4;

const DAYBED_POSTS: readonly Placement[] = [
  { position: [-DAYBED_HALF_X, 0, -DAYBED_HALF_Z] },
  { position: [DAYBED_HALF_X, 0, -DAYBED_HALF_Z] },
  { position: [-DAYBED_HALF_X, 0, DAYBED_HALF_Z] },
  { position: [DAYBED_HALF_X, 0, DAYBED_HALF_Z] },
];

const DAYBED_BOLSTERS: readonly Placement[] = [
  { position: [-0.78, 0.72, 0] },
  { position: [0.78, 0.72, 0] },
];

/** Centre height of a drape panel, so its top edge tucks just under the rail. */
const DRAPE_CENTRE_Y = DAYBED_RAIL_Y - 0.045 - DRAPE_HEIGHT / 2;

/**
 * Six panels: a pair at each long side and one closing each end. The pairs are
 * parted at the centre so the camera reads *through* the gap to the bed, with
 * lit cloth on either side of it.
 */
const DRAPE_PANELS: readonly Placement[] = [
  { position: [-0.7, DRAPE_CENTRE_Y, DAYBED_HALF_Z + 0.055] },
  { position: [0.7, DRAPE_CENTRE_Y, DAYBED_HALF_Z + 0.055] },
  { position: [-0.7, DRAPE_CENTRE_Y, -DAYBED_HALF_Z - 0.055], rotation: [0, Math.PI, 0] },
  { position: [0.7, DRAPE_CENTRE_Y, -DAYBED_HALF_Z - 0.055], rotation: [0, Math.PI, 0] },
  { position: [-DAYBED_HALF_X - 0.055, DRAPE_CENTRE_Y, 0], rotation: [0, -Math.PI / 2, 0] },
  { position: [DAYBED_HALF_X + 0.055, DRAPE_CENTRE_Y, 0], rotation: [0, Math.PI / 2, 0] },
];

/**
 * Aerial roots dropped from the canopy. The angles are deliberately uneven so
 * the fringe does not read as a radial array, and each root's origin is solved
 * onto the canopy's own underside.
 *
 * The arc from ~0.2 to ~1.1 radians is left empty: that bearing points straight
 * at the daybed, and a root dropped there would spear the drapes.
 */
const BANYAN_AERIAL_ROOTS: readonly Placement[] = (
  [
    [1.35, 2.1, 1.5],
    [1.85, 1.95, 1.15],
    [2.4, 2.15, 1.7],
    [2.95, 2.0, 1.3],
    [3.5, 2.1, 1.55],
    [4.05, 1.95, 1.2],
    [4.6, 2.05, 1.65],
    [5.15, 1.9, 1.25],
    [5.7, 2.15, 1.45],
  ] as const
).map(([angle, radius, drop]) => ({
  position: [
    BANYAN_CANOPY[0] + Math.cos(angle) * radius,
    canopyUndersideY(radius),
    BANYAN_CANOPY[2] + Math.sin(angle) * radius,
  ] as const,
  scale: [1, drop, 1] as const,
}));

/**
 * The heavy prop roots that have reached the ground and taken hold. The shared
 * geometry hangs one unit from its origin, so scaling Y by the drop and putting
 * the origin at that height lands every tip exactly on the flagstones.
 */
const BANYAN_PROP_ROOTS: readonly Placement[] = (
  [
    [-2.85, -0.85, 1.0],
    [-1.55, -2.35, 1.0],
    [-2.85, -2.05, 0.85],
  ] as const
).map(([x, z, girth]) => {
  const drop = canopyUndersideY(distanceToCanopyAxis(x, z));
  return {
    position: [x, drop, z] as const,
    scale: [girth, drop, girth] as const,
  };
});

/**
 * Lanterns strung under the canopy. Each sits below the foliage underside at
 * its own radius — so its cord is short and reaches real leaves — and clear of
 * both the daybed's footprint and the brazier.
 */
const LANTERN_POSITIONS: readonly (readonly [number, number, number])[] = [
  [-2.6, 2.05, 0.35],
  [-1.9, 2.3, 1.35],
  [0.1, 2.15, 1.35],
  [-3.0, 1.95, -1.3],
  [0.6, 1.85, -1.7],
  [-1.45, 1.75, -2.2],
  [1.15, 2.0, -1.5],
];

const MEHENDI_LANTERNS: readonly Placement[] = LANTERN_POSITIONS.map((position) => ({
  position,
}));

/** The glowing body sits in the lantern's open waist. */
const MEHENDI_LANTERN_GLOWS: readonly Placement[] = LANTERN_POSITIONS.map(
  ([x, y, z]) => ({ position: [x, y + 0.13, z] as const }),
);

/**
 * Each lantern hangs on a length of aerial root, which is exactly what a banyan
 * offers to hang one from. The cords run up into the foliage and are lost in it.
 */
const MEHENDI_LANTERN_CORDS: readonly Placement[] = LANTERN_POSITIONS.map(
  ([x, y, z]) => {
    const top = canopyUndersideY(distanceToCanopyAxis(x, z));
    return {
      position: [x, top, z] as const,
      scale: [0.34, Math.max(top - (y + 0.29), 0.05), 0.34] as const,
    };
  },
);

/** Coals banked in the brazier bowl, relative to the brazier's own origin. */
const BRAZIER_COALS: readonly Placement[] = [
  { position: [0.05, 0.26, 0.03], scale: 1.15 },
  { position: [-0.07, 0.25, 0.06], scale: 0.8 },
  { position: [0.02, 0.27, -0.08], scale: 1.0 },
  { position: [-0.04, 0.25, -0.03], scale: 0.7 },
  { position: [0.09, 0.25, -0.02], scale: 0.9 },
];

/**
 * The Mehendi world's custom shader materials.
 *
 * These are created imperatively rather than as `<shaderMaterial>` JSX because
 * several meshes share one material — the six drape panels are one material and
 * one program across six draw calls, so the wind and firelight advance once per
 * frame no matter how much cloth is on screen.
 */
interface MehendiShaders {
  readonly drape: THREE.ShaderMaterial;
  readonly canopyTop: THREE.ShaderMaterial;
  readonly leaves: readonly THREE.ShaderMaterial[];
  /** Silk uniform sets: the ones that also take the firelight pulse. */
  readonly silkUniforms: readonly SilkUniforms[];
  /** Foliage uniform sets. */
  readonly leafUniforms: readonly LeafUniforms[];
}

function buildMehendiShaders(chapter: ChapterConfig): MehendiShaders {
  const silkProgram = CEREMONY_SHADERS.rawSilk;
  const leafProgram = CEREMONY_SHADERS.banyanLeaf;

  const makeSilk = (
    wind: number,
    weave: number,
  ): { material: THREE.ShaderMaterial; uniforms: SilkUniforms } => {
    const uniforms = createSilkUniforms();
    applyChapterUniforms(uniforms, chapter);
    uniforms.uWind.value = wind;
    uniforms.uWeave.value = weave;
    uniforms.uHearthPos.value = [...HEARTH_POS];
    return {
      uniforms,
      material: new THREE.ShaderMaterial({
        vertexShader: silkProgram.vertexShader,
        fragmentShader: silkProgram.fragmentShader,
        uniforms: asUniformMap(uniforms),
        // Cloth is seen from both faces: you look at the inside of the far
        // drape through the parted near ones.
        side: THREE.DoubleSide,
        transparent: true,
      }),
    };
  };

  // Hanging panels billow; the taut canopy top only trembles.
  const drape = makeSilk(0.045, 96);
  const canopyTop = makeSilk(0.009, 78);

  const leaves = Array.from({ length: BANYAN_SHELL_COUNT }, (_, i) => {
    const uniforms = createLeafUniforms();
    applyChapterUniforms(uniforms, chapter);
    uniforms.uLayer.value = i / (BANYAN_SHELL_COUNT - 1);
    // Offsetting the field per shell stops the layers lining up into rings.
    uniforms.uSeed.value = i * 13.7;
    uniforms.uWind.value = 0.055;
    // Only the outer shells break their silhouette; the innermost is the solid
    // mass the others are meant to reveal.
    uniforms.uCutoff.value = i === 0 ? 0.48 : i === 1 ? 0.38 : 0;
    return {
      uniforms,
      material: new THREE.ShaderMaterial({
        vertexShader: leafProgram.vertexShader,
        fragmentShader: leafProgram.fragmentShader,
        uniforms: asUniformMap(uniforms),
        transparent: true,
      }),
    };
  });

  return {
    drape: drape.material,
    canopyTop: canopyTop.material,
    leaves: leaves.map((l) => l.material),
    silkUniforms: [drape.uniforms, canopyTop.uniforms],
    leafUniforms: leaves.map((l) => l.uniforms),
  };
}

const mehendiShaderCache = new Map<ChapterId, MehendiShaders>();

/**
 * Cached per chapter and never disposed — the same contract the geometry and
 * PBR material sets in `proceduralAssets` are built on, and for the same
 * reason: worlds unmount and remount on every cross-fade, and recompiling two
 * shader programs per transition is a visible hitch. The cache is bounded at
 * one entry, since only this chapter uses these programs.
 *
 * Owning the set at module scope also keeps it out of the component's hook
 * graph, which matters: a uniform block has to be written every frame, and a
 * value React has memoised is — correctly — not allowed to be.
 */
function getMehendiShaders(chapter: ChapterConfig): MehendiShaders {
  let set = mehendiShaderCache.get(chapter.id);
  if (!set) {
    set = buildMehendiShaders(chapter);
    mehendiShaderCache.set(chapter.id, set);
  }
  return set;
}

function MehendiWorld({ chapter }: WorldProps): JSX.Element {
  const renderer = useThree((state) => state.gl);
  const env = useMemo(() => getEnvMap(renderer, "warm"), [renderer]);
  const materials = useMemo(() => getMehendiMaterials(chapter, env), [chapter, env]);
  const shaders = useMemo(() => getMehendiShaders(chapter), [chapter]);

  const flameRef = useRef<THREE.Group>(null);
  const fireLightRef = useRef<THREE.PointLight>(null);
  const clock = useRef(0);

  useFrame((_state, delta) => {
    clock.current += delta;
    const t = clock.current;

    // Re-fetched rather than closed over: both are module-cached lookups (a
    // `Map.get` and a few early-outs), and reaching the mutable uniform blocks
    // through the cache instead of through a memoised binding is what keeps
    // this loop's writes legitimate.
    const live = getMehendiShaders(chapter);
    const surfaces = getMehendiMaterials(chapter, env);

    // Three incommensurate rates, so the fire never settles into a period.
    const pulse =
      0.74 +
      Math.sin(t * 6.3) * 0.14 +
      Math.sin(t * 11.7 + 1.3) * 0.08 +
      Math.sin(t * 19.1 + 2.7) * 0.04;

    for (const uniforms of live.silkUniforms) {
      uniforms.uTime.value = t;
      uniforms.uHearthPulse.value = pulse;
    }
    for (const uniforms of live.leafUniforms) {
      uniforms.uTime.value = t;
    }

    // `applyWorldFade` writes `uOpacity` on every material each frame, so the
    // drape's own uniform is a free, exact read of this world's presence. The
    // brazier's *light* has to be scaled by it explicitly: the fade helper
    // walks materials, and a point light left burning through a cross-fade
    // would keep lighting the incoming chapter.
    const presence = live.silkUniforms[0].uOpacity.value;

    if (fireLightRef.current) {
      fireLightRef.current.intensity = BRAZIER_LIGHT_INTENSITY * pulse * presence;
    }

    surfaces.glow.emissiveIntensity =
      2.1 + Math.sin(t * 3.1) * 0.3 + Math.sin(t * 5.7 + 2.0) * 0.18;
    surfaces.coal.emissiveIntensity = 1.5 + pulse * 0.9;

    const flame = flameRef.current;
    if (flame) {
      const beat = Math.sin(t * 5.9);
      const flicker = Math.sin(t * 15.1 + 0.7) * 0.06;
      flame.scale.set(
        0.3 * (1 + flicker * 0.5),
        0.3 * (0.88 + Math.abs(beat) * 0.3 + flicker),
        0.3 * (1 + flicker * 0.5),
      );
      flame.rotation.y = beat * 0.14;
    }
  });

  return (
    <group>
      {/* Flagstone courtyard with the dais merged in — the shadow catcher. */}
      <Part geometry={courtyardGeometry()} material={materials.stone} castShadow={false} />

      {/* --- the banyan ----------------------------------------------------- */}
      <Part
        geometry={banyanTrunkGeometry()}
        material={materials.bark}
        position={BANYAN_TRUNK as [number, number, number]}
      />
      <InstancedPart
        geometry={banyanPropRootGeometry()}
        material={materials.bark}
        placements={BANYAN_PROP_ROOTS}
      />
      <InstancedPart
        geometry={banyanAerialRootGeometry()}
        material={materials.bark}
        placements={BANYAN_AERIAL_ROOTS}
      />

      {/* Three concentric foliage shells, outermost first. Each shades itself
          as a slab of leaves rather than a surface; see the `banyanLeaf`
          program. They are deliberately kept *out* of the shadow pass: the
          depth pass has no access to the fragment cutout, so a canopy that cast
          would drop one solid dome of shadow over the whole daybed — the exact
          opposite of the dappling the cutout exists to produce. */}
      {shaders.leaves.map((material, i) => (
        <Part
          key={i}
          geometry={banyanCanopyShellGeometry(i)}
          material={material}
          position={BANYAN_CANOPY as [number, number, number]}
          castShadow={false}
          receiveShadow={false}
        />
      ))}

      {/* --- the canopy daybed ---------------------------------------------- */}
      <group position={[0, DAIS_Y, 0]}>
        <InstancedPart
          geometry={daybedPostGeometry()}
          material={materials.teak}
          placements={DAYBED_POSTS}
        />
        <Part geometry={daybedFrameGeometry()} material={materials.teak} />
        <Part
          geometry={daybedMattressGeometry()}
          material={materials.linen}
          position={[0, 0.54, 0]}
        />
        <InstancedPart
          geometry={bolsterGeometry()}
          material={materials.linen}
          placements={DAYBED_BOLSTERS}
        />

        {/* Raw silk. Wind is a vertex displacement in the material, so the
            depth pass — which uses three's own depth material and cannot see
            our vertex stage — casts the panel's rest pose. The sway peaks at
            45mm, well under the softness of the PCF kernel, so the mismatch
            never surfaces. */}
        <Part
          geometry={daybedCanopyTopGeometry()}
          material={shaders.canopyTop}
          position={[0, DAYBED_RAIL_Y + 0.035, 0]}
        />
        <Part geometry={drapeValanceGeometry()} material={shaders.drape} />
        {DRAPE_PANELS.map((panel, i) => (
          <Part
            key={i}
            geometry={drapePanelGeometry()}
            material={shaders.drape}
            position={panel.position}
            rotation={panel.rotation}
          />
        ))}
      </group>

      {/* --- lanterns ------------------------------------------------------- */}
      <InstancedPart
        geometry={banyanAerialRootGeometry()}
        material={materials.bark}
        placements={MEHENDI_LANTERN_CORDS}
        castShadow={false}
      />
      <InstancedPart
        geometry={lanternGeometry()}
        material={materials.brass}
        placements={MEHENDI_LANTERNS}
      />
      <InstancedPart
        geometry={lanternGlowGeometry()}
        material={materials.glow}
        placements={MEHENDI_LANTERN_GLOWS}
        castShadow={false}
      />

      {/* --- the brazier ---------------------------------------------------- */}
      <group position={BRAZIER_POS as [number, number, number]}>
        <Part geometry={brazierGeometry()} material={materials.brass} />
        <InstancedPart
          geometry={emberGeometry()}
          material={materials.coal}
          placements={BRAZIER_COALS}
          castShadow={false}
        />
        <group ref={flameRef} position={[0, 0.28, 0]}>
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

        {/* The firelight the silk transmits, as an actual scene light so the
            brass, teak and flagstones react to the same source the cloth does.
            It does not cast — one shadow-casting light per chapter is the
            budget, and that is the key. */}
        <pointLight
          ref={fireLightRef}
          position={[0, 0.34, 0]}
          color={chapter.palette.emissive}
          intensity={BRAZIER_LIGHT_INTENSITY}
          distance={7}
          decay={2}
        />
      </group>
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
  proposal: ProposalWorld,
  engagement: StepwellWorld,
  mehendi: MehendiWorld,
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
