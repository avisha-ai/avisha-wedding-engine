"use client";

/**
 * page.tsx — the landing card.
 * -----------------------------------------------------------------------------
 * A greeting card, not an instrument. The Atelier ledger that used to render
 * here is untouched and still lives at `/ledger`; this route simply no longer
 * reaches for it.
 *
 * Typography is Marcellus over Barlow — the same pairing the design engine's
 * own documents load (`public/assets/design/*.dc.html`), so the first thing a
 * guest sees is set in the project's own voice rather than a fresh one.
 * Colours come from `ceremonyConfig`'s PALETTE: temple ivory ground, champagne
 * gold rule, midnight indigo text.
 */

import { useRouter } from "next/navigation";

import { COUPLE_PAIR } from "@/lib/branding";
import { useCallback, useState, type FormEvent, type JSX } from "react";

/**
 * Where the guest's name is left for the experience that follows.
 *
 * Deliberately `sessionStorage` and not a query parameter: a name is personal
 * data, and a URL carrying it ends up in history, referrer headers and any
 * access log between here and the visitor. Session storage keeps it on the
 * device and clears itself when the tab closes.
 */
const GUEST_NAME_KEY = "avisha.guestName";

/** Palette, mirrored from `ceremonyConfig` so the card owns no new colours. */
const INK = "#1A1B4B"; // midnightIndigo
const IVORY = "#FDFBF7"; // templeIvory
const GOLD = "#C8A24B"; // champagneGold

export default function Home(): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const ready = trimmed.length > 0;

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!ready) return;
      try {
        window.sessionStorage.setItem(GUEST_NAME_KEY, trimmed);
      } catch {
        // Private-mode Safari and hardened browsers can refuse storage. The
        // greeting is a courtesy, not a gate — step inside regardless.
      }
      router.push("/ceremony");
    },
    [ready, trimmed, router],
  );

  return (
    <main
      className="flex min-h-screen w-full items-center justify-center px-6 py-16"
      style={{
        // A single soft glow above centre — the fairytale light, and the only
        // background treatment on the page.
        background: `radial-gradient(120% 90% at 50% 18%, #FFFFFF 0%, ${IVORY} 46%, #F3EEE4 100%)`,
        color: INK,
      }}
    >
      <div
        className="w-full max-w-xl text-center"
        style={{ fontFamily: "var(--font-barlow), system-ui, sans-serif" }}
      >
        {/* Greeting */}
        <h1
          className="text-balance text-4xl leading-tight sm:text-5xl"
          style={{
            fontFamily: "var(--font-marcellus), Georgia, serif",
            letterSpacing: "0.02em",
          }}
        >
          Welcome to the Wedding of
          <span className="mt-2 block" style={{ color: GOLD }}>
            {COUPLE_PAIR}
          </span>
        </h1>

        {/* Hairline rule — the card's one piece of ornament. */}
        <div
          aria-hidden
          className="mx-auto my-9 h-px w-24"
          style={{
            background: `linear-gradient(to right, transparent, ${GOLD}, transparent)`,
          }}
        />

        {/* Invitation to enter */}
        <p
          className="text-sm uppercase sm:text-base"
          style={{ letterSpacing: "0.18em", opacity: 0.72 }}
        >
          Please enter your name to step inside
        </p>

        <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-sm">
          <label htmlFor="guest-name" className="sr-only">
            Your name
          </label>
          <input
            id="guest-name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-transparent pb-3 text-center text-lg outline-none transition-colors placeholder:opacity-40 focus:border-b-2"
            style={{
              borderBottom: `1px solid ${GOLD}66`,
              color: INK,
              letterSpacing: "0.04em",
            }}
          />

          <button
            type="submit"
            disabled={!ready}
            className="mt-10 w-full rounded-full px-10 py-3.5 text-sm uppercase transition-all duration-300 enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-35 sm:w-auto"
            style={{
              background: ready ? GOLD : "transparent",
              color: ready ? IVORY : INK,
              border: `1px solid ${GOLD}`,
              letterSpacing: "0.22em",
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </main>
  );
}
