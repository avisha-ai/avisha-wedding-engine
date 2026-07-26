"use client";

/**
 * SimulationOverlay.tsx
 * -----------------------------------------------------------------------------
 * Interactive Simulation Overlay — a collapsible edge panel exposing three
 * live controls that mutate ceremony parameters and drive the Agent Mesh's
 * validation routines. When a slider crosses a critical threshold, the
 * responsible agent's triage log surfaces as an animated alert.
 *
 *   Guest Volatility Metric  → HospitalityAgent (capacity + spatial density)
 *   Fabric Drapery Weight    → LogisticsAgent  (rigging / structural load)
 *   Lighting Shift Offset    → EnvironmentalAgent (Kelvin drift vs chapter)
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";

import {
  CEREMONY_CHAPTERS,
  type ChapterId,
} from "./ceremonyConfig";
import {
  AgentMesh,
  DEFAULT_PARAMETERS,
  type AgentId,
  type MeshBatch,
  type MeshMessage,
} from "@/lib/agents";

// -----------------------------------------------------------------------------
// Slider → parameter mappings
// -----------------------------------------------------------------------------

const GUEST_MIN = 50;
const GUEST_MAX = 500;
const GUEST_CAPACITY = 400; // > 400 guests → critical over-capacity

const GSM_MIN = 200;
const GSM_MAX = 600;
/** GSM → total suspended kg over a grand canopy; 500 GSM ≈ the 1200kg rig limit. */
const GSM_TO_KG = 2.4;

const KELVIN_MIN = 2000;
const KELVIN_MAX = 6500;

/** Aisle clearance shrinks as guest density rises (spatial-density rule). */
function guestsToClearanceM(guests: number): number {
  return Math.max(0.4, 3.0 - guests / 250);
}

const AGENT_LABEL: Readonly<Record<AgentId, string>> = {
  logistics: "Logistics",
  environmental: "Environmental",
  hospitality: "Hospitality",
  curation: "Curation",
  mesh: "Mesh",
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export interface SimulationOverlayProps {
  readonly chapterId: ChapterId;
}

export default function SimulationOverlay({
  chapterId,
}: SimulationOverlayProps): JSX.Element {
  const meshRef = useRef<AgentMesh | null>(null);
  const [batch, setBatch] = useState<MeshBatch | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const [guests, setGuests] = useState(180);
  const [gsm, setGsm] = useState(300);
  const [kelvin, setKelvin] = useState(
    () => CEREMONY_CHAPTERS[chapterId].lighting.temperatureK,
  );

  // Create the mesh on mount (client only — keeps Date.now out of render), then
  // re-align + re-evaluate whenever the ceremony chapter changes.
  useEffect(() => {
    const target = CEREMONY_CHAPTERS[chapterId].lighting.temperatureK;
    let mesh = meshRef.current;

    if (!mesh) {
      mesh = new AgentMesh({
        chapter: chapterId,
        parameters: {
          ...DEFAULT_PARAMETERS,
          hospitality: {
            ...DEFAULT_PARAMETERS.hospitality,
            guestCapacity: GUEST_CAPACITY,
            guestCount: guests,
            routingClearanceM: guestsToClearanceM(guests),
          },
          environment: {
            ...DEFAULT_PARAMETERS.environment,
            fabricWeightKg: gsm * GSM_TO_KG,
            colorTempK: target,
          },
        },
      });
      meshRef.current = mesh;
      setKelvin(target);
      setBatch(mesh.getLastBatch());
      return;
    }

    // Chapter changed: realign lighting to the new target and re-evaluate.
    setKelvin(target);
    mesh.setChapter(chapterId);
    setBatch(mesh.updateParameters({ environment: { colorTempK: target } }));
    // guests/gsm are only read for first-mount init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const onGuests = useCallback((value: number) => {
    setGuests(value);
    const mesh = meshRef.current;
    if (!mesh) return;
    setBatch(
      mesh.updateParameters({
        hospitality: {
          guestCount: value,
          routingClearanceM: guestsToClearanceM(value),
        },
      }),
    );
  }, []);

  const onGsm = useCallback((value: number) => {
    setGsm(value);
    const mesh = meshRef.current;
    if (!mesh) return;
    setBatch(
      mesh.updateParameters({
        environment: { fabricWeightKg: value * GSM_TO_KG },
      }),
    );
  }, []);

  const onKelvin = useCallback((value: number) => {
    setKelvin(value);
    const mesh = meshRef.current;
    if (!mesh) return;
    setBatch(mesh.updateParameters({ environment: { colorTempK: value } }));
  }, []);

  const alerts: readonly MeshMessage[] = batch
    ? batch.messages.filter(
        (m) => m.severity === "warning" || m.severity === "critical",
      )
    : [];

  const status = batch?.status ?? "ok";

  return (
    <>
      <style>{styleSheet}</style>

      {/* Alert stack — the agents' live triage log. */}
      <div className="sim-alerts">
        {alerts.map((m) => (
          <div
            key={m.id}
            className={`sim-alert sim-alert--${m.severity}`}
            role="alert"
          >
            <div className="sim-alert__head">
              <span className="sim-alert__agent">{AGENT_LABEL[m.source]}</span>
              <span className="sim-alert__code">{m.code}</span>
            </div>
            <div className="sim-alert__summary">{m.summary}</div>
          </div>
        ))}
      </div>

      {/* Collapsible control panel pinned to the left edge. */}
      <div
        className="sim-panel"
        style={{ transform: collapsed ? "translateX(-300px)" : "translateX(0)" }}
      >
        <button
          type="button"
          className="sim-panel__handle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Open simulation panel" : "Close simulation panel"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "⚙" : "‹"}
        </button>

        <div className="sim-panel__body">
          <div className="sim-panel__title">
            <span>Simulation Overlay</span>
            <span className={`sim-status sim-status--${status}`}>
              {status.toUpperCase()}
            </span>
          </div>

          <Slider
            label="Guest Volatility Metric"
            min={GUEST_MIN}
            max={GUEST_MAX}
            step={5}
            value={guests}
            onChange={onGuests}
            readout={`${guests} guests · aisle ${guestsToClearanceM(guests).toFixed(2)}m`}
          />
          <Slider
            label="Fabric Drapery Weight"
            min={GSM_MIN}
            max={GSM_MAX}
            step={10}
            value={gsm}
            onChange={onGsm}
            readout={`${gsm} GSM · ${Math.round(gsm * GSM_TO_KG)}kg suspended`}
          />
          <Slider
            label="Lighting Shift Offset"
            min={KELVIN_MIN}
            max={KELVIN_MAX}
            step={50}
            value={kelvin}
            onChange={onKelvin}
            readout={`${kelvin}K · target ${CEREMONY_CHAPTERS[chapterId].lighting.temperatureK}K`}
          />

          <div className="sim-panel__foot">
            {batch
              ? `${batch.messages.length} checks · ${batch.conflicts} conflict(s)`
              : "initialising…"}
          </div>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Slider control
// -----------------------------------------------------------------------------

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  readout,
}: {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly readout: string;
}): JSX.Element {
  return (
    <label className="sim-slider">
      <span className="sim-slider__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="sim-slider__readout">{readout}</span>
    </label>
  );
}

