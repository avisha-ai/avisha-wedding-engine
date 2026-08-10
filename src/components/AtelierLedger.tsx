"use client";

import React, { useState } from 'react';
import {
  analyzeWhatsAppExport,
  type NormalizedTelemetryReport,
} from '../lib/parsers/normalizeWhatsApp';

export default function AtelierLedger() {
  const [report, setReport] = useState<NormalizedTelemetryReport | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const computedTelemetry = analyzeWhatsAppExport(text);
    setReport(computedTelemetry);
  };

  return (
    <div className="min-h-screen bg-black text-[#a3a3a3] font-mono p-8 selection:bg-[#262626]">
      {/* Structural Gallery Header */}
      <div className="border-b border-[#171717] pb-6 mb-8 flex justify-between items-baseline">
        <div>
          <h1 className="text-white text-xl tracking-tight font-medium">EXHIBITION 001 // WHATSAPP CLARITY</h1>
          <p className="text-xs text-[#525252] mt-1">Avisha Digital Atelier — Information Viscosity System</p>
        </div>
        {report && (
          <div className="flex gap-8 text-right text-xs">
            <div>
              <span className="block text-[#525252]">HEAD PRESSURE</span>
              <span className="text-amber-500 font-bold text-sm">{report.headPressureMinutes} min</span>
            </div>
            <div>
              <span className="block text-[#525252]">VISCOSITY COEFF</span>
              <span className="text-white text-sm">{report.systemViscosity}μ</span>
            </div>
            <div>
              <span className="block text-[#525252]">TOTAL FRICTION</span>
              <span className="text-red-500 text-sm font-bold">{report.globalFriction} F_c</span>
            </div>
          </div>
        )}
      </div>

      {/* Intake Provenance — what the normalizer folded or discarded */}
      {report && (
        <div className="max-w-4xl mx-auto mb-6 text-[10px] text-[#525252] flex flex-wrap gap-x-6 gap-y-1 uppercase tracking-widest">
          <span>{report.normalization.messages} NODES INGESTED</span>
          <span>ORDER {report.normalization.dateOrder}</span>
          {report.normalization.multiLineFolded > 0 && (
            <span>{report.normalization.multiLineFolded} MULTI-LINE FOLDED</span>
          )}
          {report.normalization.systemNotices > 0 && (
            <span>{report.normalization.systemNotices} SYSTEM NOTICES DROPPED</span>
          )}
          {report.normalization.droppedUndatable > 0 && (
            <span className="text-amber-600">
              {report.normalization.droppedUndatable} UNDATABLE DROPPED
            </span>
          )}
        </div>
      )}

      {/* Raw Intake Node */}
      {!report ? (
        <div className="border border-dashed border-[#262626] rounded-sm p-16 text-center max-w-xl mx-auto my-24 bg-[#0a0a0a]">
          <p className="text-xs mb-4 text-[#737373]">DRAG AND DROP RAW WHATSAPP .TXT EXPORT FILE</p>
          <input
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            className="text-xs text-[#525252] file:mr-4 file:py-1 file:px-3 file:border file:border-[#262626] file:bg-black file:text-white file:font-mono hover:file:bg-[#171717] cursor-pointer"
          />
        </div>
      ) : (
        /* The Living Structural Blueprint Display */
        <div className="space-y-2 max-w-4xl mx-auto transition-all duration-700">
          {report.nodes.map((node, index) => {
            const isHighViscosity = node.viscosityScore > 5;
            const isCavitationCritical = node.isActionable && report.systemViscosity > 8;

            return (
              <div
                key={index}
                className={`transition-all duration-300 border-l p-3 bg-black flex justify-between items-start text-xs
                  ${isCavitationCritical
                    ? 'border-red-600 bg-[#0f0202] animate-pulse'
                    : isHighViscosity
                      ? 'border-amber-600 bg-[#0c0702] scale-[0.99] tracking-tight'
                      : 'border-[#171717] hover:border-[#404040]'
                  }`}
              >
                <div className="flex gap-4 items-baseline max-w-[80%]">
                  <span className="text-[#404040] text-[10px] shrink-0">
                    {new Date(node.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-white font-bold shrink-0 w-24 truncate">{node.sender}</span>
                  <span className={node.isActionable ? 'text-[#e5e5e5]' : 'text-[#737373]'}>
                    {node.message}
                  </span>
                </div>

                {/* Ordy's Silent Warning Flags */}
                {isCavitationCritical && (
                  <span className="text-[10px] bg-red-950 text-red-400 px-2 py-0.5 border border-red-800 uppercase font-bold tracking-widest">
                    ▲ Ordy: Cavitation Warning
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
