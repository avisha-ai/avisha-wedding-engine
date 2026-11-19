/**
 * store.ts — client-side persistence for the wedding document.
 * -----------------------------------------------------------------------------
 * Phase 1 has no backend. The couple's wedding lives in `localStorage` under a
 * single key; share links carry a trimmed copy encoded as a URL-safe token.
 *
 * Everything that enters from outside — storage, imported JSON, a `?w=` token —
 * goes through `parseWedding`, which rebuilds the document field by field and
 * drops anything it does not recognise. Nothing is ever `eval`'d or rendered as
 * HTML, so a hostile token can at worst produce an odd-looking page.
 *
 * Reading uses `useSyncExternalStore` rather than `useEffect` + `useState`:
 * the server snapshot is `null`, the client snapshot is the stored document,
 * and React reconciles the two without a hydration mismatch.
 */

import { useSyncExternalStore } from "react";

import { CHAPTER_ORDER } from "@/components/ceremony/ceremonyConfig";

import {
  RSVP_VALUES,
  VENDOR_STATUSES,
  type ChapterId,
  type Guest,
  type Household,
  type Rsvp,
  type Tradition,
  type Vendor,
  type VendorStatus,
  type Wedding,
  type WeddingEvent,
} from "./types";

/** The one localStorage key the planner owns. */
export const WEDDING_KEY = "avisha.wedding.v1";
/** Guest RSVPs given through a share link (not the couple's own copy). */
const LINK_RSVP_KEY = "avisha.linkRsvp.v1";
/** Same key the greeting card writes (sessionStorage). */
export const GUEST_NAME_KEY = "avisha.guestName";

/** Same-tab change notification; the `storage` event only fires cross-tab. */
const CHANGE_EVENT = "avisha:wedding-change";

/** Hard ceilings so a pasted token or file cannot balloon the page. */
const MAX_TOKEN_CHARS = 60_000;
const MAX_TEXT = 200;
const MAX_NOTES = 1_000;
const MAX_ITEMS = 500;

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max = MAX_TEXT): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function optStr(v: unknown, max = MAX_TEXT): string | undefined {
  const s = str(v, max).trim();
  return s ? s : undefined;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
}

function optNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function isChapter(v: unknown): v is ChapterId {
  return typeof v === "string" && (CHAPTER_ORDER as readonly string[]).includes(v);
}

function parseEvent(v: unknown): WeddingEvent | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  if (!id || !isChapter(v.chapter)) return null;
  const date = str(v.date, 10);
  const startTime = str(v.startTime, 5);
  return {
    id,
    chapter: v.chapter,
    title: str(v.title),
    date: DATE_RE.test(date) ? date : "",
    startTime: TIME_RE.test(startTime) ? startTime : "",
    venue: str(v.venue),
    notes: optStr(v.notes, MAX_NOTES),
  };
}

function parseGuest(v: unknown, eventIds: ReadonlySet<string>): Guest | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  if (!id) return null;
  const rsvp: Record<string, Rsvp> = {};
  if (isObj(v.rsvp)) {
    for (const [eventId, value] of Object.entries(v.rsvp)) {
      if (eventIds.has(eventId) && RSVP_VALUES.includes(value as Rsvp)) {
        rsvp[eventId] = value as Rsvp;
      }
    }
  }
  return {
    id,
    name: str(v.name),
    rsvp,
    dietary: optStr(v.dietary),
    needsRoom: v.needsRoom === true ? true : undefined,
    travel: optStr(v.travel),
  };
}

function parseHousehold(v: unknown, eventIds: ReadonlySet<string>): Household | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  if (!id) return null;
  return {
    id,
    name: str(v.name),
    city: str(v.city),
    notes: optStr(v.notes, MAX_NOTES),
    guests: arr(v.guests)
      .map((g) => parseGuest(g, eventIds))
      .filter((g): g is Guest => g !== null),
  };
}

