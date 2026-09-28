import type { NextConfig } from "next";

/**
 * Response headers for the deployed exhibition.
 *
 * These live here rather than in a `vercel.json` on purpose. Next owns the
 * response for every route in this app, `headers()` is the framework's
 * supported hook for adding to it, and unlike a platform config file it also
 * applies under `next dev` and `next start` — so what is tested locally is what
 * ships. A `vercel.json` would only be the right home for platform concerns
 * Next has no say over (regions, crons, non-Next routes); this app has none.
 *
 * A note on the ambient soundscape, since it is the one place headers and audio
 * genuinely touch: `src/components/ceremony/ceremonyAudio.ts` synthesises every
 * chapter bed with the Web Audio API and cross-fades between them on gain nodes
 * in-process. Nothing is fetched, so no cache, CORS or content header can
 * affect a cross-fade. The only header that could reach the audio engine at all
 * is `Permissions-Policy: autoplay`, and restricting it risks blocking the
 * AudioContext resume behind the soundscape toggle. It is deliberately not set.
 */
const securityHeaders = [
  // Never let a browser second-guess a declared Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the origin cross-site, the full path same-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The ceremony canvas reads pointer and keyboard input full-viewport; framing
  // it cross-origin is how that gets turned against a visitor. Same-origin
  // framing stays allowed so the exhibition can embed its own routes.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // The invitation collects a name; nothing here needs hardware. Note the
  // absence of `autoplay` — see the comment above.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // Drop `x-powered-by`: it names the framework and version to no one's benefit.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
