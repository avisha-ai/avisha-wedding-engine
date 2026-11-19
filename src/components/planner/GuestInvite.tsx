"use client";

/**
 * GuestInvite.tsx — a single guest's invitation page.
 * -----------------------------------------------------------------------------
 * The wedding comes from the link's `?w=` token (a guest on their own phone) or,
 * failing that, the planner copy on this device (the couple testing a link).
 *
 * Replies are DEMO ONLY in Phase 1: they are kept in this browser and never
 * sent to the couple. On the couple's own device they also update the planner.
 */

import { useMemo, useState, type JSX } from "react";

import { coupleNames } from "@/lib/branding";
import {
  decodeWeddingToken,
  findGuest,
  formatDate,
  formatTime,
  loadLinkRsvp,
  saveLinkRsvp,
  saveWedding,
  setGuestName,
  sortedEvents,
  useHydrated,
  useStoredWedding,
} from "@/lib/wedding/store";
import { RSVP_LABEL, type Guest, type Rsvp, type Wedding } from "@/lib/wedding/types";

import { BODY_FONT, Button, C, HEADING_FONT } from "./ui";

export interface GuestInviteProps {
  readonly guestId: string;
  readonly token?: string;
}

export default function GuestInvite({ guestId, token }: GuestInviteProps): JSX.Element {
  const hydrated = useHydrated();
  const linked = useMemo(() => decodeWeddingToken(token), [token]);
  const stored = useStoredWedding();
  const wedding = linked ?? stored;
  const found = wedding ? findGuest(wedding, guestId) : null;

  return (
    <main
      className="min-h-screen w-full px-5 py-10"
      style={{ background: C.ivory, color: C.text, fontFamily: BODY_FONT }}
    >
      <div className="mx-auto max-w-xl">
        {!hydrated ? (
          <p style={{ color: C.muted }}>Opening your invitation…</p>
        ) : !wedding || !found ? (
          <section>
            <h1 className="text-3xl" style={{ fontFamily: HEADING_FONT }}>
              Invitation not found
            </h1>
            <p className="mt-3" style={{ color: C.muted }}>
              This link may be incomplete. Please ask the couple to send it again.
            </p>
          </section>
        ) : (
          <InviteBody
            wedding={wedding}
            guest={found.guest}
            fromLink={linked !== null}
            token={token}
          />
        )}
      </div>
    </main>
  );
}

function InviteBody({
  wedding,
  guest,
  fromLink,
  token,
}: {
  wedding: Wedding;
  guest: Guest;
  fromLink: boolean;
  token?: string;
}): JSX.Element {
  const names = coupleNames(wedding);
  const events = sortedEvents(wedding.events.filter((e) => guest.rsvp[e.id]));

  // Mounted only after hydration, so reading storage in the initialiser is safe.
  const [rsvp, setRsvp] = useState<Record<string, Rsvp>>(() =>
    fromLink ? { ...guest.rsvp, ...loadLinkRsvp(wedding.id, guest.id) } : { ...guest.rsvp },
  );
  const [saved, setSaved] = useState(false);

  const choose = (eventId: string, value: Rsvp) => {
    const next = { ...rsvp, [eventId]: value };
    setRsvp(next);
    setSaved(false);
  };

  const save = () => {
    if (fromLink) {
      saveLinkRsvp(wedding.id, guest.id, rsvp);
    } else {
      // The couple's own device: write the reply into the planner copy.
      saveWedding({
        ...wedding,
        households: wedding.households.map((h) => ({
          ...h,
          guests: h.guests.map((g) => (g.id === guest.id ? { ...g, rsvp } : g)),
        })),
      });
    }
    setSaved(true);
  };

  const enterCeremony = () => {
    setGuestName(guest.name);
    // The link's token holds only this guest's events, so the 3D shows just those.
    window.location.href = fromLink && token ? `/ceremony?w=${token}` : "/ceremony";
  };

  return (
    <article>
      <p className="text-xs uppercase tracking-[0.2em]" style={{ color: C.accentText }}>
        The wedding of {names.pair}
      </p>
      <h1 className="mt-2 text-4xl leading-tight" style={{ fontFamily: HEADING_FONT }}>
        Welcome, {guest.name || "dear guest"}
      </h1>
      <div aria-hidden className="my-6 h-px w-24" style={{ background: C.accent }} />

      {events.length === 0 ? (
        <p style={{ color: C.muted }}>No ceremonies are listed for you yet.</p>
      ) : (
        <>
          <p style={{ color: C.muted }}>You are invited to:</p>
          <ul className="mt-4 flex flex-col gap-4">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border p-4"
                style={{ background: C.surface, borderColor: C.line }}
              >
                <h2 className="text-xl" style={{ fontFamily: HEADING_FONT }}>
                  {ev.title}
                </h2>
                <p className="mt-1 text-sm">
                  {formatDate(ev.date)}
                  {ev.startTime ? ` · ${formatTime(ev.startTime)}` : ""}
                </p>
                {ev.venue && <p className="text-sm" style={{ color: C.muted }}>{ev.venue}</p>}

                <fieldset className="mt-3">
                  <legend className="mb-2 text-sm" style={{ color: C.muted }}>
                    Your reply
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(["yes", "no", "pending"] as const).map((value) => (
                      <label
                        key={value}
                        className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border bg-white px-3 text-sm"
                        style={{ borderColor: rsvp[ev.id] === value ? C.accentText : C.line }}
                      >
                        <input
                          type="radio"
                          name={`rsvp-${ev.id}`}
                          value={value}
                          checked={rsvp[ev.id] === value}
                          onChange={() => choose(ev.id, value)}
                          className="accent-[#7A5F1E]"
                        />
                        {value === "pending" ? "Not sure yet" : RSVP_LABEL[value]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={save}>
              Save my replies
            </Button>
            <span role="status" aria-live="polite" className="text-sm" style={{ color: C.accentText }}>
              {saved ? "Saved on this device." : ""}
            </span>
          </div>
          <p
            className="mt-3 rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: C.line, background: "#FFF8E6" }}
          >
            Demo: replies are not sent anywhere yet. They stay in this browser only.
          </p>
        </>
      )}

      <div className="mt-8">
        <Button onClick={enterCeremony}>Enter the 3D ceremony</Button>
        <p className="mt-2 text-xs" style={{ color: C.muted }}>
          The 3D view needs a recent phone or computer. Everything you need is on this page.
        </p>
      </div>
    </article>
  );
}
