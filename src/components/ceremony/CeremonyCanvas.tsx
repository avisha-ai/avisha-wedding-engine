"use client";

// R3F pattern: scratch objects and drag state are mutated inside useFrame and pointer handlers.
// React Compiler lint cannot see that this is imperative per-frame Three.js
// work, not render-time state.
/* eslint-disable react-hooks/immutability */

/**
 * CeremonyCanvas.tsx
 * -----------------------------------------------------------------------------
 * Phase II — Living Ceremony Layer: the React Three Fiber scene controller.
 *
 * Responsibilities:
 *  - Own the "current chapter" state across the 7 chapters.
 *  - Cross-fade whole structural *worlds* (mount incoming + outgoing, tween
 *    their opacity) while simultaneously tweening camera framing, lighting
 *    (Kelvin→RGB), and fog/background between chapters using GSAP.
 *  - Expose prev/next navigation (← / → and on-screen controls).
 *
 * Geometry for each chapter lives in `chapterWorlds.tsx`; this file orchestrates
 * the transitions. Camera / lighting values are read straight from
 * `ceremonyConfig.ts` — the single source of truth.
 */

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import gsap from "gsap";
import * as THREE from "three";

import {
  CEREMONY_CHAPTERS,
  adjacentChapter,
  kelvinToRGB,
  type ChapterConfig,
  type ChapterId,
} from "./ceremonyConfig";
import { ChapterWorld, applyWorldFade } from "./chapterWorlds";
import { ChapterParticles } from "./ceremonyParticles";
import { CeremonySoundscape } from "./ceremonyAudio";
import SimulationOverlay from "./SimulationOverlay";
import InvitationOverlay from "./InvitationOverlay";
import type { CoupleNames } from "@/lib/branding";
import type { Tradition } from "@/lib/wedding/types";
import { ChapterCast, type QualityTier } from "./people/ChapterCast";
import { ENV, Petals, WorldEnvironment, type PetalHandle } from "./worldEnvironment";
import { PHERA_TIMING, RITUALS, pheraRound } from "./ritualConfig";

// -----------------------------------------------------------------------------
// Public props
// -----------------------------------------------------------------------------

export interface CeremonyCanvasProps {
  /** Chapter shown on first mount. Defaults to `"proposal"`. */
  readonly initialChapter?: ChapterId;
  /** Fired after a transition settles on a new chapter. */
  readonly onChapterChange?: (chapter: ChapterId) => void;
  /** Show the built-in prev/next + chapter label overlay. Defaults to `true`. */
  readonly showControls?: boolean;
  /**
   * Play the opening camera move on first mount. Defaults to `true`, and is
   * skipped regardless for viewers who ask for reduced motion.
   */
  readonly intro?: boolean;
  /** Extra classes for the wrapping element. */
  readonly className?: string;
  /** Couple names for the invitation card. Defaults to `branding.ts`. */
  readonly couple?: CoupleNames;
  /** Wedding tradition from the planner; picks the ritual labels. */
  readonly tradition?: Tradition;
}

/** Minimal structural shape of a mutable numeric ref we tween with GSAP. */
type NumberRef = { current: number };

/**
 * Shadow-map resolution for the key light. 1024² is ample here: the shadow
 * camera is tightly cropped to the ~10-unit stage, so texel density is high
 * without paying for a 2048² depth pass every frame alongside bloom.
 */
const SHADOW_MAP_SIZE = 1024;

/**
 * The opening move.
 *
 * The camera starts high and outside the wisteria arch — above the crown, wide
 * enough to take in the whole approach — and settles down through it onto the
 * chapter's own framing. The descent passes the arch's crown (its span tops out
 * around 4.0) on the way down, so the blossom sweeps up and out of frame and
 * leaves the glade behind it.
 *
 * The start is on roughly the same bearing as the settled camera, pushed out
 * and up; keeping the bearing means the move is a fall rather than an orbit,
 * which is what lets it stay slow without feeling like a turntable.
 */
