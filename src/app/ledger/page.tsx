import type { Metadata } from "next";

import AtelierLedger from "@/components/AtelierLedger";

export const metadata: Metadata = {
  // Matches the component header and this file's own docblock below.
  // "Instrument_001" was the odd one out of the three; it loses.
  title: "Avisha // EXHIBITION_001",
  description: "Information viscosity & stream cavitation monitor.",
};

/**
 * `/ledger` — Exhibition 001.
 *
 * The route is a thin shell: <AtelierLedger /> is a Client Component because
 * the whole instrument is driven by a local file the visitor drops in, which
 * never touches the server.
 */
export default function LedgerPage() {
  return <AtelierLedger />;
}
