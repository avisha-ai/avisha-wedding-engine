import type { Metadata } from "next";
import GuestInvite from "@/components/planner/GuestInvite";

export const metadata: Metadata = {
  title: "Your invitation",
  description: "Your wedding invitation and replies.",
  // Personal pages: keep them out of search results.
  robots: { index: false, follow: false },
};

/**
 * `/invite/[guestId]?w=<token>` — one guest's invitation. Plain DOM, no 3D, so
 * it loads quickly on slow phones; a button leads into the ceremony.
 * In Next 16 `params` and `searchParams` are Promises.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ guestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guestId } = await params;
  const { w } = await searchParams;
  return (
    <GuestInvite
      guestId={guestId}
      token={typeof w === "string" ? w : undefined}
    />
  );
}
