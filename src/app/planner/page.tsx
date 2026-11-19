import type { Metadata } from "next";
import Planner from "@/components/planner/Planner";

export const metadata: Metadata = {
  title: "Avisha Planner",
  description: "Plan ceremonies, guests and vendors. Saved on this device.",
};

/**
 * The real planner. Server Component shell; all editing happens client-side
 * in <Planner /> because the wedding lives in localStorage (Phase 1).
 * The static design prototype moved to `/planner-design` (next.config.ts).
 */
export default function PlannerPage() {
  return <Planner />;
}
