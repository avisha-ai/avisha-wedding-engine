"use client";

/**
 * sections.tsx — the planner's four tabs: Overview, Ceremonies, Guests, Vendors.
 * -----------------------------------------------------------------------------
 * Each section is a controlled form over the stored wedding. Every edit goes
 * through `update`, which saves to localStorage immediately — there is no
 * separate "save" step to forget.
 */

import type { JSX } from "react";

import {
  CEREMONY_SEQUENCE,
  CHAPTER_ORDER,
} from "@/components/ceremony/ceremonyConfig";
import {
  formatDate,
  formatRupees,
  formatTime,
  newId,
  sortedEvents,
} from "@/lib/wedding/store";
import {
  RSVP_LABEL,
  VENDOR_STATUSES,
  type ChapterId,
  type Guest,
  type Household,
  type Rsvp,
  type Tradition,
  type Vendor,
  type Wedding,
  type WeddingEvent,
} from "@/lib/wedding/types";

import { Button, C, Card, Field, Stat, inputClass } from "./ui";

export type Update = (fn: (w: Wedding) => Wedding) => void;

interface SectionProps {
  readonly wedding: Wedding;
  readonly update: Update;
}

const CHAPTER_TITLE: Record<string, string> = Object.fromEntries(
  CEREMONY_SEQUENCE.map((c) => [c.id, c.title]),
);

/** Per-chapter tags, after the design's per-ceremony colours. */
const CHAPTER_COLOUR: Record<ChapterId, string> = {
  proposal: "#8A2E4D",
  engagement: "#7A5F1E",
  mehendi: "#1B4D3E",
  sangeet: "#221C46",
  wedding: "#990000",
  reception: "#0B6E6E",
  legacy: "#5A4632",
};

function ChapterTag({ chapter }: { chapter: ChapterId }): JSX.Element {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs text-white"
      style={{ background: CHAPTER_COLOUR[chapter] }}
    >
      {CHAPTER_TITLE[chapter] ?? chapter}
    </span>
  );
}

function allGuests(w: Wedding): Guest[] {
  return w.households.flatMap((h) => h.guests);
}

// -----------------------------------------------------------------------------
// Overview
// -----------------------------------------------------------------------------