const INTRO = {
  position: [5.4, 10.2, 12.6] as const,
  target: [0, 3.4, 0] as const,
  /** Wider at the top of the move, narrowing into the chapter's own fov. */
  fov: 54,
  /** Seconds. Long enough to read as an establishing shot. */
  duration: 7.5,
} as const;

/** Viewers who ask for reduced motion get the settled framing immediately. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Half-extent of the orthographic shadow frustum. Sized to the widest world
 * (the conservatory floor plate at 7.2 × 4.3) with headroom for the gable.
 * Cropping tightly is what keeps 1024² sharp.
 */
const SHADOW_EXTENT = 5.5;

// -----------------------------------------------------------------------------
// Device-adaptive render quality
// -----------------------------------------------------------------------------

/**
 * Resolution floor. Below this the procedural textures stop resolving and the
 * VSM penumbra turns to mush, so the scene sheds effects rather than going any
 * softer than this.
 */
const DPR_FLOOR = 0.75;

/**
 * Resolution ceiling, per device class.
 *
 * `devicePixelRatio` on a modern phone is 3. Honouring it asks this scene to
 * rasterise nine times the CSS pixels, and it pays that cost three times over:
 * the colour pass, the VSM shadow map, and the bloom mip chain. Capping the
 * ceiling on a handheld is by far the largest lever available here, and at
 * phone viewing distance 1.5 is not visibly softer than 2.
 */
const DPR_CEILING_HANDHELD = 1.5;
const DPR_CEILING_DESKTOP = 2;

/**
 * True for devices whose primary pointer is coarse — phones and tablets.
 *
 * Deliberately a capability query rather than a user-agent sniff: what this
 * needs to know is "is there a handheld GPU behind this viewport", and
 * `(pointer: coarse)` is the closest honest proxy the platform exposes. It is
 * evaluated once, in a `useState` initialiser: this component is only ever
 * reached through `CeremonyCanvasClient`, which imports it with `ssr: false`,
 * so there is no server pass for the value to disagree with.
 */
function isHandheld(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

// -----------------------------------------------------------------------------
// Fade wrapper — drives one world's opacity from a shared numeric ref
// -----------------------------------------------------------------------------

function FadeWorld({
  chapter,
  fadeRef,
  tier,
  kalash,
  onCoupleTap,
}: {
  readonly chapter: ChapterConfig;
  readonly fadeRef: NumberRef;
  readonly tier: QualityTier;
  readonly kalash: boolean;
  readonly onCoupleTap: () => void;
}): JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) applyWorldFade(groupRef.current, fadeRef.current);
  });
  return (
    <group ref={groupRef}>
      <ChapterWorld chapter={chapter} />
      <WorldEnvironment chapter={chapter.id} tier={tier} />
      <ChapterCast chapter={chapter.id} tier={tier} onCoupleTap={onCoupleTap} />
      {kalash && chapter.id === "wedding" && <Kalash />}
    </group>
  );
}

/**
 * A small gold kalash with mango leaves and a coconut, shown by the mandap when
 * the tradition config asks for it (Jain: one of the ashtamangala). Please
 * review with family; see ritualConfig.ts.
 */
function Kalash(): JSX.Element {
  const body = useMemo(
    () =>
      new THREE.LatheGeometry(
        [[0.001, 0], [0.09, 0.01], [0.16, 0.12], [0.15, 0.22], [0.07, 0.3], [0.09, 0.34], [0.001, 0.34]].map(
          ([r, y]) => new THREE.Vector2(r, y),
        ),
        24,
      ),
    [],
  );
  return (
    <group position={[2.3, 0, 1.4]}>
      <mesh geometry={body}>
        <meshStandardMaterial color="#D9A93C" metalness={0.85} roughness={0.3} emissive="#8A5A10" emissiveIntensity={0.6} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.26) * 0.08, 0.38, Math.sin(i * 1.26) * 0.08]} rotation={[Math.sin(i * 1.26) * 0.9, 0, -Math.cos(i * 1.26) * 0.9]}>
          <coneGeometry args={[0.03, 0.16, 6]} />
          <meshStandardMaterial color="#2E7D32" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0]}>
        <sphereGeometry args={[0.07, 14, 10]} />
        <meshStandardMaterial color="#7A4A23" roughness={0.9} />
      </mesh>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Scene rig — lives *inside* <Canvas> so it can use R3F hooks
