/**
 * normalizeWhatsApp.ts — intake layer in front of the core math engine.
 * -----------------------------------------------------------------------------
 * `parseWhatsAppLog` accepts exactly one line shape:
 *
 *     [DD/MM/YY, HH:MM:SS] Sender: Message
 *
 * Real exports are not that uniform — 4-digit years, Android's `-` separator,
 * 12-hour clocks and multi-line message bodies are all common, and the engine's
 * strict regex drops each of them silently, deflating every metric downstream.
 *
 * This module parses the raw export with the tolerant parser in
 * `@/lib/whatsapp`, then re-emits it in the engine's canonical shape. The
 * telemetry math is left completely untouched: it still does its own regex pass,
 * it just receives a file it can fully read.
 *
 * Deliberate parity choices, so normalised input scores the same as input the
 * engine could already handle:
 *
 *   - System notices are dropped. They have no sender, so the engine's regex
 *     rejected them anyway; keeping them would inflate node counts and invent
 *     context switches between real participants.
 *   - Timestamps are re-emitted as local wall-clock components. The engine
 *     re-reads them as UTC, which is the behaviour it already had.
 *   - Continuation lines are folded into their message with spaces, so a
 *     multi-line message stays one node instead of vanishing.
 */

import { parseWhatsAppExport, type DateOrder } from "@/lib/whatsapp";
import { parseWhatsAppLog, type TelemetryReport } from "./whatsapp";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** What the intake pass did to the file, for display and for debugging. */
export interface NormalizationStats {
  /** Timestamped entries the tolerant parser recognised. */
  readonly totalEntries: number;
  /** Entries handed to the math engine. */
  readonly messages: number;
  /** Entries dropped for having no sender (encryption notice, joins, leaves). */
  readonly systemNotices: number;
  /** Messages that carried continuation lines and were folded into one node. */
  readonly multiLineFolded: number;
  /** Entries whose date was impossible or outside the engine's 2000-2099 range. */
  readonly droppedUndatable: number;
  /** Sender names that contained a `:` and were sanitised to survive the engine. */
  readonly sendersSanitised: number;
  /** Source lines that belonged to no message at all. */
  readonly unparsedLines: number;
  /** Day/month order the tolerant parser inferred for this file. */
  readonly dateOrder: DateOrder;
}

export interface NormalizedTelemetryReport extends TelemetryReport {
  readonly normalization: NormalizationStats;
}

export interface NormalizeOptions {
  /** Force a day/month order instead of inferring it from the file. */
  readonly dateOrder?: DateOrder;
}

// -----------------------------------------------------------------------------
// Canonical line emission
// -----------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * The engine reads the year as `20${YY}`, so it can only express 2000-2099.
 * Anything outside that would be silently mis-stamped rather than rejected.
 */
function inEngineYearRange(date: Date): boolean {
  const year = date.getFullYear();
  return year >= 2000 && year <= 2099;
}

/**
 * The engine's sender group is `[^:]+`, so a colon anywhere in a name makes the
 * whole line fail to match. Replacing it keeps the node instead of losing it.
 */
function sanitiseSender(sender: string): string {
  return sender.replace(/:/g, "-").trim();
}

/** Collapse a folded multi-line body back onto one line. */
function flatten(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

function canonicalLine(date: Date, sender: string, text: string): string {
  const stamp =
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${pad(date.getFullYear() % 100)}` +
    `, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `[${stamp}] ${sender}: ${text}`;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Rewrite any supported export into the strict shape the math engine parses.
 * Returns the canonical text plus a report of what was folded or dropped.
 */
export function normalizeWhatsAppExport(
  rawText: string,
  options: NormalizeOptions = {},
): { canonicalText: string; stats: NormalizationStats } {
  const parsed = parseWhatsAppExport(rawText, { dateOrder: options.dateOrder });

  const lines: string[] = [];
  let systemNotices = 0;
  let multiLineFolded = 0;
  let droppedUndatable = 0;
  let sendersSanitised = 0;

  for (const entry of parsed.messages) {
    if (entry.sender === null) {
      systemNotices += 1;
      continue;
    }
    if (entry.timestamp === null || !inEngineYearRange(entry.timestamp)) {
      droppedUndatable += 1;
      continue;
    }

    const sender = sanitiseSender(entry.sender);
    if (sender !== entry.sender) sendersSanitised += 1;

    const text = flatten(entry.text);
    if (text !== entry.text.trim()) multiLineFolded += 1;

    lines.push(canonicalLine(entry.timestamp, sender, text));
  }

  return {
    canonicalText: lines.join("\n"),
    stats: {
      totalEntries: parsed.messages.length,
      messages: lines.length,
      systemNotices,
      multiLineFolded,
      droppedUndatable,
      sendersSanitised,
      unparsedLines: parsed.unparsed.length,
      dateOrder: parsed.dateOrder,
    },
  };
}

/**
 * Normalise a raw export, then run the core telemetry math over it.
 *
 * This is the entry point the UI should call. `parseWhatsAppLog` is still the
 * sole owner of the system-dynamics calculation — it simply receives a file it
 * can read end to end.
 */
export function analyzeWhatsAppExport(
  rawText: string,
  options: NormalizeOptions = {},
): NormalizedTelemetryReport {
  const { canonicalText, stats } = normalizeWhatsAppExport(rawText, options);
  return { ...parseWhatsAppLog(canonicalText), normalization: stats };
}
