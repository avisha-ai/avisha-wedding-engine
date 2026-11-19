/**
 * types.ts — the shared wedding data model.
 * -----------------------------------------------------------------------------
 * One `Wedding` document is the single source of truth that the planner edits,
 * the ceremony overlay reads and the guest invite renders. Phase 1 keeps it on
 * the device (see `store.ts`); nothing here assumes a backend.
 *
 * Chapter ids are reused from `ceremonyConfig` (a pure data module, no three.js
 * imports) so a planner event can never name a chapter the 3D scene lacks.
 */

import type { ChapterId } from "@/components/ceremony/ceremonyConfig";

export type { ChapterId };

export type Tradition = "hindu" | "jain" | "other";

export type Rsvp = "yes" | "no" | "pending";

export const RSVP_VALUES: readonly Rsvp[] = ["yes", "no", "pending"];

export const RSVP_LABEL: Readonly<Record<Rsvp, string>> = {
  yes: "Attending",
  no: "Declined",
  pending: "Awaiting reply",
};

export type VendorStatus = "enquiry" | "booked" | "confirmed" | "cancelled";

export const VENDOR_STATUSES: readonly VendorStatus[] = [
  "enquiry",
  "booked",
  "confirmed",
  "cancelled",
];

export interface Couple {
  readonly partnerA: string;
  readonly partnerB: string;
}

export interface WeddingEvent {
  readonly id: string;
  /** Which 3D chapter this event is shown on. */
  readonly chapter: ChapterId;
  readonly title: string;
  /** ISO date, `YYYY-MM-DD`. */
  readonly date: string;
  /** 24-hour `HH:MM`. */
  readonly startTime: string;
  readonly venue: string;
  readonly notes?: string;
}

export interface Guest {
  readonly id: string;
  readonly name: string;
  /**
   * Keyed by event id. An event id present here means the guest is invited to
   * that event; absent means not invited.
   */
  readonly rsvp: Readonly<Record<string, Rsvp>>;
  readonly dietary?: string;
  readonly needsRoom?: boolean;
  readonly travel?: string;
}

export interface Household {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly notes?: string;
  readonly guests: readonly Guest[];
}

export interface Vendor {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly eventIds: readonly string[];
  readonly status: VendorStatus;
  /** Contract amount in rupees. */
  readonly amount?: number;
  /** Amount paid so far, in rupees. */
  readonly paid?: number;
}

export interface Wedding {
  readonly id: string;
  readonly couple: Couple;
  readonly tradition?: Tradition;
  readonly events: readonly WeddingEvent[];
  readonly households: readonly Household[];
  readonly vendors: readonly Vendor[];
}