// -----------------------------------------------------------------------------

interface CeremonyRigProps {
  readonly chapter: ChapterConfig;
  readonly onSettled: (id: ChapterId) => void;
  readonly intro: boolean;
  readonly tier: QualityTier;
  readonly kalash: boolean;
  readonly onCoupleTap: () => void;
}

function CeremonyRig({ chapter, onSettled, intro, tier, kalash, onCoupleTap }: CeremonyRigProps): JSX.Element {
  const { camera, gl } = useThree();

  // Phase 2: GSAP tweens this base position; each frame the camera sits at
  // base + a slow cinematic drift, orbited a little by the viewer's drag.
  const basePos = useRef(new THREE.Vector3(...chapter.camera.position));
  const drag = useRef({ yaw: 0, pitch: 0, toYaw: 0, toPitch: 0, down: false, x: 0, y: 0, t: 0, moved: 0, sx: 0, sy: 0 });
  const petals = useRef<PetalHandle>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const keyLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  // Imperative, tweened camera aim.
  const lookTarget = useRef(new THREE.Vector3(...chapter.camera.target));
  const activeTween = useRef<gsap.core.Timeline | null>(null);

  // World cross-fade bookkeeping. `prev` (if set) is the outgoing world.
  const [prev, setPrev] = useState<ChapterConfig | null>(null);
  const curFade = useRef<number>(1);
  const prevFade = useRef<number>(0);
  const prevChapterRef = useRef<ChapterConfig>(chapter);

  // Armed once. The opening move belongs to the first mount only — coming back
  // to the first chapter later is a chapter transition, not an entrance.
  const introPending = useRef(true);

  // React to chapter changes: one GSAP timeline over camera + lights + the two
  // world fades. (Fog/background are set declaratively per chapter below.)
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const lightColor = new THREE.Color().setRGB(
      ...kelvinToRGB(chapter.lighting.temperatureK),
    );
    const outgoing = prevChapterRef.current;
    const isFirst = outgoing.id === chapter.id;

    activeTween.current?.kill();

    const playIntro =
      isFirst && introPending.current && intro && !prefersReducedMotion();
    introPending.current = false;

    const tl = gsap.timeline({
      defaults: {
        duration: playIntro ? INTRO.duration : chapter.transitionDuration,
        ease: "power2.inOut",
      },
      onComplete: () => {
        prevFade.current = 0;
        setPrev(null);
        onSettled(chapter.id);
      },
    });
    activeTween.current = tl;

    // Camera position + look target + fov.
    //
    // The entrance runs `.from()` rather than `.to()`: GSAP takes the start
    // values from the tween declaration and ends wherever the object already
    // sits, which on first mount is exactly the chapter's own framing. That is
    // not only shorter than parking the camera by hand — it keeps the effect
    // from reaching in and mutating the camera outside the tween at all, which
    // the React compiler (rightly) rejects.
    if (playIntro) {
      tl.from(
        basePos.current,
        { x: INTRO.position[0], y: INTRO.position[1], z: INTRO.position[2] },
        0,
      );
      tl.from(
        lookTarget.current,
        { x: INTRO.target[0], y: INTRO.target[1], z: INTRO.target[2] },
        0,
      );
      tl.from(
        cam,
        { fov: INTRO.fov, onUpdate: () => cam.updateProjectionMatrix() },
        0,
      );
    } else {
      tl.to(
        basePos.current,
        {
          x: chapter.camera.position[0],
          y: chapter.camera.position[1],
          z: chapter.camera.position[2],
        },
        0,
      );
      tl.to(
        lookTarget.current,
        {
          x: chapter.camera.target[0],
          y: chapter.camera.target[1],
          z: chapter.camera.target[2],
        },
        0,
      );
      tl.to(
        cam,
        { fov: chapter.camera.fov, onUpdate: () => cam.updateProjectionMatrix() },
        0,
      );
    }

    // Lights.
    if (keyLightRef.current) {
      tl.to(keyLightRef.current, { intensity: chapter.lighting.keyIntensity }, 0);
      tl.to(
        keyLightRef.current.position,
        {
          x: chapter.lighting.keyDirection[0],
          y: chapter.lighting.keyDirection[1],
          z: chapter.lighting.keyDirection[2],
        },
        0,
      );
      tl.to(
        keyLightRef.current.color,
        { r: lightColor.r, g: lightColor.g, b: lightColor.b },
        0,
      );
    }
    if (ambientRef.current) {
      tl.to(ambientRef.current, { intensity: chapter.lighting.ambientIntensity }, 0);
    }
    if (hemiRef.current) {
      tl.to(hemiRef.current, { intensity: chapter.lighting.hemiIntensity }, 0);
    }

    // World cross-fade (skipped on first mount — nothing to fade from).
    if (!isFirst) {
      setPrev(outgoing);
      curFade.current = 0;
      prevFade.current = 1;
      tl.to(curFade, { current: 1 }, 0);
      tl.to(prevFade, { current: 0 }, 0);
    } else {
      curFade.current = 1;
    }

    prevChapterRef.current = chapter;
    return () => {
      tl.kill();
    };
  }, [chapter, camera, onSettled, intro]);

  // Drag to look around a little; a quick tap showers petals from the cursor.
  useEffect(() => {
    const el = gl.domElement;
    const d = drag.current;
    const ray = new THREE.Raycaster();
    const down = (e: PointerEvent): void => {
      d.down = true;
      d.x = d.sx = e.clientX;
      d.y = d.sy = e.clientY;
      d.t = performance.now();
      d.moved = 0;
    };
    const move = (e: PointerEvent): void => {
      if (!d.down) return;
      d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.sx, e.clientY - d.sy));
      d.toYaw = THREE.MathUtils.clamp(d.toYaw - (e.clientX - d.x) * 0.004, -0.45, 0.45);
      d.toPitch = THREE.MathUtils.clamp(d.toPitch + (e.clientY - d.y) * 0.002, -0.1, 0.12);
      d.x = e.clientX;
      d.y = e.clientY;
    };
    const up = (e: PointerEvent): void => {
      if (!d.down) return;
      d.down = false;
      d.toYaw = 0;
      d.toPitch = 0;
      if (d.moved < 8 && performance.now() - d.t < 450) {
        const r = el.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        petals.current?.burst(ray.ray.at(3.2, new THREE.Vector3()));
      }
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl, camera]);

  // Per-frame: base + drift, orbit by the drag, aim at the (tweened) target.
  const offset = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const d = drag.current;
    const k = 1 - Math.exp(-dt * (d.down ? 8 : 1.6));
    d.yaw += (d.toYaw - d.yaw) * k;
    d.pitch += (d.toPitch - d.pitch) * k;
    const t = state.clock.elapsedTime;
    const amp = reduced ? 0 : ENV[chapter.id].drift;
    offset.copy(basePos.current).sub(lookTarget.current);
    offset.x += Math.sin(t * 0.07) * amp;
    offset.y += Math.sin(t * 0.13) * amp * 0.12;
    offset.z += Math.sin(t * 0.05 + 1.3) * amp;
    offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, d.yaw);
    offset.y += d.pitch * offset.length();
    camera.position.copy(lookTarget.current).add(offset);
    camera.lookAt(lookTarget.current);
  });

  const fogColor = useMemo(
    () => new THREE.Color(ENV[chapter.id].horizon),
    [chapter.id],
  );

  return (
    <>
      <color attach="background" args={[fogColor]} />
      <fogExp2
        attach="fog"
        args={[fogColor.getHex(), Math.max(chapter.lighting.fogDensity, 0.035)]}
      />

      <ambientLight
        ref={ambientRef}
        intensity={chapter.lighting.ambientIntensity}
      />
      <hemisphereLight ref={hemiRef} intensity={chapter.lighting.hemiIntensity} />
      {/* The key light is the only shadow caster. Fill lights that also cast
          would multiply the shadow-map cost for very little visual return, and
          would wash out the single directional read the chapters are lit for. */}
      <directionalLight
        ref={keyLightRef}
        position={chapter.lighting.keyDirection}
        intensity={chapter.lighting.keyIntensity}
        castShadow
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
        shadow-camera-near={0.5}
        shadow-camera-far={26}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        // Penumbra width. VSM blurs the depth moments in a separate pass, so
        // softness is a property of the light rather than of the filter taps —
        // radius sets how far the blur reaches, blurSamples how finely it is
        // walked. 16 samples keeps the gradient clean at this map size; fewer
        // banded visibly across the broad floor shadows.
        shadow-radius={4}
        shadow-blurSamples={16}
        // Constant bias goes to zero here. It existed to fight acne under PCF's
        // point-sampled depth compare; VSM compares distributions instead and
        // does not have that failure mode, so keeping the old offset would only
        // detach contact shadows from the geometry casting them. Normal-offset
        // biasing still earns its place on the bevelled geometry, where the
        // chamfers present grazing angles, so it stays.
        shadow-bias={0}
        shadow-normalBias={0.02}
      />

      <FadeWorld key={chapter.id} chapter={chapter} fadeRef={curFade} tier={tier} kalash={kalash} onCoupleTap={onCoupleTap} />
      {prev && (
        <FadeWorld key={prev.id} chapter={prev} fadeRef={prevFade} tier={tier} kalash={kalash} onCoupleTap={onCoupleTap} />
      )}
      <Petals ref={petals} max={tier === "low" ? 90 : tier === "medium" ? 160 : 260} rain={chapter.id === "wedding"} />

      {/* Atmospheric VFX — fade with their chapter via the shared fade refs. */}
      <ChapterParticles key={`fx-${chapter.id}`} chapter={chapter} fadeRef={curFade} />
      {prev && (
        <ChapterParticles key={`fx-${prev.id}`} chapter={prev} fadeRef={prevFade} />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// Public component
// -----------------------------------------------------------------------------

export default function CeremonyCanvas({
  initialChapter = "proposal",
  onChapterChange,
  showControls = true,
  intro = true,
  className,
  couple,
  tradition = "hindu",
}: CeremonyCanvasProps): JSX.Element {
  // The engineering overlay is for us, not guests: only with ?debug=1.
  const [debug] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1",
  );
  const [coupleCard, setCoupleCard] = useState(false);
  const showCoupleCard = useCallback(() => setCoupleCard(true), []);
  useEffect(() => {
    if (!coupleCard) return;
    const id = window.setTimeout(() => setCoupleCard(false), 6000);
    return () => window.clearTimeout(id);
  }, [coupleCard]);
  const rituals = RITUALS[tradition];
  const [round, setRound] = useState(0);
  const [chapterId, setChapterId] = useState<ChapterId>(initialChapter);
  const [audioOn, setAudioOn] = useState(false);

  // Device class is fixed for the life of the canvas; the resolution it drives
  // is not. `dpr` starts at the class ceiling and PerformanceMonitor walks it
  // down toward DPR_FLOOR when frames start overrunning the refresh interval,
  // so a slow phone loses pixels before it loses frames.
  const [handheld] = useState(isHandheld);
  const [dprCeiling] = useState(() =>
    isHandheld() ? DPR_CEILING_HANDHELD : DPR_CEILING_DESKTOP,
  );
  const [dpr, setDpr] = useState(dprCeiling);

  // Bloom is the first thing dropped if dropping resolution was not enough.
  // PerformanceMonitor only calls onFallback after the frame time has failed
  // to recover across several adjustments, so this is a last resort, not a
  // guess made up front about what the device can do.
  const [bloomOn, setBloomOn] = useState(true);

  const handleQualityChange = useCallback(
    ({ factor }: { factor: number }) => {
      // factor is 0..1 across the monitor's own bounds; map it onto the
      // resolution band and round so a jittering factor cannot thrash the
      // renderer's drawing-buffer resize.
      const next = DPR_FLOOR + factor * (dprCeiling - DPR_FLOOR);
      setDpr(Math.round(next * 20) / 20);
    },
    [dprCeiling],
  );
  const soundscapeRef = useRef<CeremonySoundscape | null>(null);

  const chapter = CEREMONY_CHAPTERS[chapterId];
  const tier: QualityTier = !bloomOn ? "low" : handheld ? "medium" : "high";

  // Phera label (DOM) follows the same clock as the 3D pheras.
  useEffect(() => {
    if (chapterId !== "wedding") return;
    const id = window.setInterval(() => setRound(pheraRound(performance.now() / 1000)), 500);
    return () => window.clearInterval(id);
  }, [chapterId]);

  const handleSettled = useCallback(
    (id: ChapterId) => {
      onChapterChange?.(id);
    },
    [onChapterChange],
  );

  const go = useCallback((direction: "next" | "prev") => {
    setChapterId((current) => adjacentChapter(current, direction) ?? current);
  }, []);

  // Audio is opt-in: the engine is created + resumed on the first click, which
  // also satisfies the browser autoplay-gesture requirement.
  const toggleAudio = useCallback(async () => {
    let engine = soundscapeRef.current;
    if (!engine) {
      const created = new CeremonySoundscape();
      if (!created.supported) return;
      created.start();
      soundscapeRef.current = created;
      engine = created;
    }
    await engine.resume();
    setAudioOn((on) => !on);
  }, []);

  // Fade the master bus with the on/off state.
  useEffect(() => {
    soundscapeRef.current?.setEnabled(audioOn);
  }, [audioOn]);

  // Cross-fade the soundscape whenever the chapter changes (while audio is on).
  useEffect(() => {
    const engine = soundscapeRef.current;
    if (engine && audioOn) {
      engine.setChapter(chapterId, chapter.transitionDuration);
    }
  }, [chapterId, audioOn, chapter.transitionDuration]);

  // Release the audio hardware on unmount.
  useEffect(() => {
    return () => {
      soundscapeRef.current?.dispose();
      soundscapeRef.current = null;
    };
  }, []);

  // Keyboard navigation: ← / → between chapters.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "ArrowRight") go("next");
      if (event.key === "ArrowLeft") go("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <Canvas
        // "variance" maps to THREE.VSMShadowMap.
        //
        // Not "soft": PCFSoftShadowMap is deprecated as of three r185 and is
        // silently rewritten to plain PCFShadowMap on the first render
        // (WebGLShadowMap.js), so asking for it bought the hard edge of the
        // default map while the code claimed a penumbra. VSM is the only
        // filter still offering a real one, and the penumbra is what these
        // candle- and daylight-lit interiors are lit for.
        //
        // The cost is a contract change: under VSM three renders anything with
        // `receiveShadow` into the shadow map regardless of `castShadow`
        // (WebGLShadowMap.js:515), so the single-caster discipline elsewhere in
        // this scene no longer holds on its own. Meshes that must stay out of
        // the map — the additive flame and water quads — already opt out of
        // both flags, which is what keeps them from bleeding into it.
        shadows="variance"
        // MSAA is dropped on handhelds: at DPR_CEILING_HANDHELD the buffer is
        // already supersampled relative to the CSS pixel, which covers most of
        // what the multisample was buying, and the bandwidth it costs is the
        // scarcest thing on a tile-based mobile GPU.
        gl={{ antialias: !handheld, alpha: false }}
        camera={{
          position: [...chapter.camera.position],
          fov: chapter.camera.fov,
          near: 0.1,
          far: 220,
        }}
        dpr={dpr}
      >
        {/* Watches real frame times and hands back a 0..1 factor. Must live
            inside the Canvas — it drives off useFrame. */}
        <PerformanceMonitor
          onChange={handleQualityChange}
          onFallback={() => setBloomOn(false)}
        />

        <CeremonyRig
          chapter={chapter}
          onSettled={handleSettled}
          intro={intro}
          tier={tier}
          kalash={rituals.kalash}
          onCoupleTap={showCoupleCard}
        />

        {/* Bloom — only bright specular glints, emissive lanterns, and fire
            cross the luminance threshold, so the gold and flames actually glow. */}
        {/* Cinematic finish. The composer renders to targets, so tone mapping
            is applied here (ACES) rather than by the renderer. Depth of field
            only on the high tier; nothing extra on the low tier. */}
        {tier === "high" && (
          <EffectComposer>
            <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.62} luminanceSmoothing={0.25} />
            <DepthOfField target={[...chapter.camera.target]} worldFocusRange={6} bokehScale={1.6} />
            <Vignette offset={0.3} darkness={0.6} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
        {tier === "medium" && (
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.65} luminanceSmoothing={0.25} />
            <Vignette offset={0.3} darkness={0.55} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </Canvas>

      {/* Interactive Simulation Overlay — drives the Agent Mesh live. */}
      {debug && <SimulationOverlay chapterId={chapterId} />}

      {/* Pheras label, wedding chapter only. Wording lives in ritualConfig.ts. */}
      {chapterId === "wedding" && (
        <div style={{ position: "absolute", left: "50%", bottom: "5.5rem", transform: "translateX(-50%)", textAlign: "center", color: "#FDFBF7", textShadow: "0 2px 10px #000", pointerEvents: "none", fontFamily: "var(--font-marcellus), Georgia, serif", maxWidth: "90vw" }}>
          <div style={{ fontSize: "0.75rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "#E8C97A" }}>{rituals.roundsTitle}</div>
          <div style={{ fontSize: "1.05rem", marginTop: "0.2rem" }}>
            {round === 0 ? rituals.complete : `${round} of ${PHERA_TIMING.rounds}${rituals.rounds[round - 1] ? ` · ${rituals.rounds[round - 1]}` : ""}`}
          </div>
        </div>
      )}

      {/* Tapping the couple shows who they are. */}
      {coupleCard && (
        <button type="button" onClick={() => setCoupleCard(false)} style={{ position: "absolute", left: "50%", top: "38%", transform: "translate(-50%, -50%)", padding: "1rem 1.6rem", borderRadius: "16px", background: "rgba(26,27,75,0.72)", border: "1px solid #C8A24B88", color: "#FDFBF7", backdropFilter: "blur(10px)", fontFamily: "var(--font-marcellus), Georgia, serif", fontSize: "1.5rem", cursor: "pointer" }}>
          {couple?.pair ?? "The couple"}
          <div style={{ fontSize: "0.8rem", opacity: 0.75, marginTop: "0.3rem", fontFamily: "system-ui, sans-serif" }}>{chapter.title}</div>
        </button>
      )}

      {/* The invitation. Renders only on its own chapter. */}
      <InvitationOverlay chapterId={chapterId} couple={couple} />

      {/* Ambient soundscape toggle (opt-in; also unlocks browser audio). */}
      <button
        type="button"
        onClick={() => void toggleAudio()}
        aria-label={audioOn ? "Mute ambient sound" : "Play ambient sound"}
        aria-pressed={audioOn}
        style={{
          position: "absolute",
          top: "1.25rem",
          right: "1.25rem",
          ...controlButtonStyle,
          opacity: audioOn ? 1 : 0.7,
        }}
      >
        {audioOn ? "🔊" : "🔈"}
      </button>

      {showControls && (
        <div
          style={{
            position: "absolute",
            inset: "auto 0 0 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.5rem",
            color: "#FDFBF7",
            pointerEvents: "none",
            fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
          }}
        >
          <button
            type="button"
            onClick={() => go("prev")}
            style={{ ...controlButtonStyle, pointerEvents: "auto" }}
            aria-label="Previous chapter"
          >
            ←
          </button>

          <div style={{ textAlign: "center", textShadow: "0 2px 12px #000" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 600 }}>
              {chapter.title}
            </div>
            <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              {chapter.subtitle}
            </div>
          </div>

          <button
            type="button"
            onClick={() => go("next")}
            style={{ ...controlButtonStyle, pointerEvents: "auto" }}
            aria-label="Next chapter"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

const controlButtonStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(253,251,247,0.4)",
  color: "#FDFBF7",
  borderRadius: "9999px",
  width: "2.75rem",
  height: "2.75rem",
  fontSize: "1.25rem",
  cursor: "pointer",
  backdropFilter: "blur(4px)",
};
