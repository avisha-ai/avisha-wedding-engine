/**
 * types.ts — Phase II Multi-Agent IPC Mesh: shared contracts.
 * -----------------------------------------------------------------------------
 * Defines the structured JSON message payload, the mock ceremony parameter
 * model the agents validate, and the specialist-agent interface + base class.
 *
 * "IPC" here is in-process message passing: a synchronous pub/sub mesh, not
 * OS-level multi-process communication. Every agent is a pure evaluator —
 * given a state snapshot it returns message drafts; the AgentMesh stamps them
 * with id/timestamp/source and fans them out to subscribers.
 */

import type { ChapterId } from "@/components/ceremony/ceremonyConfig";

// -----------------------------------------------------------------------------
// Identity + severity
// -----------------------------------------------------------------------------

/** The specialist agents (plus the mesh itself, for aggregate messages). */
export type AgentId =
  | "logistics"
  | "environmental"
  | "hospitality"
  | "curation"
  | "mesh";

/** The parameter domain an agent owns. */
export type AgentDomain =
  | "venue"
  | "environment"
  | "hospitality"
  | "curation";

/** Ordered severity: `ok < info < warning < critical`. */
export type Severity = "ok" | "info" | "warning" | "critical";

/** What kind of message this is. */
export type MessageKind = "validation" | "conflict" | "info";

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  ok: 0,
  info: 1,
  warning: 2,
  critical: 3,
};

/** Numeric rank for a severity (higher = worse). */
export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

/** The worst severity in a list (`ok` if empty). */
export function worstSeverity(severities: readonly Severity[]): Severity {
  return severities.reduce<Severity>(
    (worst, s) => (severityRank(s) > severityRank(worst) ? s : worst),
    "ok",
  );
}

// -----------------------------------------------------------------------------
// Structured JSON message payload
// -----------------------------------------------------------------------------

/** The specific parameter a message concerns. */
export interface MessageSubject {
  readonly domain: AgentDomain;
  /** Dotted parameter name, e.g. `"environment.fabricWeightKg"`. */
  readonly parameter: string;
  /** Current value that triggered the check. */
  readonly value: number | string;
  /** The bound/limit it was checked against, when applicable. */
  readonly limit?: number | string;
}

/** A fully-stamped mesh message — the wire format posted to subscribers. */
export interface MeshMessage {
  readonly id: string;
  readonly timestamp: number;
  readonly source: AgentId;
  readonly kind: MessageKind;
  readonly severity: Severity;
  /** Machine-readable code, e.g. `"RIGGING_OVERLOAD"`. */
  readonly code: string;
  readonly summary: string;
  readonly chapter: ChapterId;
  readonly subject: MessageSubject;
  /** Other agents/domains implicated by a cross-domain conflict. */
  readonly related: readonly AgentId[];
}

/** What an agent returns from `evaluate` — the mesh adds id/timestamp/source. */
export interface MessageDraft {
  readonly kind: MessageKind;
  readonly severity: Severity;
  readonly code: string;
  readonly summary: string;
  readonly chapter: ChapterId;
  readonly subject: MessageSubject;
  readonly related?: readonly AgentId[];
}

/** One evaluation pass: the messages produced by all agents for a state. */
export interface MeshBatch {
  readonly timestamp: number;
  readonly chapter: ChapterId;
  /** Worst severity across all messages in this batch. */
  readonly status: Severity;
  /** Number of `kind === "conflict"` messages. */
  readonly conflicts: number;
  readonly messages: readonly MeshMessage[];
}

// -----------------------------------------------------------------------------
// Mock ceremony parameter model
// -----------------------------------------------------------------------------

export interface VenueParams {
  readonly maxStructuralLoadKg: number;
  readonly maxRiggingLoadKg: number;
  readonly powerCapacityKw: number;
  readonly powerDrawKw: number;
}

export interface EnvironmentParams {
  /** Actual rig colour temperature in Kelvin. */
  readonly colorTempK: number;
  /** Total suspended fabric/drape weight in kg. */
  readonly fabricWeightKg: number;
  /** Floral freshness, `1` = fresh, `0` = fully wilted. */
  readonly floralFreshness: number;
}

