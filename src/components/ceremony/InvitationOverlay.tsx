"use client";

/**
 * InvitationOverlay.tsx
 * -----------------------------------------------------------------------------
 * The interactive invitation, anchored over the Engagement chapter.
 *
 * A frosted card carrying a gold wax seal. Pressing the seal cracks it open —
 * the two halves part, a burst of gold sparks throws off the break, and the
 * RSVP form behind it is revealed.
 *
 * ## Why this is DOM and not R3F
 *
 * Everything here is text, form controls, and a blur. The blur is
 * `backdrop-filter`, which composites against whatever is already on screen —
 * including the WebGL canvas underneath — for free. Rebuilding this in the
 * scene would mean either rendering text to a texture or laying out HTML in 3D,
 * and would cost real form semantics: focus order, labels, and the browser's
 * own validation. None of that is worth trading for depth the card never uses.
 *
 * The spark burst is a fixed set of DOM nodes animated by one keyframed
 * transform each, so the whole effect is composited on the GPU and never
 * touches the main thread — which matters, because it plays over a live canvas.
 *
 * ## What this does *not* do
 *
 * The form has no backend. Submitting stores the response in component state
 * and shows a confirmation; nothing is sent, persisted, or emailed. Wiring it
 * to a real endpoint is a deliberate separate step.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";

import type { ChapterId } from "./ceremonyConfig";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/** One guest's reply. Handed to `onRespond`; never sent anywhere by default. */
export interface InvitationResponse {
  readonly name: string;
  readonly attendance: Attendance;
  readonly notes: string;
}

export type Attendance = "joyfully" | "regretfully" | "undecided";

export interface InvitationOverlayProps {
  /** The chapter currently on screen. The card shows only on its own chapter. */
  readonly chapterId: ChapterId;
  /** Chapter this invitation belongs to. Defaults to `"engagement"`. */
  readonly anchorChapter?: ChapterId;
  /** Called with the reply on submit. No network request is made without this. */
  readonly onRespond?: (response: InvitationResponse) => void;
}

const ATTENDANCE_OPTIONS: readonly { value: Attendance; label: string }[] = [
  { value: "joyfully", label: "Joyfully accepts" },
  { value: "regretfully", label: "Regretfully declines" },
  { value: "undecided", label: "Still deciding" },
];

/** How long the seal's break animation runs, in ms. */
const CRACK_MS = 900;

