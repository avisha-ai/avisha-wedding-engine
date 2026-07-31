"use client";

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

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
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
// Fade wrapper — drives one world's opacity from a shared numeric ref
// -----------------------------------------------------------------------------

function FadeWorld({
  chapter,
  fadeRef,
}: {
  readonly chapter: ChapterConfig;
  readonly fadeRef: NumberRef;
}): JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) applyWorldFade(groupRef.current, fadeRef.current);
  });
  return (
    <group ref={groupRef}>
      <ChapterWorld chapter={chapter} />
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
}

function CeremonyRig({ chapter, onSettled, intro }: CeremonyRigProps): JSX.Element {
  const { camera } = useThree();

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
        cam.position,
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
        cam.position,
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

  // Per-frame: keep the camera aimed at the (tweened) look target.
  useFrame(() => {
    camera.lookAt(lookTarget.current);
  });

  const fogColor = useMemo(
    () => new THREE.Color(chapter.palette.background),
    [chapter.palette.background],
  );

  return (
    <>
      <color attach="background" args={[fogColor]} />
      <fogExp2
        attach="fog"
        args={[fogColor.getHex(), chapter.lighting.fogDensity]}
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
        // Normal-offset biasing beats constant bias on bevelled geometry: the
        // chamfers present grazing angles where a flat bias either peters out
        // into acne or pushes the contact shadow off its own edge.
        shadow-bias={-0.0006}
        shadow-normalBias={0.022}
      />

      <FadeWorld key={chapter.id} chapter={chapter} fadeRef={curFade} />
      {prev && (
        <FadeWorld key={prev.id} chapter={prev} fadeRef={prevFade} />
      )}

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
}: CeremonyCanvasProps): JSX.Element {
  const [chapterId, setChapterId] = useState<ChapterId>(initialChapter);
  const [audioOn, setAudioOn] = useState(false);
  const soundscapeRef = useRef<CeremonySoundscape | null>(null);

  const chapter = CEREMONY_CHAPTERS[chapterId];

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
        // "soft" maps to THREE.PCFSoftShadowMap — percentage-closer filtering
        // with a wide kernel. The extra taps are affordable because exactly one
        // light casts, and the penumbra suits candle- and daylight-lit interiors
        // far better than the hard edge of the default map.
        shadows="soft"
        gl={{ antialias: true, alpha: false }}
        camera={{
          position: [...chapter.camera.position],
          fov: chapter.camera.fov,
        }}
        dpr={[1, 2]}
      >
        <CeremonyRig chapter={chapter} onSettled={handleSettled} intro={intro} />

        {/* Bloom — only bright specular glints, emissive lanterns, and fire
            cross the luminance threshold, so the gold and flames actually glow. */}
        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={0.9}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.25}
          />
        </EffectComposer>
      </Canvas>

      {/* Interactive Simulation Overlay — drives the Agent Mesh live. */}
      <SimulationOverlay chapterId={chapterId} />

      {/* The invitation. Renders only on its own chapter. */}
      <InvitationOverlay chapterId={chapterId} />

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
