/**
 * parseExport.ts — WhatsApp chat export (`_chat.txt`) parser.
 * -----------------------------------------------------------------------------
 * Turns the raw text of a "Export chat" file into structured entries carrying a
 * timestamp, a sender, and the message body.
 *
 * The export format is not standardised — it varies by platform and by the
 * exporting phone's locale. The shapes handled here:
 *
 *   iOS      [12/03/2023, 14:23:11] Riya Shah: See you at the mandap
 *   iOS 12h  [3/12/23, 2:23:11 PM] Riya Shah: See you at the mandap
 *   Android  12/03/2023, 14:23 - Riya Shah: See you at the mandap
 *   ISO-ish  2023-12-03, 14:23 - Riya Shah: See you at the mandap
 *
 * Three things make a naive line-by-line split wrong, and this parser handles
 * all three:
 *
 *   1. Messages can span multiple lines. Only the first line of an entry carries
 *      a timestamp header; every following line belongs to the same message.
 *   2. System notices ("Messages are end-to-end encrypted.", "Riya added Arjun")
 *      have a timestamp but no sender, so `sender` is `null` for them.
 *   3. `12/03/2023` is ambiguous. Day/month order is inferred from the whole
 *      file rather than guessed per line — see `inferDateOrder`.
 */

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

/** How the numeric date fields in a header are ordered. */
export type DateOrder = "DMY" | "MDY" | "YMD";

/** A single parsed entry: either a chat message or a system notice. */
export interface WhatsAppMessage {
  /** Local-time date, or `null` if the header held an impossible date. */
  readonly timestamp: Date | null;
  /** The header text exactly as it appeared, e.g. `"12/03/2023, 14:23:11"`. */
  readonly rawTimestamp: string;
  /** Display name or phone number; `null` for system notices. */
  readonly sender: string | null;
  /** Message body, with any continuation lines joined by `\n`. */
  readonly text: string;
  /** `"system"` when the entry has a timestamp but no sender. */
  readonly type: "message" | "system";
  /** 1-based line number of the entry's header line in the source file. */
  readonly line: number;
}

/** A source line that carried no header and had no message to continue. */
export interface UnparsedLine {
  readonly line: number;
  readonly text: string;
}

export interface ParseResult {
  readonly messages: readonly WhatsAppMessage[];
  /** The date order actually used — inferred unless one was supplied. */
  readonly dateOrder: DateOrder;
  /** Lines that could not be attached to any message (usually junk preamble). */
  readonly unparsed: readonly UnparsedLine[];
}

export interface ParseOptions {
  /**
   * Force a day/month order instead of inferring it. Use this when the file is
   * genuinely ambiguous (every date has both fields ≤ 12) and you know the
   * exporting phone's locale.
   */
  readonly dateOrder?: DateOrder;
  /**
   * Fallback when inference finds no decisive date. Defaults to `"DMY"`, the
   * order used by most WhatsApp locales.
   */
  readonly defaultDateOrder?: DateOrder;
  /**
   * Longest run of characters before the first `": "` still treated as a sender
   * name. Guards against a system notice that happens to contain a colon being
   * misread as a very long sender. Defaults to `80`.
   */
  readonly maxSenderLength?: number;
}

// -----------------------------------------------------------------------------
// Character normalisation
// -----------------------------------------------------------------------------

/**
 * iOS wraps header fields in bidirectional control characters, and some locales
 * use a narrow no-break space before AM/PM. They are invisible but break every
 * regex, so they are stripped before matching.
 */
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩﻿]/g;
const EXOTIC_SPACES = /[   ]/g;

function normalizeLine(line: string): string {
  return line.replace(BIDI_MARKS, "").replace(EXOTIC_SPACES, " ").trimEnd();
}

// -----------------------------------------------------------------------------
// Header matching
// -----------------------------------------------------------------------------

