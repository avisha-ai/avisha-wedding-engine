"use client";

// src/components/AtelierLedger.tsx
import React, { useState, useRef } from 'react';
import {
  analyzeWhatsAppExport,
  type DisplayChatNode,
  type NormalizedTelemetryReport,
} from '../lib/parsers/normalizeWhatsApp';

/**
 * A node plus the one signal the engine does not emit: whether it sits inside a
 * run of actionable messages from a single sender that nobody else answered.
 */
type LedgerNode = DisplayChatNode & {
  /** Tracking sequential unanswered variables. */
  isSequentialLeak: boolean;
};

interface LedgerReport extends NormalizedTelemetryReport {
  ledgerNodes: LedgerNode[];
}

/** Consecutive actionable messages by one sender before anyone else speaks. */
const CASCADE_RUN_LENGTH = 3;

/**
 * Ordy's cascade pass. Derived from the engine's nodes — it reads `isActionable`
 * and `sender`, and computes nothing the engine already owns.
 *
 * A leak is a run of >= CASCADE_RUN_LENGTH actionable messages from the same
 * sender with no message from anyone else in between: one entity raising
 * vectors that stay unworked. Any message from a different sender ends the run,
 * because that is the downstream interaction the flag is watching for.
 */
function markSequentialLeaks(nodes: DisplayChatNode[]): LedgerNode[] {
  const marked: LedgerNode[] = nodes.map(node => ({ ...node, isSequentialLeak: false }));

  let runStart = 0;
  let runSender = '';
  let runLength = 0;

  const closeRun = (endExclusive: number) => {
    if (runLength >= CASCADE_RUN_LENGTH) {
      for (let i = runStart; i < endExclusive; i++) {
        if (marked[i].isActionable) marked[i].isSequentialLeak = true;
      }
    }
  };

  marked.forEach((node, index) => {
    if (node.sender !== runSender) {
      closeRun(index);
      runStart = index;
      runSender = node.sender;
      runLength = 0;
    }
    if (node.isActionable) {
      runLength++;
    } else {
      // A non-actionable line from the same sender does not answer anything,
      // but it does break the run of raised vectors.
      closeRun(index);
      runStart = index + 1;
      runLength = 0;
    }
  });
  closeRun(marked.length);

  return marked;
}

/**
 * Why a file produced no telemetry, phrased from what the intake pass actually
 * counted rather than from a single generic string. The stats are the parser's
 * own state, so the alert always describes this file.
 */
function describeEmptyIngest(report: NormalizedTelemetryReport): string {
  const { totalEntries, systemNotices, droppedUndatable, unparsedLines } = report.normalization;

  if (totalEntries === 0) {
    return unparsedLines > 0
      ? `INGEST_FAULT: ${unparsedLines} line(s) read, none carrying a timestamp header. This is not a WhatsApp export.`
      : "INGEST_FAULT: Provided file contains no recognizable operational telemetry.";
  }
  if (systemNotices === totalEntries) {
    return `INGEST_FAULT: ${systemNotices} system notice(s) and no participant traffic. Nothing to pressurise.`;
  }
  if (droppedUndatable > 0) {
    return `INGEST_FAULT: ${droppedUndatable} of ${totalEntries} entries carry unreadable dates. No datable stream survived intake.`;
  }
  return "INGEST_FAULT: Provided file contains no recognizable operational telemetry.";
}