/** Sparks thrown off the break. Fixed at build time — see the module note. */
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  // Fanned upward and outward rather than thrown evenly around the circle: wax
  // splits along the press, so the debris goes with it.
  const spread = (i / 17 - 0.5) * Math.PI * 1.5;
  const distance = 42 + ((i * 37) % 46);
  return {
    id: i,
    dx: Math.sin(spread) * distance,
    dy: -Math.abs(Math.cos(spread)) * distance * 0.85 - 10,
    size: 3 + ((i * 13) % 4),
    delay: (i % 6) * 22,
    spin: ((i * 61) % 180) - 90,
  };
});

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function InvitationOverlay({
  chapterId,
  anchorChapter = "engagement",
  onRespond,
}: InvitationOverlayProps): JSX.Element | null {
  const fieldId = useId();
  const [opened, setOpened] = useState(false);
  const [cracking, setCracking] = useState(false);
  const [sent, setSent] = useState(false);

  const [name, setName] = useState("");
  const [attendance, setAttendance] = useState<Attendance>("joyfully");
  const [notes, setNotes] = useState("");

  const formRef = useRef<HTMLFormElement>(null);
  const crackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visible = chapterId === anchorChapter;

  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // The seal only breaks once. Reopening on every visit to the chapter would
  // replay the burst over a form the guest has already filled in.
  const breakSeal = useCallback(() => {
    if (opened || cracking) return;

    if (reduceMotion) {
      setOpened(true);
      return;
    }

    setCracking(true);
    crackTimer.current = setTimeout(() => {
      setCracking(false);
      setOpened(true);
    }, CRACK_MS);
  }, [opened, cracking, reduceMotion]);

  useEffect(() => {
    return () => {
      if (crackTimer.current !== null) clearTimeout(crackTimer.current);
    };
  }, []);

  // Move focus to the form once it appears, so the seal press leads straight
  // into filling it in for keyboard and screen-reader users.
  useEffect(() => {
    if (!opened) return;
    const first = formRef.current?.querySelector<HTMLInputElement>("input");
    first?.focus();
  }, [opened]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      onRespond?.({ name: name.trim(), attendance, notes: notes.trim() });
      setSent(true);
    },
    [name, attendance, notes, onRespond],
  );

  if (!visible) return null;

  return (
    <>
      <style>{SEAL_KEYFRAMES}</style>

      <aside
        aria-label="Wedding invitation"
        style={{
          position: "absolute",
          top: "50%",
          right: "3.5rem",
          transform: "translateY(-50%)",
          width: "min(21rem, calc(100vw - 3rem))",
          padding: "1.6rem 1.5rem 1.5rem",
          borderRadius: "1.1rem",
          // The frosted card. `backdrop-filter` composites against the live
          // canvas behind it, so the blur is of the actual scene.
          background: "rgba(28, 24, 44, 0.42)",
          backdropFilter: "blur(18px) saturate(150%)",
          WebkitBackdropFilter: "blur(18px) saturate(150%)",
          border: "1px solid rgba(228, 206, 150, 0.28)",
          boxShadow:
            "0 18px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
          color: "#F4EEE2",
          fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
          pointerEvents: "auto",
        }}
      >
        <header style={{ textAlign: "center", marginBottom: opened ? "1.1rem" : "0.4rem" }}>
          <div
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              opacity: 0.72,
            }}
          >
            Together with their families
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 600, marginTop: "0.35rem" }}>
            Avi &amp; Isha
          </div>
        </header>

        {!opened ? (
          <div style={{ display: "grid", placeItems: "center", padding: "0.6rem 0 0.9rem" }}>
            <WaxSeal cracking={cracking} onBreak={breakSeal} />
            <p
              aria-live="polite"
              style={{
                marginTop: "1rem",
                fontSize: "0.78rem",
                opacity: 0.75,
                textAlign: "center",
              }}
            >
              {cracking ? "Breaking the seal…" : "Press the seal to open"}
            </p>
          </div>
        ) : sent ? (
          <div role="status" style={{ textAlign: "center", padding: "0.5rem 0 0.4rem" }}>
            <div style={{ fontSize: "1.6rem" }}>✦</div>
            <p style={{ margin: "0.6rem 0 0", fontSize: "0.9rem" }}>
              Thank you, {name.trim() || "friend"}.
            </p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.75rem", opacity: 0.68 }}>
              Your reply is held on this device only.
            </p>
          </div>
        ) : (
          <form ref={formRef} onSubmit={submit} style={{ display: "grid", gap: "0.85rem" }}>
            <Field label="Name" htmlFor={`${fieldId}-name`}>
              <input
                id={`${fieldId}-name`}
                name="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Attendance" htmlFor={`${fieldId}-attendance`}>
              <select
                id={`${fieldId}-attendance`}
                name="attendance"
                value={attendance}
                onChange={(e) => setAttendance(e.target.value as Attendance)}
                style={{ ...inputStyle, appearance: "none" }}
              >
                {ATTENDANCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} style={{ color: "#1C1830" }}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Notes" htmlFor={`${fieldId}-notes`}>
              <textarea
                id={`${fieldId}-notes`}
                name="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dietary needs, a song request…"
                style={{ ...inputStyle, resize: "vertical", minHeight: "3.6rem" }}
              />
            </Field>

            <button type="submit" style={submitStyle}>
              Send reply
            </button>
          </form>
        )}
      </aside>
    </>
  );
}

// -----------------------------------------------------------------------------
// The seal
// -----------------------------------------------------------------------------

/**
 * The wax seal, as a real `<button>`.
 *
 * Built on a button rather than a clickable `<div>` so it is focusable, gets
 * Enter and Space for free, and announces itself — the seal is the only way
 * into the form, so it cannot be mouse-only.
 *
 * The break is two halves parting under one keyframe each, over a burst of
 * sparks. Both halves are the same clipped SVG, mirrored, so the crack edge
 * always matches.
 */