/**
 * Matches a timestamp header and captures the rest of the line.
 *
 * Groups: 1-3 date fields, 4-6 hour/minute/second, 7 AM/PM marker, 8 remainder.
 *
 * The `]`-or-`-` separator before the remainder is required: it is what every
 * real export uses, and demanding it stops a continuation line that merely
 * starts with a date from being mistaken for a new entry.
 */
const HEADER_RE =
  /^\[?\s*(\d{1,4})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap])\.?\s*[Mm]\.?)?\s*(?:\]|[-–—])\s*([\s\S]*)$/;

interface HeaderFields {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly meridiem: "am" | "pm" | null;
  /** The header substring, reconstructed from the original line. */
  readonly raw: string;
  /** Everything after the header — `"Sender: body"` or a system notice. */
  readonly rest: string;
}

function matchHeader(line: string): HeaderFields | null {
  const m = HEADER_RE.exec(line);
  if (!m) return null;

  const rest = m[8];
  // The header is the part of the line the remainder did not consume.
  const raw = (rest ? line.slice(0, line.length - rest.length) : line)
    .replace(/^\[|[\]\s]+$/g, "")
    .replace(/\s*[-–—]\s*$/, "")
    .trim();

  return {
    a: Number(m[1]),
    b: Number(m[2]),
    c: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
    // The regex captures only the leading letter of "AM"/"PM".
    meridiem: m[7] ? (m[7].toLowerCase() === "p" ? "pm" : "am") : null,
    raw,
    rest,
  };
}

// -----------------------------------------------------------------------------
// Date assembly
// -----------------------------------------------------------------------------

/**
 * Decide the field order for the whole file.
 *
 * A single header is often ambiguous (`05/06/2023`), but a file rarely is: as
 * soon as one date has a field above 12 the order is pinned. Votes are counted
 * across every header so one malformed line cannot flip the whole file, and the
 * first field being 4 digits or above 31 settles it as year-first outright.
 */
function inferDateOrder(headers: readonly HeaderFields[], fallback: DateOrder): DateOrder {
  let dmy = 0;
  let mdy = 0;
  let ymd = 0;

  for (const h of headers) {
    if (h.a > 31) {
      ymd += 1;
    } else if (h.a > 12) {
      dmy += 1;
    } else if (h.b > 12) {
      mdy += 1;
    }
  }

  if (ymd > dmy && ymd > mdy) return "YMD";
  if (dmy > mdy) return "DMY";
  if (mdy > dmy) return "MDY";
  return fallback;
}

