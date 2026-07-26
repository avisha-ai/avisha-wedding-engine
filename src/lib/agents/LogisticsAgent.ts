/**
 * LogisticsAgent — venue parameters, structural + rigging load, electrical draw.
 *
 * Owns the venue's physical bounds, so it is the agent that flags a *conflict*
 * when another domain's load (e.g. Environmental's suspended fabric) breaks
 * those bounds.
 */

import {
  BaseAgent,
  type CeremonyStateSnapshot,
  type MessageDraft,
} from "./types";

export class LogisticsAgent extends BaseAgent {
  readonly id = "logistics" as const;
  readonly domain = "venue" as const;
  readonly label = "Logistics — venue, rigging & power";

  evaluate(state: CeremonyStateSnapshot): MessageDraft[] {
    const { chapter } = state;
    const { venue, environment } = state.params;
    const issues: MessageDraft[] = [];

    // Rigging: suspended fabric hangs from the rig.
    if (environment.fabricWeightKg > venue.maxRiggingLoadKg) {
      issues.push(
        this.draft({
          kind: "conflict",
          severity: "critical",
          code: "RIGGING_OVERLOAD",
          summary: `Suspended fabric ${environment.fabricWeightKg}kg exceeds rigging limit ${venue.maxRiggingLoadKg}kg.`,
          chapter,
          parameter: "environment.fabricWeightKg",
          value: environment.fabricWeightKg,
          limit: venue.maxRiggingLoadKg,
          related: ["environmental"],
        }),
      );
    } else if (environment.fabricWeightKg > venue.maxRiggingLoadKg * 0.85) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "warning",
          code: "RIGGING_NEAR_LIMIT",
          summary: `Rigging load at ${Math.round(
            (environment.fabricWeightKg / venue.maxRiggingLoadKg) * 100,
          )}% of limit.`,
          chapter,
          parameter: "environment.fabricWeightKg",
          value: environment.fabricWeightKg,
          limit: venue.maxRiggingLoadKg,
          related: ["environmental"],
        }),
      );
    }

    // Structural: total suspended load against the venue's structural bound.
    if (environment.fabricWeightKg > venue.maxStructuralLoadKg) {
      issues.push(
        this.draft({
          kind: "conflict",
          severity: "critical",
          code: "STRUCTURAL_OVERLOAD",
          summary: `Load ${environment.fabricWeightKg}kg breaks structural venue bound ${venue.maxStructuralLoadKg}kg.`,
          chapter,
          parameter: "environment.fabricWeightKg",
          value: environment.fabricWeightKg,
          limit: venue.maxStructuralLoadKg,
          related: ["environmental"],
        }),
      );
    }

    // Electrical draw against capacity.
    if (venue.powerDrawKw > venue.powerCapacityKw) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "critical",
          code: "POWER_OVERLOAD",
          summary: `Power draw ${venue.powerDrawKw}kW exceeds capacity ${venue.powerCapacityKw}kW.`,
          chapter,
          parameter: "venue.powerDrawKw",
          value: venue.powerDrawKw,
          limit: venue.powerCapacityKw,
        }),
      );
    } else if (venue.powerDrawKw > venue.powerCapacityKw * 0.9) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "warning",
          code: "POWER_NEAR_LIMIT",
          summary: `Power draw at ${Math.round(
            (venue.powerDrawKw / venue.powerCapacityKw) * 100,
          )}% of capacity.`,
          chapter,
          parameter: "venue.powerDrawKw",
          value: venue.powerDrawKw,
          limit: venue.powerCapacityKw,
        }),
      );
    }

    return this.finalize(
      chapter,
      "Venue loads, rigging, and power within tolerance.",
      issues,
    );
  }
}
