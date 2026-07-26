/**
 * AgentMesh.ts — Phase II Multi-Agent IPC Mesh orchestrator.
 * -----------------------------------------------------------------------------
 * Holds the authoritative ceremony state, drives every registered specialist
 * agent on each state change, stamps their drafts into structured JSON
 * messages, and fans the resulting batch out to subscribers.
 *
 * "IPC" here is a synchronous in-process message bus (pub/sub) — not OS-level
 * multi-process communication. Agents never talk to each other directly; they
 * each read the shared snapshot and encode cross-domain references via a
 * message's `related` field (e.g. Logistics flags fabric load that breaks the
 * venue's structural bound, referencing the Environmental agent).
 */

import type { ChapterId } from "@/components/ceremony/ceremonyConfig";

import { CurationAgent } from "./CurationAgent";
import { EnvironmentalAgent } from "./EnvironmentalAgent";
import { HospitalityAgent } from "./HospitalityAgent";
import { LogisticsAgent } from "./LogisticsAgent";
import {
  DEFAULT_PARAMETERS,
  mergeParameters,
  worstSeverity,
  type CeremonyParameters,
  type CeremonyStateSnapshot,
  type MeshBatch,
  type MeshMessage,
  type ParametersPatch,
  type SpecialistAgent,
} from "./types";

/** A subscriber notified with each fresh evaluation batch. */
export type MeshSubscriber = (batch: MeshBatch) => void;

export interface AgentMeshOptions {
  readonly chapter?: ChapterId;
  readonly parameters?: CeremonyParameters;
  /** Override the agent roster (defaults to the four specialists). */
  readonly agents?: readonly SpecialistAgent[];
  /** Injectable clock for deterministic timestamps in tests. */
  readonly now?: () => number;
}

/** The four specialist agents, in dispatch order. */
export function defaultAgents(): SpecialistAgent[] {
  return [
    new LogisticsAgent(),
    new EnvironmentalAgent(),
    new HospitalityAgent(),
    new CurationAgent(),
  ];
}

export class AgentMesh {
  private chapter: ChapterId;
  private parameters: CeremonyParameters;
  private readonly agents: readonly SpecialistAgent[];
  private readonly now: () => number;
  private readonly subscribers = new Set<MeshSubscriber>();

  private seq = 0;
  private lastBatch: MeshBatch;

  constructor(options: AgentMeshOptions = {}) {
    this.chapter = options.chapter ?? "proposal";
    this.parameters = options.parameters ?? DEFAULT_PARAMETERS;
    this.agents = options.agents ?? defaultAgents();
    this.now = options.now ?? (() => Date.now());
    // Prime an initial evaluation so `getLastBatch()` is always populated.
    this.lastBatch = this.evaluate();
  }

  /** The registered specialist agents. */
  get roster(): readonly SpecialistAgent[] {
    return this.agents;
  }

  /** Subscribe to evaluation batches. Returns an unsubscribe function. */
  subscribe(fn: MeshSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /** Current immutable state snapshot. */
  getState(): CeremonyStateSnapshot {
    return { chapter: this.chapter, params: this.parameters };
  }

  /** The most recent evaluation batch. */
  getLastBatch(): MeshBatch {
    return this.lastBatch;
  }

  /** React to a ceremony chapter change and re-evaluate. */
  setChapter(chapter: ChapterId): MeshBatch {
    if (chapter === this.chapter) return this.lastBatch;
    this.chapter = chapter;
    return this.publish(this.evaluate());
  }

  /** Apply a mock parameter change and re-evaluate. */
  updateParameters(patch: ParametersPatch): MeshBatch {
    this.parameters = mergeParameters(this.parameters, patch);
    return this.publish(this.evaluate());
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Run every agent over the current state and assemble a stamped batch. */
  private evaluate(): MeshBatch {
    const state = this.getState();
    const timestamp = this.now();
    const messages: MeshMessage[] = [];

    for (const agent of this.agents) {
      for (const draft of agent.evaluate(state)) {
        messages.push({
          id: `${agent.id}-${this.seq++}`,
          timestamp,
          source: agent.id,
          kind: draft.kind,
          severity: draft.severity,
          code: draft.code,
          summary: draft.summary,
          chapter: draft.chapter,
          subject: draft.subject,
          related: draft.related ?? [],
        });
      }
    }

    // Worst-first so the most severe issues lead any consumer view.
    messages.sort((a, b) => severityDesc(a.severity, b.severity));

    return {
      timestamp,
      chapter: this.chapter,
      status: worstSeverity(messages.map((m) => m.severity)),
      conflicts: messages.filter((m) => m.kind === "conflict").length,
      messages,
    };
  }

  private publish(batch: MeshBatch): MeshBatch {
    this.lastBatch = batch;
    for (const fn of this.subscribers) fn(batch);
    return batch;
  }
}

/** Compare severities for a descending (worst-first) sort. */
function severityDesc(a: MeshBatch["status"], b: MeshBatch["status"]): number {
  const rank: Record<MeshBatch["status"], number> = {
    critical: 3,
    warning: 2,
    info: 1,
    ok: 0,
  };
  return rank[b] - rank[a];
}