export interface HospitalityParams {
  readonly guestCount: number;
  readonly guestCapacity: number;
  /** Guests with unmet dietary requirements. */
  readonly dietaryUnmetCount: number;
  /** Current aisle/egress clearance in metres. */
  readonly routingClearanceM: number;
  /** Minimum safe clearance in metres. */
  readonly minClearanceM: number;
}

export interface CurationParams {
  readonly assetsIngested: number;
  readonly assetsTagged: number;
  /** Chronological storytelling tags applied so far. */
  readonly timelineTags: readonly string[];
  /** Tags that must be present. */
  readonly requiredTags: readonly string[];
}

export interface CeremonyParameters {
  readonly venue: VenueParams;
  readonly environment: EnvironmentParams;
  readonly hospitality: HospitalityParams;
  readonly curation: CurationParams;
}

/** A snapshot handed to each agent for evaluation. */
export interface CeremonyStateSnapshot {
  readonly chapter: ChapterId;
  readonly params: CeremonyParameters;
}

/** Domain-level partial patch applied via `AgentMesh.updateParameters`. */
export interface ParametersPatch {
  readonly venue?: Partial<VenueParams>;
  readonly environment?: Partial<EnvironmentParams>;
  readonly hospitality?: Partial<HospitalityParams>;
  readonly curation?: Partial<CurationParams>;
}

/** Immutably merge a patch onto a parameter set. */
export function mergeParameters(
  base: CeremonyParameters,
  patch: ParametersPatch,
): CeremonyParameters {
  return {
    venue: { ...base.venue, ...patch.venue },
    environment: { ...base.environment, ...patch.environment },
    hospitality: { ...base.hospitality, ...patch.hospitality },
    curation: { ...base.curation, ...patch.curation },
  };
}

/** Nominal parameters — no rule is violated in this baseline state. */
export const DEFAULT_PARAMETERS: CeremonyParameters = {
  venue: {
    maxStructuralLoadKg: 5000,
    maxRiggingLoadKg: 1200,
    powerCapacityKw: 200,
    powerDrawKw: 90,
  },
  environment: {
    colorTempK: 5000, // matches the "proposal" chapter's daylight profile
    fabricWeightKg: 300,
    floralFreshness: 0.9,
  },
  hospitality: {
    guestCount: 180,
    guestCapacity: 250,
    dietaryUnmetCount: 0,
    routingClearanceM: 1.8,
    minClearanceM: 1.2,
  },
  curation: {
    assetsIngested: 40,
    assetsTagged: 40,
    timelineTags: ["proposal"],
    requiredTags: ["proposal"],
  },
};

// -----------------------------------------------------------------------------
// Specialist agent contract
// -----------------------------------------------------------------------------

/** A specialist agent: a pure evaluator over a ceremony state snapshot. */
export interface SpecialistAgent {
  readonly id: AgentId;
  readonly domain: AgentDomain;
  readonly label: string;
  /** Produce validation/conflict drafts for the given state. */
  evaluate(state: CeremonyStateSnapshot): MessageDraft[];
}

/** Base class with small helpers for building message drafts. */
export abstract class BaseAgent implements SpecialistAgent {
  abstract readonly id: AgentId;
  abstract readonly domain: AgentDomain;
  abstract readonly label: string;

  abstract evaluate(state: CeremonyStateSnapshot): MessageDraft[];

  /** Build a message draft in this agent's domain. */
  protected draft(
    partial: Omit<MessageDraft, "subject"> & {
      readonly parameter: string;
      readonly value: number | string;
      readonly limit?: number | string;
    },
  ): MessageDraft {
    return {
      kind: partial.kind,
      severity: partial.severity,
      code: partial.code,
      summary: partial.summary,
      chapter: partial.chapter,
      related: partial.related,
      subject: {
        domain: this.domain,
        parameter: partial.parameter,
        value: partial.value,
        limit: partial.limit,
      },
    };
  }

  /**
   * If `issues` is empty, emit a single nominal "ok" validation so every
   * evaluation yields at least one message per agent.
   */
  protected finalize(
    chapter: ChapterId,
    okSummary: string,
    issues: MessageDraft[],
  ): MessageDraft[] {
    if (issues.length > 0) return issues;
    return [
      this.draft({
        kind: "validation",
        severity: "ok",
        code: `${this.id.toUpperCase()}_NOMINAL`,
        summary: okSummary,
        chapter,
        parameter: "*",
        value: "nominal",
      }),
    ];
  }
}
