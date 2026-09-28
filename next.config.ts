import type { NextConfig } from "next";

/**
 * Design-engine documents, served as routes.
 *
 * `Avisha Cinematic.dc.html` and `Avisha Planner.dc.html` are main design-engine
 * output. They now live in `public/assets/design/` and are served under clean
 * paths by the rewrites below.
 *
 * Rewrites, not redirects: a rewrite proxies the document while the address bar
 * keeps reading `/planner`, which is what "visiting /planner loads the planner
 * document" asks for. A redirect would bounce the visitor to the raw
 * `.dc.html` URL and put the percent-encoded filename in front of them.
 *
 * Returned as a plain array, so these are `afterFiles` rewrites — per the
 * bundled docs (`05-config/01-next-config-js/rewrites.md`), an array is
 * "applied after checking the filesystem (pages and `/public` files)", and
 * "the first rewrite that resolves to a static file, page, or dynamic route is
 * served". A real page at `/planner` would therefore still win; nothing
 * currently claims either path.
 *
 * These live here rather than in `vercel.json` for one reason: `next.config.ts`
 * rewrites apply under `next dev` / `next start`, so they can be verified with
 * `curl` before shipping. The header set in `vercel.json` cannot be, and that
 * asymmetry is deliberate.
 */

/** Where the design engine's documents are served from, URL-encoded. */
const DESIGN_DIR = "/assets/design";
const CINEMATIC_DOC = `${DESIGN_DIR}/Avisha%20Cinematic.dc.html`;
const PLANNER_DOC = `${DESIGN_DIR}/Avisha%20Planner.dc.html`;

const nextConfig: NextConfig = {
  // Drop `x-powered-by`: it names the framework and version to no one's benefit.
  poweredByHeader: false,

  async rewrites() {
    return [
      { source: "/planner", destination: PLANNER_DOC },
      { source: "/cinematic", destination: CINEMATIC_DOC },

      // The cinematic document links to the planner by its original root-relative
      // filename (`href="Avisha Planner.dc.html"`). Served at `/cinematic`, that
      // resolves to `/Avisha Planner.dc.html` and would 404. Catching it here
      // keeps the cross-link working without editing the document itself —
      // these files are hand-authored design-engine work and are not ours to
      // rewrite. Both spellings are mapped because the browser sends the
      // percent-encoded form and the matcher sees the decoded path.
      { source: "/Avisha Planner.dc.html", destination: PLANNER_DOC },
      { source: "/Avisha%20Planner.dc.html", destination: PLANNER_DOC },
    ];
  },
};

export default nextConfig;
