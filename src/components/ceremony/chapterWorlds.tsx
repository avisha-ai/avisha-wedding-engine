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

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type JSX } from "react";
import * as THREE from "three";

import { kelvinToRGB, type ChapterConfig, type ChapterId } from "./ceremonyConfig";
import { CEREMONY_SHADERS, createCeremonyUniforms } from "./shaders";

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

function HavanKundWorld({ chapter }: WorldProps): JSX.Element {
  const { secondary, emissive } = chapter.palette;
  const fireRef = useRef<THREE.Group>(null);
  const t = useRef(0);

  useFrame((_state, delta) => {
    t.current += delta;
    if (fireRef.current) {
      const s = 0.85 + Math.abs(Math.sin(t.current * 6.0)) * 0.3;
      fireRef.current.scale.set(1, s, 1);
    }
  });

  const wall = 0.18;
  const half = 0.9;

  return (
    <group position={[0, 0.2, 0]}>
      {/* Four sandstone pillars */}
      {[
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], 0.4, p[1]]}>
          <boxGeometry args={[0.28, 0.8, 0.28]} />
          <meshStandardMaterial color={secondary} roughness={0.9} transparent />
        </mesh>
      ))}
      {/* Square kund rim (four walls) — beaten gold */}
      <group position={[0, 1.0, 0]}>
        {[
          { pos: [0, 0, half] as [number, number, number], size: [half * 2 + wall, 0.4, wall] as [number, number, number] },
          { pos: [0, 0, -half] as [number, number, number], size: [half * 2 + wall, 0.4, wall] as [number, number, number] },
          { pos: [half, 0, 0] as [number, number, number], size: [wall, 0.4, half * 2 + wall] as [number, number, number] },
          { pos: [-half, 0, 0] as [number, number, number], size: [wall, 0.4, half * 2 + wall] as [number, number, number] },
        ].map((w, i) => (
          <mesh key={i} position={w.pos}>
            <boxGeometry args={w.size} />
            <GoldMaterial chapter={chapter} />
          </mesh>
        ))}
        {/* Kund floor */}
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[half * 2, 0.06, half * 2]} />
          <meshStandardMaterial color={secondary} roughness={0.8} transparent />
        </mesh>
      </group>
      {/* Sacred fire */}
      <group ref={fireRef} position={[0, 1.15, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.22, 0.2 + i * 0.05, 0]}>
            <coneGeometry args={[0.22 - i * 0.05, 0.6 - i * 0.1, 6]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={2.4}
              transparent
              opacity={0.9}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// -----------------------------------------------------------------------------
// 6 — Reception: expansive conservatory dining glass layout
// -----------------------------------------------------------------------------

function ConservatoryWorld({ chapter }: WorldProps): JSX.Element {
  const { primary, secondary, emissive } = chapter.palette;
  const seats = 4;

  return (
    <group position={[0, 0, 0]}>
      {/* Floor plate */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 4]} />
        <meshStandardMaterial color={secondary} transparent opacity={0.5} roughness={0.4} />
      </mesh>
      {/* Slender posts + gabled glass roof */}
      {[-2.6, 2.6].map((x) =>
        [-1.4, 1.4].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 1.1, z]}>
            <cylinderGeometry args={[0.05, 0.05, 2.2, 8]} />
            <meshStandardMaterial color={primary} metalness={0.6} roughness={0.3} transparent />
          </mesh>
        )),
      )}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 2.4, s * 0.9]} rotation={[s * 0.5, 0, 0]}>
          <planeGeometry args={[5.4, 2.0]} />
          <meshStandardMaterial
            color={secondary}
            transparent
            opacity={0.12}
            roughness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {/* Long dining table */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[4.4, 0.12, 1.0]} />
        <meshStandardMaterial color={primary} roughness={0.5} transparent />
      </mesh>
      {/* Chairs */}
      {Array.from({ length: seats }).map((_, i) => {
        const x = -1.6 + (i / (seats - 1)) * 3.2;
        return [-0.75, 0.75].map((z) => (
          <mesh key={`${i}-${z}`} position={[x, 0.35, z]}>
            <boxGeometry args={[0.4, 0.7, 0.4]} />
            <meshStandardMaterial color={secondary} roughness={0.7} transparent />
          </mesh>
        ));
      })}
      {/* Gold candelabra centrepieces */}
      {[-1.2, 0, 1.2].map((x) => (
        <mesh key={x} position={[x, 0.95, 0]}>
          <cylinderGeometry args={[0.06, 0.09, 0.4, 10]} />
          <GoldMaterial chapter={chapter} />
        </mesh>
      ))}
      {/* Candle flames */}
      {[-1.2, 0, 1.2].map((x) => (
        <mesh key={`f${x}`} position={[x, 1.24, 0]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial
            color={emissive}
            emissive={emissive}
            emissiveIntensity={2.2}
            transparent
          />
        </mesh>
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
 */
export function applyWorldFade(root: THREE.Object3D, o: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const material = mesh.material;
    if (!material) return;
    const mats = Array.isArray(material) ? material : [material];
    for (const m of mats) {
      const shader = m as THREE.ShaderMaterial;
      if (shader.uniforms && shader.uniforms.uOpacity) {
        shader.uniforms.uOpacity.value = o;
      } else {
        (m as THREE.Material).opacity = o;
      }
      m.transparent = true;
      m.depthWrite = o > 0.98;
    }
  });
}