// -----------------------------------------------------------------------------
// Styles (self-contained; theme-matched ivory/gold on translucent dark)
// -----------------------------------------------------------------------------

const styleSheet = `
  .sim-panel {
    position: absolute;
    top: 50%;
    left: 0;
    width: 300px;
    margin-top: -150px;
    transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
    font-family: var(--font-geist-sans, system-ui, sans-serif);
    z-index: 20;
  }
  .sim-panel__body {
    pointer-events: auto;
    background: rgba(16, 14, 12, 0.72);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(200, 162, 75, 0.35);
    border-left: none;
    border-radius: 0 14px 14px 0;
    padding: 1rem 1.1rem 0.9rem;
    color: #FDFBF7;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.45);
  }
  .sim-panel__handle {
    position: absolute;
    top: 12px;
    right: -34px;
    width: 34px;
    height: 44px;
    pointer-events: auto;
    background: rgba(16, 14, 12, 0.72);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(200, 162, 75, 0.35);
    border-left: none;
    border-radius: 0 10px 10px 0;
    color: #C8A24B;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .sim-panel__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    margin-bottom: 0.9rem;
  }
  .sim-status {
    font-size: 0.62rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    letter-spacing: 0.06em;
  }
  .sim-status--ok { background: rgba(120, 190, 120, 0.2); color: #9ede9e; }
  .sim-status--info { background: rgba(120, 160, 210, 0.2); color: #a9c9f0; }
  .sim-status--warning { background: rgba(232, 168, 60, 0.22); color: #f0c27a; }
  .sim-status--critical { background: rgba(232, 90, 90, 0.24); color: #ff9a9a; }

  .sim-slider {
    display: block;
    margin-bottom: 0.85rem;
  }
  .sim-slider__label {
    display: block;
    font-size: 0.78rem;
    opacity: 0.9;
    margin-bottom: 0.25rem;
  }
  .sim-slider input[type="range"] {
    width: 100%;
    accent-color: #C8A24B;
    cursor: pointer;
  }
  .sim-slider__readout {
    display: block;
    font-size: 0.68rem;
    opacity: 0.6;
    margin-top: 0.15rem;
    font-variant-numeric: tabular-nums;
  }
  .sim-panel__foot {
    font-size: 0.66rem;
    opacity: 0.55;
    border-top: 1px solid rgba(200, 162, 75, 0.18);
    padding-top: 0.55rem;
    margin-top: 0.3rem;
  }

  .sim-alerts {
    position: absolute;
    top: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(90vw, 420px);
    z-index: 25;
    pointer-events: none;
  }
  .sim-alert {
    pointer-events: auto;
    background: rgba(16, 14, 12, 0.82);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    border-left: 3px solid;
    padding: 0.6rem 0.85rem;
    color: #FDFBF7;
    font-family: var(--font-geist-sans, system-ui, sans-serif);
    box-shadow: 0 6px 30px rgba(0, 0, 0, 0.4);
    animation: simAlertIn 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .sim-alert--warning { border-left-color: #f0c27a; }
  .sim-alert--critical { border-left-color: #ff6a6a; }
  .sim-alert__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.15rem;
  }
  .sim-alert__agent {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .sim-alert__code {
    font-size: 0.6rem;
    opacity: 0.6;
    font-family: var(--font-geist-mono, ui-monospace, monospace);
  }
  .sim-alert__summary {
    font-size: 0.76rem;
    opacity: 0.9;
    line-height: 1.35;
  }
  @keyframes simAlertIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
