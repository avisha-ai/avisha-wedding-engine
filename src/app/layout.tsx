import type { Metadata } from "next";
import { Barlow, Geist, Geist_Mono, Marcellus } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Marcellus over Barlow — the pairing the design engine's own documents load
 * (`public/assets/design/*.dc.html`). Both are non-variable, so `weight` is
 * required: per the bundled docs, it is optional only for variable fonts, which
 * is why Geist above can omit it.
 *
 * Exposed as CSS variables rather than applied to `<body>`: the ledger and the
 * ceremony keep their own type, and only the landing card reaches for these.
 */
const marcellus = Marcellus({
  variable: "--font-marcellus",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Wedding of Mayur and Avani",
  description: "An invitation. Enter your name to step inside.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning={true}
      className={`${geistSans.variable} ${geistMono.variable} ${marcellus.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
