"use client";

/**
 * CeremonyExperience.tsx
 * -----------------------------------------------------------------------------
 * The 3D ceremony plus the planner's real details for each chapter.
 *
 * The wedding comes from a `?w=` share token when one is present and valid,
 * else from the couple's planner copy in localStorage. With neither, this
 * renders the canvas exactly as before and the event card stays hidden.
 *
 * The event card is DOM over the canvas (same reasoning as
 * `InvitationOverlay`): text, real semantics, and `aria-live` so screen readers
 * hear the new chapter's details when the scene moves on.
 */

import { useMemo, useState, type JSX } from "react";

import { coupleNames } from "@/lib/branding";
import {
  decodeWeddingToken,
  formatDate,
  formatTime,
  sortedEvents,
  useGuestName,
  useStoredWedding,
} from "@/lib/wedding/store";

import CeremonyCanvasClient from "./CeremonyCanvasClient";
import { CEREMONY_SEQUENCE, type ChapterId } from "./ceremonyConfig";

export interface CeremonyExperienceProps {
  /** Raw `?w=` value from the URL, if any. Validated here. */
  readonly token?: string;
}

const GOLD = "#C8A24B";
const IVORY = "#FDFBF7";

export default function CeremonyExperience({
  token,
}: CeremonyExperienceProps): JSX.Element {
  const linked = useMemo(() => decodeWeddingToken(token), [token]);
  const stored = useStoredWedding();
  const wedding = linked ?? stored;
  const guestName = useGuestName();
  const [chapter, setChapter] = useState<ChapterId>("proposal");

  const couple = wedding ? coupleNames(wedding) : undefined;
  const events = wedding
    ? sortedEvents(wedding.events.filter((e) => e.chapter === chapter))
    : [];
  const chapterTitle =
    CEREMONY_SEQUENCE.find((c) => c.id === chapter)?.title ?? chapter;

  return (
    <>
      <CeremonyCanvasClient
        initialChapter="proposal"
        onChapterChange={setChapter}
        couple={couple}
        tradition={wedding?.tradition}
      />

      {wedding && (
        <aside
          aria-label="Event details"
          aria-live="polite"
          style={{
            position: "absolute",
            top: "4.5rem",
            left: "1rem",
            maxWidth: "min(20rem, calc(100vw - 2rem))",
            padding: "1rem 1.15rem",
            borderRadius: "14px",
            background: "rgba(26, 27, 75, 0.62)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: `1px solid ${GOLD}55`,
            color: IVORY,
            fontFamily: "var(--font-barlow), system-ui, sans-serif",
            pointerEvents: "auto",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            {guestName ? `Welcome, ${guestName}` : couple?.short}
          </p>

          {events.length === 0 ? (
            <p style={{ margin: "0.6rem 0 0", fontSize: "0.9rem", opacity: 0.8 }}>
              {chapterTitle}: no event planned for this chapter.
            </p>
          ) : (
            events.map((e) => (
              <div key={e.id} style={{ marginTop: "0.65rem" }}>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-marcellus), Georgia, serif",
                    fontSize: "1.3rem",
                    fontWeight: 400,
                    lineHeight: 1.2,
                  }}
                >
                  {e.title || chapterTitle}
                </h2>
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.9rem" }}>
                  {formatDate(e.date)}
                  {e.startTime ? ` · ${formatTime(e.startTime)}` : ""}
                </p>
                {e.venue && (
                  <p style={{ margin: "0.15rem 0 0", fontSize: "0.9rem", opacity: 0.85 }}>
                    {e.venue}
                  </p>
                )}
              </div>
            ))
          )}
        </aside>
      )}
    </>
  );
}