function parseVendor(v: unknown, eventIds: ReadonlySet<string>): Vendor | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 64);
  if (!id) return null;
  const status = VENDOR_STATUSES.includes(v.status as VendorStatus)
    ? (v.status as VendorStatus)
    : "enquiry";
  return {
    id,
    name: str(v.name),
    category: str(v.category),
    eventIds: arr(v.eventIds).filter(
      (e): e is string => typeof e === "string" && eventIds.has(e),
    ),
    status,
    amount: optNum(v.amount),
    paid: optNum(v.paid),
  };
}

/** Rebuilds a wedding from untrusted input, or returns `null` if unusable. */
export function parseWedding(input: unknown): Wedding | null {
  if (!isObj(input) || !isObj(input.couple)) return null;
  const id = str(input.id, 64);
  if (!id) return null;
  const events = arr(input.events)
    .map(parseEvent)
    .filter((e): e is WeddingEvent => e !== null);
  const eventIds = new Set(events.map((e) => e.id));
  const tradition: Tradition | undefined =
    input.tradition === "hindu" || input.tradition === "jain" || input.tradition === "other"
      ? input.tradition
      : undefined;
  return {
    id,
    couple: {
      partnerA: str(input.couple.partnerA, 80),
      partnerB: str(input.couple.partnerB, 80),
    },
    tradition,
    events,
    households: arr(input.households)
      .map((h) => parseHousehold(h, eventIds))
      .filter((h): h is Household => h !== null),
    vendors: arr(input.vendors)
      .map((v) => parseVendor(v, eventIds))
      .filter((v): v is Vendor => v !== null),
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// localStorage
// -----------------------------------------------------------------------------

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(WEDDING_KEY);
  } catch {
    return null;
  }
}