function WaxSeal({
  cracking,
  onBreak,
}: {
  readonly cracking: boolean;
  readonly onBreak: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onBreak}
      aria-label="Break the wax seal to open the invitation"
      style={{
        position: "relative",
        width: "6.5rem",
        height: "6.5rem",
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: cracking ? "default" : "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: "-14%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(226,186,106,0.34) 0%, rgba(226,186,106,0) 68%)",
          animation: cracking ? `sealFlare ${CRACK_MS}ms ease-out forwards` : undefined,
        }}
      />

      {(["left", "right"] as const).map((side) => (
        <svg
          key={side}
          aria-hidden
          viewBox="0 0 100 100"
          width="88"
          height="88"
          style={{
            position: "absolute",
            // Each half shows only its side of the break.
            clipPath:
              side === "left"
                ? "polygon(0 0, 52% 0, 44% 30%, 56% 52%, 46% 74%, 53% 100%, 0 100%)"
                : "polygon(52% 0, 100% 0, 100% 100%, 53% 100%, 46% 74%, 56% 52%, 44% 30%)",
            animation: cracking
              ? `${side === "left" ? "sealSplitLeft" : "sealSplitRight"} ${CRACK_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards`
              : undefined,
          }}
        >
          <defs>
            <radialGradient id={`waxGrad-${side}`} cx="38%" cy="32%" r="78%">
              <stop offset="0%" stopColor="#F0D28C" />
              <stop offset="45%" stopColor="#D4A24E" />
              <stop offset="100%" stopColor="#8A6420" />
            </radialGradient>
          </defs>
          {/* Wax blob: a circle with a deliberately uneven pressed rim. */}
          <circle cx="50" cy="50" r="42" fill={`url(#waxGrad-${side})`} />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="rgba(255,236,190,0.5)"
            strokeWidth="1.5"
          />
          <circle
            cx="50"
            cy="50"
            r="32"
            fill="none"
            stroke="rgba(92,62,16,0.45)"
            strokeWidth="2"
          />
          {/* The pressed monogram. */}
          <text
            x="50"
            y="50"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Georgia, serif"
            fontSize="30"
            fontWeight="700"
            fill="rgba(86,56,12,0.72)"
          >
            A
          </text>
        </svg>
      ))}

      {/* Sparks. One transform each, so the whole burst composites on the GPU. */}
      {cracking &&
        SPARKS.map((spark) => (
          <span
            key={spark.id}
            aria-hidden
            style={
              {
                position: "absolute",
                width: `${spark.size}px`,
                height: `${spark.size}px`,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, #FFF3D0 0%, #E8B85C 55%, rgba(200,140,40,0) 100%)",
                animation: `sealSpark ${CRACK_MS}ms ease-out ${spark.delay}ms forwards`,
                ["--dx" as string]: `${spark.dx}px`,
                ["--dy" as string]: `${spark.dy}px`,
                ["--spin" as string]: `${spark.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Presentational helpers
// -----------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <div style={{ display: "grid", gap: "0.3rem" }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: "0.62rem",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          opacity: 0.72,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1px solid rgba(228, 206, 150, 0.3)",
  background: "rgba(255,255,255,0.07)",
  color: "#F4EEE2",
  fontSize: "0.85rem",
  fontFamily: "inherit",
  outlineColor: "#E2BA6A",
};

const submitStyle: React.CSSProperties = {
  marginTop: "0.2rem",
  padding: "0.6rem 0.9rem",
  borderRadius: "9999px",
  border: "1px solid rgba(228, 206, 150, 0.55)",
  background: "linear-gradient(180deg, rgba(226,186,106,0.9), rgba(184,138,58,0.9))",
  color: "#241B08",
  fontSize: "0.85rem",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

/**
 * Keyframes for the break.
 *
 * Kept as a style element rather than a CSS module because this component is
 * self-contained and the animation is meaningless without it — splitting them
 * across two files would only invite one to be moved without the other.
 */
const SEAL_KEYFRAMES = `
@keyframes sealSplitLeft {
  0%   { transform: translateX(0) rotate(0deg); opacity: 1; }
  18%  { transform: translateX(-2px) rotate(-1.5deg); }
  100% { transform: translateX(-38px) rotate(-16deg); opacity: 0; }
}
@keyframes sealSplitRight {
  0%   { transform: translateX(0) rotate(0deg); opacity: 1; }
  18%  { transform: translateX(2px) rotate(1.5deg); }
  100% { transform: translateX(38px) rotate(16deg); opacity: 0; }
}
@keyframes sealFlare {
  0%   { opacity: 0; transform: scale(0.7); }
  22%  { opacity: 1; transform: scale(1.18); }
  100% { opacity: 0; transform: scale(1.5); }
}
@keyframes sealSpark {
  0%   { transform: translate(0, 0) scale(0.4) rotate(0deg); opacity: 0; }
  14%  { opacity: 1; }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(0.15) rotate(var(--spin));
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  /* The seal opens without the burst; see \`breakSeal\`. This is the backstop
     for anything that still manages to mount mid-animation. */
  [style*="sealSplit"], [style*="sealSpark"], [style*="sealFlare"] {
    animation: none !important;
  }
}
`;