export default function AtelierLedger() {
  const [report, setReport] = useState<LedgerReport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 2 backend engine linked directly into the Phase 3 layout.
  // `analyzeWhatsAppExport` runs the tolerant parser, re-emits the log in the
  // canonical shape, then hands it to `parseWhatsAppLog` — the signed-off owner
  // of Friction = Pressure * Viscosity. No math is duplicated here; the only
  // thing this component adds is the cascade pass above.
  const processLogData = async (text: string) => {
    try {
      setErrorLog(null);
      const engineReport = analyzeWhatsAppExport(text);

      if (engineReport.nodes.length === 0) {
        setErrorLog(describeEmptyIngest(engineReport));
        return;
      }

      setReport({
        ...engineReport,
        ledgerNodes: markSequentialLeaks(engineReport.nodes),
      });
    } catch (error) {
      console.error("Telemetry pipeline calculation break:", error);
      const detail = error instanceof Error ? error.message : "Unreadable export.";
      setErrorLog(`CRITICAL_COMPILATION_BREAK: ${detail}`);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const text = await files[0].text();
      processLogData(text);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#888888] font-mono p-8 select-none tracking-tight">
      <div className="max-w-6xl mx-auto border border-[#121212] bg-black p-6 rounded-sm shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#262626] to-transparent" />

        {/* Telemetry Dashboard Row */}
        <div className="border-b border-[#121212] pb-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-baseline gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-white text-md tracking-widest font-bold uppercase">AVISHA // EXHIBITION_001</h1>
            </div>
            <p className="text-[10px] text-[#444444] mt-1 font-semibold uppercase tracking-wider">Workspace: Information Viscosity &amp; Stream Cavitation Monitor</p>
          </div>

          {report && !errorLog && (
            <div className="flex gap-8 text-left text-[11px] bg-[#080808] border border-[#121212] p-3 rounded-sm">
              <div>
                <span className="block text-[#444444] font-bold text-[9px] uppercase tracking-wider">Head Pressure</span>
                <span className="text-amber-500 font-bold font-mono text-xs">{report.headPressureMinutes} MIN</span>
              </div>
              <div className="w-[1px] bg-[#121212]" />
              <div>
                <span className="block text-[#444444] font-bold text-[9px] uppercase tracking-wider">Viscosity Coeff</span>
                <span className="text-white font-bold font-mono text-xs">{report.systemViscosity} μ</span>
              </div>
              <div className="w-[1px] bg-[#121212]" />
              <div>
                <span className="block text-[#444444] font-bold text-[9px] uppercase tracking-wider">Total Friction</span>
                <span className="text-red-500 font-bold font-mono text-xs">{report.globalFriction} F_c</span>
              </div>
            </div>
          )}
        </div>

        {/* Error Boundary Output */}
        {errorLog && (
          <div className="border border-amber-900/50 bg-[#0c0303] text-amber-500 p-4 mb-6 rounded-sm text-xs uppercase tracking-wider font-bold animate-fadeIn">
            ▲ SYSTEM_ALERT // {errorLog}
          </div>
        )}

        {/* Interactive Ingestion Port */}
        {!report ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-sm p-24 text-center max-w-xl mx-auto my-12 bg-[#020202] transition-all duration-300 cursor-pointer
              ${isDragging ? 'border-amber-500/40 bg-[#080602]' : 'border-[#1c1c1c] hover:border-[#2a2a2a]'}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".txt"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) processLogData(await file.text());
              }}
              className="hidden"
            />
            <div className="space-y-2">
              <p className="text-xs text-white font-bold tracking-widest">DRAG &amp; DROP WHATSAPP LOG</p>
              <p className="text-[10px] text-[#444444]">OR TAP TO EXPLORE PHYSICAL FILE SYSTEM</p>
            </div>
          </div>
        ) : (
          /* Calibrated Visual Telemetry Streams */
          <div className="space-y-1.5 max-w-5xl mx-auto max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {report.ledgerNodes.map((node, index) => {
              const isHighViscosity = node.viscosityScore > 6;
              const isCavitationCritical = node.isActionable && report.systemViscosity > 1.2;
              const isOrdyAlert = node.isSequentialLeak;

              return (
                <div
                  key={index}
                  className={`transition-all duration-300 border-l p-2.5 flex justify-between items-start gap-3 text-[11px] rounded-r-sm
                    ${isOrdyAlert
                      ? 'border-red-500 bg-[#120202] text-red-100 font-bold scale-[0.99] tracking-tight'
                      : isCavitationCritical
                        ? 'border-red-600/70 bg-[#080101] text-red-200/90'
                        : isHighViscosity
                          ? 'border-amber-600 bg-[#050401] text-amber-200/80 scale-[0.995]'
                          : 'border-[#121212] bg-[#020202] hover:bg-[#040404] hover:border-[#222222] text-[#888888]'
                    }`}
                >
                  <div className="flex gap-4 items-start min-w-0 w-full">
                    <span className="text-[#333333] text-[9px] font-bold font-mono tracking-tighter w-12 shrink-0 pt-0.5">
                      LN_{String(index + 1).padStart(3, '0')}
                    </span>
                    <span className="text-white font-bold shrink-0 w-20 truncate border-r border-[#121212] pr-2">
                      {node.sender}
                    </span>
                    {/* `displayText` keeps the author's own line breaks; the
                        engine scored the flattened body in `message`. */}
                    <span className="font-mono min-w-0 flex-1 whitespace-pre-wrap break-words">
                      {node.displayText}
                    </span>
                  </div>

                  {/* Ordy's Multi-Tier Observation Flags */}
                  {isOrdyAlert ? (
                    <span className="text-[8px] bg-red-950 text-red-400 px-2 py-0.5 border border-red-800 uppercase font-black tracking-widest shrink-0 animate-pulse">
                      ▲ ORDY: CASCADE CAVITATION
                    </span>
                  ) : isCavitationCritical ? (
                    <span className="text-[8px] bg-red-950/20 text-red-500/80 px-2 py-0.5 border border-red-900/40 uppercase font-bold tracking-wider shrink-0">
                      ▲ PRESSURE SPIKE
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-[#121212] flex justify-between items-center text-[9px] text-[#333333] font-bold uppercase tracking-wider">
          <span>Active Layer: Exhibition_001</span>
          <span className="text-[#222222]">Next Stage: Workflow Audit [Locked in Vault]</span>
        </div>
      </div>
    </div>
  );
}
