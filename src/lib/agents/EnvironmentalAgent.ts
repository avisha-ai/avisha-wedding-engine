/**
 * EnvironmentalAgent — colour temperature alignment, fabric weight, floral decay.
 *
 * Reads the *target* colour temperature straight from the active chapter's
 * lighting profile, so switching chapters can flag a colour-temp drift if the
 * rig hasn't been re-aligned — a direct reaction to ceremony state changes.
 */

import { CEREMONY_CHAPTERS } from "@/components/ceremony/ceremonyConfig";
import {
  BaseAgent,
  type CeremonyStateSnapshot,
  type MessageDraft,
} from "./types";

export class EnvironmentalAgent extends BaseAgent {
  readonly id = "environmental" as const;
  readonly domain = "environment" as const;
  readonly label = "Environmental — colour, fabric & florals";

  evaluate(state: CeremonyStateSnapshot): MessageDraft[] {
    const { chapter } = state;
    const { environment } = state.params;
    const issues: MessageDraft[] = [];

    // Colour temperature: compare the rig against the chapter's target Kelvin.
    const targetK = CEREMONY_CHAPTERS[chapter].lighting.temperatureK;
    const driftK = Math.abs(environment.colorTempK - targetK);
    if (driftK > 900) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "critical",
          code: "COLOR_TEMP_DRIFT",
          summary: `Colour temp ${environment.colorTempK}K is ${driftK}K off the ${targetK}K target for this chapter.`,
          chapter,
          parameter: "environment.colorTempK",
          value: environment.colorTempK,
          limit: targetK,
        }),
      );
    } else if (driftK > 400) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "warning",
          code: "COLOR_TEMP_MISALIGNED",
          summary: `Colour temp ${environment.colorTempK}K drifting from ${targetK}K target (${driftK}K).`,
          chapter,
          parameter: "environment.colorTempK",
          value: environment.colorTempK,
          limit: targetK,
        }),
      );
    }

    // Floral decay.
    if (environment.floralFreshness < 0.15) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "critical",
          code: "FLORAL_WILT",
          summary: `Florals wilted (freshness ${environment.floralFreshness.toFixed(2)}); replacement required.`,
          chapter,
          parameter: "environment.floralFreshness",
          value: environment.floralFreshness,
          limit: 0.15,
        }),
      );
    } else if (environment.floralFreshness < 0.4) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "warning",
          code: "FLORAL_DECAY",
          summary: `Floral freshness low (${environment.floralFreshness.toFixed(2)}).`,
          chapter,
          parameter: "environment.floralFreshness",
          value: environment.floralFreshness,
          limit: 0.4,
        }),
      );
    }

    return this.finalize(
      chapter,
      "Colour temperature aligned; fabric and florals nominal.",
      issues,
    );
  }
}
