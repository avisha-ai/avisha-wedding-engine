import type { Metadata } from "next";
import CeremonyCanvasClient from "@/components/ceremony/CeremonyCanvasClient";

export const metadata: Metadata = {
  title: "Living Ceremony Layer",
  description: "Phase II — a 3D journey through the seven ceremony chapters.",
};

/**
 * Demo route for the Phase II Living Ceremony Layer. Full-viewport canvas;
 * use ← / → (or the on-screen controls) to move between the 7 chapters.
 *
 * This is a Server Component, so it reaches the WebGL scene through
 * <CeremonyCanvasClient />, which is where the `ssr: false` dynamic import is
 * allowed to live.
 */
export default function CeremonyPage() {
  return (
    <main style={{ width: "100vw", height: "100dvh", overflow: "hidden" }}>
      <CeremonyCanvasClient initialChapter="proposal" />
    </main>
  );
}
