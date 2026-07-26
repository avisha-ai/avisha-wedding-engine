import type { Metadata } from "next";
import CeremonyCanvas from "@/components/ceremony/CeremonyCanvas";

export const metadata: Metadata = {
  title: "Living Ceremony Layer",
  description: "Phase II — a 3D journey through the seven ceremony chapters.",
};

/**
 * Demo route for the Phase II Living Ceremony Layer. Full-viewport canvas;
 * use ← / → (or the on-screen controls) to move between the 7 chapters.
 */
export default function CeremonyPage() {
  return (
    <main style={{ width: "100vw", height: "100dvh", overflow: "hidden" }}>
      <CeremonyCanvas initialChapter="proposal" />
    </main>
  );
}
