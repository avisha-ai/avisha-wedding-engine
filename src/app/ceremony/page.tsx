import type { Metadata } from "next";
import CeremonyExperience from "@/components/ceremony/CeremonyExperience";

export const metadata: Metadata = {
  title: "Living Ceremony Layer",
  description: "Phase II — a 3D journey through the seven ceremony chapters.",
};

/**
 * Demo route for the Phase II Living Ceremony Layer. Full-viewport canvas;
 * use ← / → (or the on-screen controls) to move between the 7 chapters.
 *
 * This is a Server Component, so it reaches the WebGL scene through
 * <CeremonyExperience /> → <CeremonyCanvasClient />, which is where the
 * `ssr: false` dynamic import is allowed to live.
 *
 * `?w=` optionally carries a share token from the planner (see
 * `src/lib/wedding/store.ts`). In Next 16 `searchParams` is a Promise.
 */
export default async function CeremonyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { w } = await searchParams;
  const token = typeof w === "string" ? w : undefined;
  return (
    <main
      style={{
        position: "relative",
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      <CeremonyExperience token={token} />
    </main>
  );
}
