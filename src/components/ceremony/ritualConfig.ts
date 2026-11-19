/**
 * ritualConfig.ts — every ritual label the ceremony shows, in one place.
 *
 * MRINAL, PLEASE REVIEW THIS WORDING (and ideally a family elder / pandit for
 * each tradition). It is kept deliberately generic: Avi did not want to invent
 * specifics it is unsure of. Edit freely — nothing else depends on the text.
 */

import type { Tradition } from "@/lib/wedding/types";

export interface RitualSet {
  /** Heading shown during the rounds around the fire. */
  readonly roundsTitle: string;
  /** One short line per round (7). Empty strings show only "Round n of 7". */
  readonly rounds: readonly string[];
  /** Shown after the seventh round. */
  readonly complete: string;
  /** Show the small kalash (one of the ashtamangala) by the mandap. */
  readonly kalash: boolean;
}

export const RITUALS: Readonly<Record<Tradition, RitualSet>> = {
  hindu: {
    roundsTitle: "Saptapadi · the seven pheras",
    // Commonly described meanings of the seven vows; wording varies by family.
    rounds: [
      "For nourishment and a home that never wants",
      "For strength, health and courage",
      "For prosperity, shared honestly",
      "For love, respect and family harmony",
      "For children and the family to come",
      "For a long life together, through every season",
      "For lifelong friendship and loyalty",
    ],
    complete: "Seven pheras complete",
    kalash: false,
  },
  jain: {
    // Mangal pheras. Avi has NOT written per-round meanings: please add them
    // (and check the number of rounds your family follows) before guests see it.
    roundsTitle: "Mangal pheras",
    rounds: ["", "", "", "", "", "", ""],
    complete: "Mangal pheras complete",
    kalash: true,
  },
  other: {
    roundsTitle: "The rounds around the fire",
    rounds: ["", "", "", "", "", "", ""],
    complete: "The rounds are complete",
    kalash: false,
  },
};

/** Seconds per round, rounds per cycle and the rest between cycles. */
export const PHERA_TIMING = { round: 12, rounds: 7, rest: 10 } as const;

/** Shared epoch (performance.now seconds) for the 3D pheras and the DOM label. */
export const pheraClock = { epoch: 0 };

/** 1..7 while walking, 0 while resting between cycles. */
export function pheraRound(nowSec: number): number {
  const cycle = PHERA_TIMING.round * PHERA_TIMING.rounds + PHERA_TIMING.rest;
  const k = (nowSec - pheraClock.epoch) % cycle;
  return k < PHERA_TIMING.round * PHERA_TIMING.rounds ? Math.floor(k / PHERA_TIMING.round) + 1 : 0;
}
