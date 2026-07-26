/**
 * CurationAgent — asset ingestion metadata pipeline + storytelling timeline tags.
 *
 * Watches the ingestion backlog and the chronological tag coverage, flagging
 * when the active chapter has no story tag or when required tags are missing.
 */

import {
  BaseAgent,
  type CeremonyStateSnapshot,
  type MessageDraft,
} from "./types";

export class CurationAgent extends BaseAgent {
  readonly id = "curation" as const;
  readonly domain = "curation" as const;
  readonly label = "Curation — asset pipeline & timeline";

  evaluate(state: CeremonyStateSnapshot): MessageDraft[] {
    const { chapter } = state;
    const { curation } = state.params;
    const issues: MessageDraft[] = [];

    // Ingestion backlog: tagged should keep pace with ingested.
    const untagged = curation.assetsIngested - curation.assetsTagged;
    if (untagged > 0) {
      const heavy = untagged > curation.assetsIngested * 0.25;
      issues.push(
        this.draft({
          kind: "validation",
          severity: heavy ? "warning" : "info",
          code: "ASSET_UNTAGGED_BACKLOG",
          summary: `${untagged} ingested asset(s) awaiting metadata tags.`,
          chapter,
          parameter: "curation.assetsTagged",
          value: curation.assetsTagged,
          limit: curation.assetsIngested,
        }),
      );
    }

    // Required tags must all be present.
    const missing = curation.requiredTags.filter(
      (tag) => !curation.timelineTags.includes(tag),
    );
    if (missing.length > 0) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "warning",
          code: "MISSING_TIMELINE_TAG",
          summary: `Missing required timeline tag(s): ${missing.join(", ")}.`,
          chapter,
          parameter: "curation.timelineTags",
          value: curation.timelineTags.join(","),
          limit: curation.requiredTags.join(","),
        }),
      );
    }

    // The active chapter should carry a chronological story tag.
    if (!curation.timelineTags.includes(chapter)) {
      issues.push(
        this.draft({
          kind: "info",
          severity: "info",
          code: "CHAPTER_UNTAGGED",
          summary: `Active chapter "${chapter}" has no story tag yet.`,
          chapter,
          parameter: "curation.timelineTags",
          value: chapter,
        }),
      );
    }

    // Duplicate tags break the single-source chronology.
    const seen = new Set<string>();
    const dupes = curation.timelineTags.filter((tag) => {
      if (seen.has(tag)) return true;
      seen.add(tag);
      return false;
    });
    if (dupes.length > 0) {
      issues.push(
        this.draft({
          kind: "validation",
          severity: "warning",
          code: "DUPLICATE_TIMELINE_TAG",
          summary: `Duplicate timeline tag(s): ${[...new Set(dupes)].join(", ")}.`,
          chapter,
          parameter: "curation.timelineTags",
          value: curation.timelineTags.join(","),
        }),
      );
    }

    return this.finalize(
      chapter,
      "Asset pipeline current; timeline tags consistent.",
      issues,
    );
  }
}
