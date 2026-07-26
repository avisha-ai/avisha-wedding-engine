/**
 * HospitalityAgent — guest-count volatility, dietary limits, spatial routing.
 *
 * Guest capacity and egress clearance are ultimately venue constraints, so
 * breaches here are raised as conflicts that reference the Logistics agent.
 */

import {
  BaseAgent,
  type CeremonyStateSnapshot,
  type MessageDraft,
} from "./types";

export class HospitalityAgent extends BaseAgent {
  readonly id = "hospitality" as const;
  readonly domain = "hospitality" as const;
  readonly label = "Hospitality — guests, dietary & routing";

  evaluate(state: CeremonyStateSnapshot): MessageDraft[] {
    const { chapter } = state;
    const { hospitality } = state.params;
    const issues: MessageDraft[] = [];

    // Guest count vs venue capacity.
    if (hospitality.guestCount > hospitality.guestCapacity) {
      issues.push(
        this.draft({
          kind: "conflict",
          severity: "critical",
          code: "OVER_CAPACITY",
          summary: `Guest count ${hospitality.guestCount} exceeds venue capacity ${hospitality.guestCapacity}.`,
          chapter,
          parameter: "hospitality.guestCount",
          value: hospitality.guestCount,
          limit: hospitality.guestCapacity,
          related: ["logistics"],
        }),
      );
    } else if (hospitality.guestCount > hospitality.guestCapacity * 0.9) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "warning",
          code: "CAPACITY_NEAR_LIMIT",
          summary: `Guest count at ${Math.round(
            (hospitality.guestCount / hospitality.guestCapacity) * 100,
          )}% of capacity.`,
          chapter,
          parameter: "hospitality.guestCount",
          value: hospitality.guestCount,
          limit: hospitality.guestCapacity,
          related: ["logistics"],
        }),
      );
    }

    // Dietary coverage.
    if (hospitality.dietaryUnmetCount > 0) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "warning",
          code: "DIETARY_UNMET",
          summary: `${hospitality.dietaryUnmetCount} guest(s) with unmet dietary requirements.`,
          chapter,
          parameter: "hospitality.dietaryUnmetCount",
          value: hospitality.dietaryUnmetCount,
          limit: 0,
        }),
      );
    }

    // Egress / routing clearance (a fire-safety venue constraint).
    if (hospitality.routingClearanceM < hospitality.minClearanceM) {
      issues.push(
        this.draft({
          kind: "conflict",
          severity: "critical",
          code: "EGRESS_CLEARANCE",
          summary: `Aisle clearance ${hospitality.routingClearanceM}m below minimum ${hospitality.minClearanceM}m.`,
          chapter,
          parameter: "hospitality.routingClearanceM",
          value: hospitality.routingClearanceM,
          limit: hospitality.minClearanceM,
          related: ["logistics"],
        }),
      );
    }

    return this.finalize(
      chapter,
      "Guest load, dietary coverage, and routing within limits.",
      issues,
    );
  }
}
