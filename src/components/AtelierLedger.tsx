"use client";

// components/AtelierLedger.tsx
import React, { useState, useRef } from 'react';
import {
  analyzeWhatsAppExport,
  type NormalizedTelemetryReport,
} from '../lib/parsers/normalizeWhatsApp';

export default function AtelierLedger() {
  const [report, setReport] = useState<NormalizedTelemetryReport | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 2 backend engine linked directly into the Phase 3 layout.
  // `analyzeWhatsAppExport` runs the tolerant parser, re-emits the log in the
  // canonical shape, then hands it to `parseWhatsAppLog` — the signed-off owner
  // of Friction = Pressure * Viscosity. No math is duplicated here.
  const processLogData = async (text: string) => {
    setReport(analyzeWhatsAppExport(text));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const text = await file.text();
      processLogData(text);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#888888] font-mono p-8 select-none tracking-tight">

      {/* Atelier Permanent Blueprint Frame */}
      <div className="max-w-6xl mx-auto border border-[#121212] bg-black p-6 rounded-sm shadow-2xl relative overflow-hidden">

        {/* Subtle Branding Pinstripe */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#262626] to-transparent" />

        {/* Global Telemetry Header */}
        <div className="border-b border-[#121212] pb-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-baseline gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-white text-md tracking-widest font-bold uppercase">AVISHA // INSTRUMENT_001</h1>
            </div>
            <p className="text-[10px] text-[#444444] mt-1 font-semibold uppercase tracking-wider">Workspace: Information Viscosity &amp; Stream Cavitation Monitor</p>
          </div>

          {report && (
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

        {/* Intake Provenance — amber error surface for undatables, per sign-off */}
        {report && (
          <div className="-mt-4 mb-8 flex flex-wrap gap-x-6 gap-y-1 text-[9px] text-[#333333] font-bold uppercase tracking-wider">
            <span>{report.normalization.messages} Nodes Ingested</span>
            <span>Order {report.normalization.dateOrder}</span>
            {report.normalization.multiLineFolded > 0 && (
              <span>{report.normalization.multiLineFolded} Multi-Line Folded</span>
            )}
            {report.normalization.systemNotices > 0 && (
              <span>{report.normalization.systemNotices} System Notices Dropped</span>
            )}
            {report.normalization.droppedUndatable > 0 && (
              <span className="text-amber-600">
                ▲ {report.normalization.droppedUndatable} Undatable Dropped
              </span>
            )}
          </div>
        )}

        {/* Dynamic Intake Port vs Dashboard Display */}
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
          /* The Production Obsidian Ledger View */
          <div className="space-y-1.5 max-w-5xl mx-auto animate-fadeIn">
            {report.nodes.map((node, index) => {
              const isHighViscosity = node.viscosityScore > 5;
              const isCavitationCritical = node.isActionable && report.systemViscosity > 8;

              return (
                <div
                  key={index}
                  className={`transition-all duration-200 border-l p-2.5 flex justify-between items-center text-[11px] rounded-r-sm
                    ${isCavitationCritical
                      ? 'border-red-600 bg-[#0a0202] text-red-200'
                      : isHighViscosity
                        ? 'border-amber-600 bg-[#060401] text-amber-200/90 scale-[0.995] font-medium tracking-tight'
                        : 'border-[#121212] bg-[#020202] hover:bg-[#060606] hover:border-[#262626] text-[#999999]'
                    }`}
                >
                  <div className="flex gap-4 items-center overflow-hidden w-full">
                    <span
                      className="text-[#333333] text-[9px] font-bold font-mono tracking-tighter w-12 shrink-0"
                      title={new Date(node.timestamp).toUTCString()}
                    >
                      LN_{String(index + 1).padStart(3, '0')}
                    </span>
                    <span className="text-white font-bold shrink-0 w-20 truncate border-r border-[#121212] pr-2">
                      {node.sender}
                    </span>
                    <span className="truncate pr-4 font-mono">
                      {node.message}
                    </span>
                  </div>

                  {/* Ordy's Silent Environmental Indicator */}
                  {isCavitationCritical && (
                    <span className="text-[8px] bg-red-950/40 text-red-500 px-2 py-0.5 border border-red-900/50 uppercase font-black tracking-widest shrink-0 animate-pulse">
                      ▲ CAVITATION RISK
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Subtle Under-Excavation Banner */}
        <div className="mt-8 pt-4 border-t border-[#121212] flex justify-between items-center text-[9px] text-[#333333] font-bold uppercase tracking-wider">
          <span>Active Layer: Exhibition_001</span>
          <span className="text-[#222222]">Next Stage: Workflow Audit [Locked in Vault]</span>
        </div>

      </div>
    </div>
  );
}