/** Expand a 2-digit year the way WhatsApp exports mean it. */
function expandYear(year: number): number {
  if (year >= 100) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

/**
 * Build a local-time `Date`, or `null` if the fields describe a date that does
 * not exist (e.g. `31/02`, which `Date` would silently roll into March).
 */
function toDate(h: HeaderFields, order: DateOrder): Date | null {
  let day: number;
  let month: number;
  let year: number;

  // A 4-digit or >31 leading field is a year regardless of the file's order.
  if (order === "YMD" || h.a > 31) {
    year = h.a;
    month = h.b;
    day = h.c;
  } else if (order === "MDY") {
    month = h.a;
    day = h.b;
    year = h.c;
  } else {
    day = h.a;
    month = h.b;
    year = h.c;
  }

  year = expandYear(year);

  let hour = h.hour;
  if (h.meridiem === "pm" && hour < 12) hour += 12;
  if (h.meridiem === "am" && hour === 12) hour = 0;

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || h.minute > 59 || h.second > 59) return null;

  const date = new Date(year, month - 1, day, hour, h.minute, h.second, 0);
  // Reject overflow: `new Date(2023, 1, 31)` quietly becomes 3 March.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

// -----------------------------------------------------------------------------
// Sender / body split
// -----------------------------------------------------------------------------

interface Body {
  readonly sender: string | null;
  readonly text: string;
}

/**
 * Split `"Riya Shah: See you at the mandap"` into sender and text.
 *
 * A system notice has no `": "` at all, which is the signal used here. The
 * length cap catches the rarer case of a notice that does contain a colon —
 * a sender name that long is not a name.
 */
function splitBody(rest: string, maxSenderLength: number): Body {
  const idx = rest.indexOf(": ");
  const candidate = idx === -1 ? null : rest.slice(0, idx);

  if (candidate === null || candidate.length === 0 || candidate.length > maxSenderLength) {
    return { sender: null, text: rest.trim() };
  }
  return { sender: candidate.trim(), text: rest.slice(idx + 2) };
}

// -----------------------------------------------------------------------------
// Parser
// -----------------------------------------------------------------------------

/**
 * Parse the full text of a WhatsApp export.
 *
 * Continuation lines are folded into the preceding message, so the returned
 * array has one entry per message rather than one per line.
 */
export function parseWhatsAppExport(raw: string, options: ParseOptions = {}): ParseResult {
  const maxSenderLength = options.maxSenderLength ?? 80;
  const lines = raw.split(/\r\n|\r|\n/);

  // Pass 1 — find the headers, so day/month order is decided from the whole
  // file before any single timestamp is built.
  const headers: (HeaderFields | null)[] = lines.map((line) => matchHeader(normalizeLine(line)));
  const dateOrder =
    options.dateOrder ??
    inferDateOrder(headers.filter((h): h is HeaderFields => h !== null), options.defaultDateOrder ?? "DMY");

  // Pass 2 — build entries, folding continuation lines into the open message.
  const messages: WhatsAppMessage[] = [];
  const unparsed: UnparsedLine[] = [];
  const continuations: string[][] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const header = headers[i];

    if (header) {
      const { sender, text } = splitBody(header.rest, maxSenderLength);
      messages.push({
        timestamp: toDate(header, dateOrder),
        rawTimestamp: header.raw,
        sender,
        text,
        type: sender === null ? "system" : "message",
        line: i + 1,
      });
      continuations.push([]);
      continue;
    }

    const line = normalizeLine(lines[i]);

    if (messages.length > 0) {
      // A blank line inside a message is real content; a trailing blank line at
      // the end of the file is not, and gets trimmed when the text is joined.
      continuations[continuations.length - 1].push(line);
    } else if (line.trim().length > 0) {
      unparsed.push({ line: i + 1, text: line });
    }
  }

  // Fold continuations in a final sweep so `text` stays readonly on the entry.
  const folded = messages.map((message, i) => {
    const extra = continuations[i];
    if (extra.length === 0) return message;
    const text = `${message.text}\n${extra.join("\n")}`.trimEnd();
    return { ...message, text };
  });

  return { messages: folded, dateOrder, unparsed };
}

/**
 * Parse one standalone line.
 *
 * Returns `null` when the line has no timestamp header — which, in a real
 * export, means it is a continuation of the previous message rather than junk.
 * Use `parseWhatsAppExport` for whole files; this is for probing a single line.
 */
export function parseWhatsAppLine(
  line: string,
  options: ParseOptions = {},
): WhatsAppMessage | null {
  const header = matchHeader(normalizeLine(line));
  if (!header) return null;

  const order = options.dateOrder ?? inferDateOrder([header], options.defaultDateOrder ?? "DMY");
  const { sender, text } = splitBody(header.rest, options.maxSenderLength ?? 80);

  return {
    timestamp: toDate(header, order),
    rawTimestamp: header.raw,
    sender,
    text,
    type: sender === null ? "system" : "message",
    line: 1,
  };
}

/** The distinct senders in a parsed chat, in first-seen order. */
export function listSenders(messages: readonly WhatsAppMessage[]): string[] {
  const seen = new Set<string>();
  for (const m of messages) {
    if (m.sender !== null) seen.add(m.sender);
  }
  return [...seen];
}