export function OverviewSection({ wedding, update }: SectionProps): JSX.Element {
  const guests = allGuests(wedding);
  const events = sortedEvents(wedding.events);
  const dated = events.filter((e) => e.date);
  const rooms = guests.filter((g) => g.needsRoom).length;
  const owed = wedding.vendors.reduce(
    (sum, v) => sum + Math.max(0, (v.amount ?? 0) - (v.paid ?? 0)),
    0,
  );

  return (
    <div className="flex flex-col gap-5">
      <Card title="The couple">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Partner A">
            <input
              className={inputClass}
              value={wedding.couple.partnerA}
              onChange={(e) =>
                update((w) => ({ ...w, couple: { ...w.couple, partnerA: e.target.value } }))
              }
            />
          </Field>
          <Field label="Partner B">
            <input
              className={inputClass}
              value={wedding.couple.partnerB}
              onChange={(e) =>
                update((w) => ({ ...w, couple: { ...w.couple, partnerB: e.target.value } }))
              }
            />
          </Field>
          <Field label="Tradition">
            <select
              className={inputClass}
              value={wedding.tradition ?? ""}
              onChange={(e) =>
                update((w) => ({
                  ...w,
                  tradition: (e.target.value || undefined) as Tradition | undefined,
                }))
              }
            >
              <option value="">Not set</option>
              <option value="hindu">Hindu</option>
              <option value="jain">Jain</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <p className="mt-3 text-sm" style={{ color: C.muted }}>
          {dated.length > 0
            ? `${formatDate(dated[0].date)} to ${formatDate(dated[dated.length - 1].date)}`
            : "No dates set yet."}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Ceremonies" value={wedding.events.length} />
        <Stat label="Households" value={wedding.households.length} />
        <Stat label="Guests" value={guests.length} />
        <Stat label="Rooms needed" value={rooms} />
        <Stat label="Still to pay" value={formatRupees(owed)} />
      </div>

      <Card title="Replies by ceremony">
        {events.length === 0 ? (
          <p className="text-sm" style={{ color: C.muted }}>
            Add a ceremony to start tracking replies.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" style={{ borderColor: C.line }}>
            {events.map((ev) => {
              const invited = guests.filter((g) => g.rsvp[ev.id]);
              const count = (r: Rsvp) => invited.filter((g) => g.rsvp[ev.id] === r).length;
              return (
                <li key={ev.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <ChapterTag chapter={ev.chapter} />
                  <span className="font-medium">{ev.title || "Untitled"}</span>
                  <span style={{ color: C.muted }}>
                    {invited.length} invited · {count("yes")} attending · {count("no")} declined
                    · {count("pending")} awaiting
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Ceremonies
// -----------------------------------------------------------------------------

export function CeremoniesSection({ wedding, update }: SectionProps): JSX.Element {
  const setEvent = (id: string, patch: Partial<WeddingEvent>) =>
    update((w) => ({
      ...w,
      events: w.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));

  const addEvent = () => {
    const used = new Set(wedding.events.map((e) => e.chapter));
    const chapter = CHAPTER_ORDER.find((c) => !used.has(c)) ?? "wedding";
    update((w) => ({
      ...w,
      events: [
        ...w.events,
        {
          id: newId("ev"),
          chapter,
          title: CHAPTER_TITLE[chapter] ?? "",
          date: "",
          startTime: "",
          venue: "",
        },
      ],
    }));
  };

  const removeEvent = (id: string, title: string) => {
    if (!window.confirm(`Remove "${title || "this ceremony"}"? Guests' replies for it are removed too.`)) return;
    update((w) => ({
      ...w,
      events: w.events.filter((e) => e.id !== id),
      households: w.households.map((h) => ({
        ...h,
        guests: h.guests.map((g) => {
          const rsvp = { ...g.rsvp };
          delete rsvp[id];
          return { ...g, rsvp };
        }),
      })),
      vendors: w.vendors.map((v) => ({ ...v, eventIds: v.eventIds.filter((e) => e !== id) })),
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="primary" onClick={addEvent}>
          + Add ceremony
        </Button>
      </div>
      {sortedEvents(wedding.events).map((ev) => (
        <Card
          key={ev.id}
          title={ev.title || "Untitled ceremony"}
          actions={
            <Button variant="danger" onClick={() => removeEvent(ev.id, ev.title)}>
              Remove
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Title">
              <input
                className={inputClass}
                value={ev.title}
                onChange={(e) => setEvent(ev.id, { title: e.target.value })}
              />
            </Field>
            <Field label="3D chapter">
              <select
                className={inputClass}
                value={ev.chapter}
                onChange={(e) => setEvent(ev.id, { chapter: e.target.value as ChapterId })}
              >
                {CHAPTER_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CHAPTER_TITLE[c] ?? c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Venue">
              <input
                className={inputClass}
                value={ev.venue}
                onChange={(e) => setEvent(ev.id, { venue: e.target.value })}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={ev.date}
                onChange={(e) => setEvent(ev.id, { date: e.target.value })}
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                className={inputClass}
                value={ev.startTime}
                onChange={(e) => setEvent(ev.id, { startTime: e.target.value })}
              />
            </Field>
            <Field label="Notes (not shown to guests)">
              <input
                className={inputClass}
                value={ev.notes ?? ""}
                onChange={(e) => setEvent(ev.id, { notes: e.target.value || undefined })}
              />
            </Field>
          </div>
          <p className="mt-3 text-sm" style={{ color: C.muted }}>
            <ChapterTag chapter={ev.chapter} /> {formatDate(ev.date)}
            {ev.startTime ? ` · ${formatTime(ev.startTime)}` : ""}
          </p>
        </Card>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Guests
// -----------------------------------------------------------------------------

export function GuestsSection({
  wedding,
  update,
  onCopyLink,
}: SectionProps & { onCopyLink: (guest: Guest) => void }): JSX.Element {
  const events = sortedEvents(wedding.events);

  const setHousehold = (id: string, patch: Partial<Household>) =>
    update((w) => ({
      ...w,
      households: w.households.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));

  const setGuest = (hid: string, gid: string, patch: Partial<Guest>) =>
    update((w) => ({
      ...w,
      households: w.households.map((h) =>
        h.id === hid
          ? { ...h, guests: h.guests.map((g) => (g.id === gid ? { ...g, ...patch } : g)) }
          : h,
      ),
    }));

  const setInvite = (hid: string, guest: Guest, eventId: string, value: string) => {
    const rsvp = { ...guest.rsvp };
    if (value === "") delete rsvp[eventId];
    else rsvp[eventId] = value as Rsvp;
    setGuest(hid, guest.id, { rsvp });
  };

  const addHousehold = () =>
    update((w) => ({
      ...w,
      households: [...w.households, { id: newId("hh"), name: "New household", city: "", guests: [] }],
    }));

  const addGuest = (hid: string) =>
    update((w) => ({
      ...w,
      households: w.households.map((h) =>
        h.id === hid
          ? {
              ...h,
              guests: [
                ...h.guests,
                {
                  id: newId("g"),
                  name: "",
                  // Invited to every ceremony by default; untick per guest.
                  rsvp: Object.fromEntries(w.events.map((e) => [e.id, "pending" as Rsvp])),
                },
              ],
            }
          : h,
      ),
    }));

  const removeHousehold = (h: Household) => {
    if (!window.confirm(`Remove the ${h.name || "household"} household and its ${h.guests.length} guest(s)?`)) return;
    update((w) => ({ ...w, households: w.households.filter((x) => x.id !== h.id) }));
  };

  const removeGuest = (hid: string, g: Guest) => {
    if (!window.confirm(`Remove ${g.name || "this guest"}?`)) return;
    update((w) => ({
      ...w,
      households: w.households.map((h) =>
        h.id === hid ? { ...h, guests: h.guests.filter((x) => x.id !== g.id) } : h,
      ),
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="primary" onClick={addHousehold}>
          + Add household
        </Button>
      </div>

      {wedding.households.map((h) => (
        <Card
          key={h.id}
          title={`${h.name || "Household"}${h.city ? `, ${h.city}` : ""}`}
          actions={
            <>
              <Button onClick={() => addGuest(h.id)}>+ Add guest</Button>
              <Button variant="danger" onClick={() => removeHousehold(h)}>
                Remove household
              </Button>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Household name">
              <input
                className={inputClass}
                value={h.name}
                onChange={(e) => setHousehold(h.id, { name: e.target.value })}
              />
            </Field>
            <Field label="City">
              <input
                className={inputClass}
                value={h.city}
                onChange={(e) => setHousehold(h.id, { city: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <input
                className={inputClass}
                value={h.notes ?? ""}
                onChange={(e) => setHousehold(h.id, { notes: e.target.value || undefined })}
              />
            </Field>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {h.guests.map((g) => (
              <li key={g.id} className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Guest name">
                    <input
                      className={inputClass}
                      value={g.name}
                      onChange={(e) => setGuest(h.id, g.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Dietary">
                    <input
                      className={inputClass}
                      value={g.dietary ?? ""}
                      onChange={(e) => setGuest(h.id, g.id, { dietary: e.target.value || undefined })}
                    />
                  </Field>
                  <Field label="Travel">
                    <input
                      className={inputClass}
                      value={g.travel ?? ""}
                      onChange={(e) => setGuest(h.id, g.id, { travel: e.target.value || undefined })}
                    />
                  </Field>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[#7A5F1E]"
                      checked={g.needsRoom === true}
                      onChange={(e) => setGuest(h.id, g.id, { needsRoom: e.target.checked || undefined })}
                    />
                    Needs a room
                  </label>
                </div>

                {events.length > 0 && (
                  <fieldset className="mt-3">
                    <legend className="mb-2 text-sm" style={{ color: C.muted }}>
                      Invitations and replies
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {events.map((ev) => (
                        <Field key={ev.id} label={ev.title || CHAPTER_TITLE[ev.chapter] || "Ceremony"}>
                          <select
                            className={inputClass}
                            value={g.rsvp[ev.id] ?? ""}
                            onChange={(e) => setInvite(h.id, g, ev.id, e.target.value)}
                          >
                            <option value="">Not invited</option>
                            <option value="pending">{RSVP_LABEL.pending}</option>
                            <option value="yes">{RSVP_LABEL.yes}</option>
                            <option value="no">{RSVP_LABEL.no}</option>
                          </select>
                        </Field>
                      ))}
                    </div>
                  </fieldset>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => onCopyLink(g)} disabled={!g.name.trim()}>
                    Copy guest link
                  </Button>
                  <a
                    href={`/invite/${encodeURIComponent(g.id)}`}
                    className="inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm underline-offset-2 hover:underline"
                    style={{ borderColor: C.line, color: C.accentText }}
                  >
                    Open invite
                  </a>
                  <Button variant="danger" onClick={() => removeGuest(h.id, g)}>
                    Remove guest
                  </Button>
                </div>
              </li>
            ))}
            {h.guests.length === 0 && (
              <li className="text-sm" style={{ color: C.muted }}>
                No guests in this household yet.
              </li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Vendors
// -----------------------------------------------------------------------------

function paymentLabel(v: Vendor): string {
  if (v.amount === undefined) return "No quote yet";
  const paid = v.paid ?? 0;
  if (paid >= v.amount) return "Paid in full";
  if (paid > 0) return `Part paid, ${formatRupees(v.amount - paid)} due`;
  return `Unpaid, ${formatRupees(v.amount)} due`;
}

function parseAmount(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function VendorsSection({ wedding, update }: SectionProps): JSX.Element {
  const events = sortedEvents(wedding.events);

  const setVendor = (id: string, patch: Partial<Vendor>) =>
    update((w) => ({
      ...w,
      vendors: w.vendors.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));

  const addVendor = () =>
    update((w) => ({
      ...w,
      vendors: [
        ...w.vendors,
        { id: newId("v"), name: "", category: "", eventIds: [], status: "enquiry" },
      ],
    }));

  const removeVendor = (v: Vendor) => {
    if (!window.confirm(`Remove ${v.name || "this vendor"}?`)) return;
    update((w) => ({ ...w, vendors: w.vendors.filter((x) => x.id !== v.id) }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="primary" onClick={addVendor}>
          + Add vendor
        </Button>
      </div>
      {wedding.vendors.map((v) => (
        <Card
          key={v.id}
          title={v.name || "New vendor"}
          actions={
            <Button variant="danger" onClick={() => removeVendor(v)}>
              Remove
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Name">
              <input
                className={inputClass}
                value={v.name}
                onChange={(e) => setVendor(v.id, { name: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <input
                className={inputClass}
                value={v.category}
                onChange={(e) => setVendor(v.id, { category: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={v.status}
                onChange={(e) => setVendor(v.id, { status: e.target.value as Vendor["status"] })}
              >
                {VENDOR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (₹)">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className={inputClass}
                value={v.amount ?? ""}
                onChange={(e) => setVendor(v.id, { amount: parseAmount(e.target.value) })}
              />
            </Field>
            <Field label="Paid (₹)">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className={inputClass}
                value={v.paid ?? ""}
                onChange={(e) => setVendor(v.id, { paid: parseAmount(e.target.value) })}
              />
            </Field>
          </div>

          {events.length > 0 && (
            <fieldset className="mt-3">
              <legend className="mb-2 text-sm" style={{ color: C.muted }}>
                Working at
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {events.map((ev) => (
                  <label key={ev.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[#7A5F1E]"
                      checked={v.eventIds.includes(ev.id)}
                      onChange={(e) =>
                        setVendor(v.id, {
                          eventIds: e.target.checked
                            ? [...v.eventIds, ev.id]
                            : v.eventIds.filter((x) => x !== ev.id),
                        })
                      }
                    />
                    {ev.title || CHAPTER_TITLE[ev.chapter]}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <p className="mt-3 text-sm font-medium" style={{ color: C.text }}>
            {paymentLabel(v)}
          </p>
        </Card>
      ))}
    </div>
  );
}
