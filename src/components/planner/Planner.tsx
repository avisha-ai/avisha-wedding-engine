"use client";

/**
 * Planner.tsx — the real planner at `/planner`.
 * -----------------------------------------------------------------------------
 * Replaces the static design mock-up (still served at `/planner-design`) with
 * editable forms over the shared wedding model. Phase 1: everything is saved on
 * this device only (localStorage). Export/Import moves it between devices.
 */

import Link from "next/link";
import { useCallback, useRef, useState, type ChangeEvent, type JSX } from "react";

import { coupleNames } from "@/lib/branding";
import { SAMPLE_WEDDING } from "@/lib/wedding/sample";
import {
  clearWedding,
  encodeWeddingToken,
  exportWeddingJson,
  importWeddingJson,
  newId,
  publicWedding,
  saveWedding,
  useHydrated,
  useStoredWedding,
} from "@/lib/wedding/store";
import type { Guest, Wedding } from "@/lib/wedding/types";

import {
  CeremoniesSection,
  GuestsSection,
  OverviewSection,
  VendorsSection,
  type Update,
} from "./sections";
import { BODY_FONT, Button, C, HEADING_FONT, inputClass } from "./ui";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "ceremonies", label: "Ceremonies" },
  { id: "guests", label: "Guests" },
  { id: "vendors", label: "Vendors" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Planner(): JSX.Element {
  const hydrated = useHydrated();
  const wedding = useStoredWedding();
  const [tab, setTab] = useState<TabId>("overview");
  const [notice, setNotice] = useState("");
  const [lastLink, setLastLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const update = useCallback<Update>(
    (fn) => {
      if (!wedding) return;
      if (!saveWedding(fn(wedding))) {
        setNotice("Could not save: this browser is blocking storage (private mode?).");
      }
    },
    [wedding],
  );

  const start = (w: Wedding) => {
    if (!saveWedding(w)) setNotice("Could not save: this browser is blocking storage.");
  };

  const copyGuestLink = useCallback(
    async (guest: Guest) => {
      if (!wedding) return;
      const token = encodeWeddingToken(publicWedding(wedding, guest.id));
      const url = `${window.location.origin}/invite/${encodeURIComponent(guest.id)}?w=${token}`;
      setLastLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setNotice(`Link for ${guest.name} copied.`);
      } catch {
        setNotice(`Copy the link for ${guest.name} from the box below.`);
      }
    },
    [wedding],
  );

  const exportJson = () => {
    if (!wedding) return;
    const blob = new Blob([exportWeddingJson(wedding)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "avisha-wedding.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const parsed = importWeddingJson(await file.text());
    if (!parsed) {
      setNotice("That file is not a wedding exported from this planner.");
      return;
    }
    if (wedding && !window.confirm("Replace the wedding on this device with the imported file?")) return;
    start(parsed);
    setNotice("Wedding imported.");
  };

  const reset = () => {
    if (!window.confirm("Delete the wedding saved on this device? Export it first if you need a copy.")) return;
    clearWedding();
    setNotice("Planner cleared.");
  };

  const names = coupleNames(wedding);

  return (
    <main
      className="min-h-screen w-full px-4 py-6 sm:px-8 sm:py-10"
      style={{ background: C.ivory, color: C.text, fontFamily: BODY_FONT }}
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: C.accentText }}>
              Avisha Planner
            </p>
            <h1 className="mt-1 text-3xl sm:text-4xl" style={{ fontFamily: HEADING_FONT }}>
              {wedding ? names.short : "Plan your wedding"}
            </h1>
          </div>
          {wedding && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/ceremony"
                className="inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm text-white"
                style={{ background: C.accentText, borderColor: C.accentText }}
              >
                Preview in 3D
              </Link>
              <Button onClick={exportJson}>Export JSON</Button>
              <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
              <Button variant="danger" onClick={reset}>
                Clear
              </Button>
            </div>
          )}
        </header>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Import wedding JSON file"
          tabIndex={-1}
          onChange={(e) => void importJson(e)}
        />

        <p role="status" aria-live="polite" className="mb-4 min-h-[1.25rem] text-sm" style={{ color: C.accentText }}>
          {notice}
        </p>

        {lastLink && (
          <label className="mb-5 flex flex-col gap-1 text-sm">
            <span style={{ color: C.muted }}>Last guest link</span>
            <input readOnly className={inputClass} value={lastLink} onFocus={(e) => e.target.select()} />
          </label>
        )}

        {!hydrated ? (
          <p style={{ color: C.muted }}>Loading your planner…</p>
        ) : !wedding ? (
          <section
            className="rounded-xl border p-6"
            style={{ background: C.surface, borderColor: C.line }}
          >
            <h2 className="text-xl" style={{ fontFamily: HEADING_FONT }}>
              Start planning
            </h2>
            <p className="mt-2 max-w-prose text-sm" style={{ color: C.muted }}>
              Your plan is saved in this browser only. Nothing is sent anywhere. Use Export to keep a
              copy or move it to another device.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => start(SAMPLE_WEDDING)}>
                Start with the demo wedding
              </Button>
              <Button
                onClick={() =>
                  start({
                    id: newId("wedding"),
                    couple: { partnerA: "", partnerB: "" },
                    events: [],
                    households: [],
                    vendors: [],
                  })
                }
              >
                Start blank
              </Button>
              <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
            </div>
          </section>
        ) : (
          <>
            <div role="tablist" aria-label="Planner sections" className="mb-5 flex flex-wrap gap-2 border-b pb-3" style={{ borderColor: C.line }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className="min-h-[40px] rounded-full px-4 text-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[#A8842C]"
                  style={
                    tab === t.id
                      ? { background: C.text, color: C.ivory }
                      : { background: "transparent", color: C.text }
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === "overview" && <OverviewSection wedding={wedding} update={update} />}
              {tab === "ceremonies" && <CeremoniesSection wedding={wedding} update={update} />}
              {tab === "guests" && (
                <GuestsSection wedding={wedding} update={update} onCopyLink={(g) => void copyGuestLink(g)} />
              )}
              {tab === "vendors" && <VendorsSection wedding={wedding} update={update} />}
            </div>

            <p className="mt-8 text-xs" style={{ color: C.muted }}>
              Saved on this device only. The original design mock-up is at{" "}
              <a href="/planner-design" className="underline" style={{ color: C.accentText }}>
                /planner-design
              </a>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}
