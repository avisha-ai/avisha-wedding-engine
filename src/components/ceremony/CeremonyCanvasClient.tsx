"use client";

/**
 * CeremonyCanvasClient.tsx
 * -----------------------------------------------------------------------------
 * Client-only bridge for <CeremonyCanvas />.
 *
 * The canvas is a WebGL scene: it builds a renderer, rasterises procedural
 * textures, and compiles shader programs — none of which exist on the server.
 * Prerendering it produces markup that can only ever be thrown away, so this
 * wrapper loads it with `ssr: false` and the route renders the placeholder
 * until the bundle lands on the client.
 *
 * This file exists *because* of where `ssr: false` is allowed. Per the bundled
 * Next docs (`01-app/02-guides/lazy-loading.md`):
 *
 *   > `ssr: false` is not supported in Server Components. You will see an error
 *   > if you try to use it in Server Components.
 *
 * `app/ceremony/page.tsx` is a Server Component, so the option cannot live
 * there. A `"use client"` module in between is the supported shape.
 */

import dynamic from "next/dynamic";
import type { JSX } from "react";

import type { CeremonyCanvasProps } from "./CeremonyCanvas";

/**
 * Matches the ceremony's opening background (`PALETTE.templeIvory`, the
 * proposal chapter) so the swap from placeholder to canvas is not a flash.
 */
function CanvasPlaceholder(): JSX.Element {
  return (
    <div
      aria-hidden
      style={{ width: "100%", height: "100%", background: "#FDFBF7" }}
    />
  );
}

const CeremonyCanvas = dynamic(() => import("./CeremonyCanvas"), {
  ssr: false,
  loading: CanvasPlaceholder,
});

/** Renders the ceremony canvas on the client only. Props pass straight through. */
export default function CeremonyCanvasClient(
  props: CeremonyCanvasProps,
): JSX.Element {
  return <CeremonyCanvas {...props} />;
}
