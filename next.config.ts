import type { NextConfig } from "next";

/**
 * Response headers for this app live in `vercel.json`, not here.
 *
 * Next's own `headers()` hook would also work, and has the advantage of
 * applying under `next dev` / `next start` so the set can be verified with
 * `curl` before it ships. `vercel.json` is the chosen home anyway: it is where
 * the platform expects route configuration, and it keeps the header set in one
 * declarative file instead of behind a build step. The trade is that the
 * headers cannot be checked against a local response — the first real proof
 * they are correct is a `curl -I` against the deployment.
 *
 * `poweredByHeader` stays here because there is no `vercel.json` equivalent:
 * `x-powered-by` is emitted by Next itself, so only Next can suppress it.
 *
 * A note on the ambient soundscape, since it is the one place headers and audio
 * genuinely touch. `src/components/ceremony/ceremonyAudio.ts` synthesises every
 * chapter bed with the Web Audio API and cross-fades between them on gain nodes
 * in-process. Nothing is fetched — there are no audio files in `public/` — so
 * no cache, CORS or content header can affect a cross-fade. The only header
 * that could reach the audio engine at all is `Permissions-Policy: autoplay`,
 * and restricting it risks blocking the `AudioContext` resume behind the
 * soundscape toggle. It is deliberately absent from the `vercel.json` list.
 */
const nextConfig: NextConfig = {
  // Drop `x-powered-by`: it names the framework and version to no one's benefit.
  poweredByHeader: false,
};

export default nextConfig;