/** Saves the wedding and notifies every `useStoredWedding` in this tab. */
export function saveWedding(wedding: Wedding): boolean {
  try {
    window.localStorage.setItem(WEDDING_KEY, JSON.stringify(wedding));
  } catch {
    return false; // Private mode or quota: the caller shows a notice.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

export function clearWedding(): void {
  try {
    window.localStorage.removeItem(WEDDING_KEY);
  } catch {
    // Nothing stored to clear.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Snapshot cache: `useSyncExternalStore` needs the same object back while the
// stored string is unchanged, or it re-renders forever.
let cachedRaw: string | null | undefined;
let cachedWedding: Wedding | null = null;

function getSnapshot(): Wedding | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedWedding = raw ? parseWedding(parseJson(raw)) : null;
  }
  return cachedWedding;
}

function getServerSnapshot(): Wedding | null {
  return null;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The couple's stored wedding (`null` on the server and when none exists). */
export function useStoredWedding(): Wedding | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function noopSubscribe(): () => void {
  return () => {};
}

/** `false` during SSR and hydration, `true` once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function readGuestName(): string {
  try {
    return window.sessionStorage.getItem(GUEST_NAME_KEY)?.trim().slice(0, 80) ?? "";
  } catch {
    return "";
  }
}

/** The name the greeting card stored for this tab, or `""`. */
export function useGuestName(): string {
  return useSyncExternalStore(noopSubscribe, readGuestName, () => "");
}

export function setGuestName(name: string): void {
  try {
    window.sessionStorage.setItem(GUEST_NAME_KEY, name.trim().slice(0, 80));
  } catch {
    // Storage refused; the greeting simply falls back.
  }
}

// -----------------------------------------------------------------------------
// Import / export
// -----------------------------------------------------------------------------

export function exportWeddingJson(wedding: Wedding): string {
  return JSON.stringify(wedding, null, 2);
}

/** Parses a pasted or uploaded JSON file. Returns `null` if it is not a wedding. */
export function importWeddingJson(text: string): Wedding | null {
  if (text.length > MAX_TOKEN_CHARS * 4) return null;
  return parseWedding(parseJson(text));
}

// -----------------------------------------------------------------------------
// Share tokens (`?w=`)
// -----------------------------------------------------------------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeWeddingToken(wedding: Wedding): string {
  return toBase64Url(JSON.stringify(wedding));
}

export function decodeWeddingToken(token: string | null | undefined): Wedding | null {
  if (!token || token.length > MAX_TOKEN_CHARS || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return null;
  }
  const json = fromBase64Url(token);
  return json ? parseWedding(parseJson(json)) : null;
}

/**
 * The slice of a wedding that is safe to put in a link.
 *
 * Without `guestId`: couple and events only (for the 3D preview) — no guests,
 * no vendors, no money. With `guestId`: additionally that one guest, inside
 * their household, and only the events they are invited to. Other guests'
 * names, diets and rooms never travel in someone else's link.
 */
export function publicWedding(wedding: Wedding, guestId?: string): Wedding {
  const base: Wedding = {
    id: wedding.id,
    couple: wedding.couple,
    tradition: wedding.tradition,
    // Notes are the couple's working notes, not guest copy: left out.
    events: wedding.events.map((e) => ({
      id: e.id,
      chapter: e.chapter,
      title: e.title,
      date: e.date,
      startTime: e.startTime,
      venue: e.venue,
    })),
    households: [],
    vendors: [],
  };
  if (!guestId) return base;
  const found = findGuest(wedding, guestId);
  if (!found) return base;
  const invited = new Set(Object.keys(found.guest.rsvp));
  return {
    ...base,
    events: base.events.filter((e) => invited.has(e.id)),
    households: [
      {
        id: found.household.id,
        name: found.household.name,
        city: found.household.city,
        guests: [
          { id: found.guest.id, name: found.guest.name, rsvp: found.guest.rsvp },
        ],
      },
    ],
  };
}

// -----------------------------------------------------------------------------
// Link RSVPs (a guest answering from a share link on their own phone)
// -----------------------------------------------------------------------------

type LinkRsvpMap = Record<string, Record<string, Rsvp>>;

function readLinkRsvps(): LinkRsvpMap {
  try {
    const parsed = parseJson(window.localStorage.getItem(LINK_RSVP_KEY) ?? "");
    return isObj(parsed) ? (parsed as LinkRsvpMap) : {};
  } catch {
    return {};
  }
}

/** RSVPs this device saved for a guest via a link, filtered to known values. */
export function loadLinkRsvp(weddingId: string, guestId: string): Record<string, Rsvp> {
  const entry = readLinkRsvps()[`${weddingId}:${guestId}`];
  const out: Record<string, Rsvp> = {};
  if (isObj(entry)) {
    for (const [k, v] of Object.entries(entry)) {
      if (RSVP_VALUES.includes(v as Rsvp)) out[k] = v as Rsvp;
    }
  }
  return out;
}

export function saveLinkRsvp(
  weddingId: string,
  guestId: string,
  rsvp: Record<string, Rsvp>,
): void {
  try {
    const all = readLinkRsvps();
    all[`${weddingId}:${guestId}`] = rsvp;
    window.localStorage.setItem(LINK_RSVP_KEY, JSON.stringify(all));
  } catch {
    // Not persisted; the page still shows the choice for this visit.
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${rand}`;
}

export function findGuest(
  wedding: Wedding,
  guestId: string,
): { household: Household; guest: Guest } | null {
  for (const household of wedding.households) {
    const guest = household.guests.find((g) => g.id === guestId);
    if (guest) return { household, guest };
  }
  return null;
}

/** Events in date/time order, then story order for ties. */
export function sortedEvents(events: readonly WeddingEvent[]): WeddingEvent[] {
  return [...events].sort(
    (a, b) =>
      (a.date || "9999").localeCompare(b.date || "9999") ||
      (a.startTime || "99").localeCompare(b.startTime || "99") ||
      CHAPTER_ORDER.indexOf(a.chapter) - CHAPTER_ORDER.indexOf(b.chapter),
  );
}

/** `2027-02-12` → `Fri, 12 Feb 2027`. Parsed as a calendar date, not UTC. */
export function formatDate(iso: string): string {
  if (!DATE_RE.test(iso)) return "Date to be announced";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `19:30` → `7:30 pm`. */
export function formatTime(hhmm: string): string {
  if (!TIME_RE.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatRupees(n: number | undefined): string {
  if (n === undefined) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}
