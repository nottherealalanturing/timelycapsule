import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';
import { Providers } from './providers';
import { SITE_URL } from '../lib/site';
import './globals.css';

/**
 * Meridian V2 · Pairing C — "The Almanac" (design/05 §Typography).
 *
 *   Records     → Source Serif 4   the letter, reveal, exports, print
 *   Instruments → IBM Plex Sans    chrome, timeline, dense data
 *   Hallmarks   → IBM Plex Mono    metadata, durations, public IDs
 *
 * All three are SIL OFL and variable, so they can be self-hosted permanently
 * — the licence constraint that ruled out Pairing B. `next/font/google`
 * self-hosts the files into the build output, so no request ever reaches
 * Google at runtime; that matters here because a request to a third party
 * on the recipient reveal path would leak that a capsule was opened.
 *
 * Serif is loaded with an italic axis because a record is read prose.
 * The instrument faces are not: emphasis in an instrument is weight, never
 * slant, and shipping unused axes costs bundle against a hard 3 MiB cap.
 */
const sourceSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  // Required for next/og's per-route opengraph-image files (below) to resolve
  // to an absolute URL — without it, crawlers that don't follow relative
  // og:image URLs (several do not) see nothing.
  metadataBase: new URL(SITE_URL),
  title: 'TimelyCapsule',
  description: 'Send it to the future.',
};

// Applies the resolved theme before paint, so there's no flash of the wrong
// theme while React hydrates (data-theme drives packages/ui-web's
// tokens.css — see the [data-theme] rules there).
//
// Light/paper is the unconditional default. Precedence: an explicit stored
// choice (from ThemeToggle, anywhere it's rendered) wins outright; failing
// that, light — never the OS's prefers-color-scheme. A prior "Product
// Quality Pass" (2026-08-10) had introduced a prefers-color-scheme fallback
// here, which meant a brand-new visitor with a dark OS setting got dark
// mode with zero action on their part; reverted, since light-by-default is
// a deliberate product decision, not an accident to defer to the OS on.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('tc-theme');
    var theme = stored === 'dark' || stored === 'light' ? stored : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

// Dev-only marketing-screenshot capture aid: seeds a real session's tokens
// from a query param into localStorage before React ever mounts, so a
// headless Chrome CLI screenshot (no click/type capability, just load-then-
// capture — see design/.build-launch.mjs) can land on an authenticated page
// in one navigation instead of needing an interactive login. Only wired
// server-side when NODE_ENV is 'development' (the whole <script> tag is
// omitted from the tree in any other build), and it does nothing unless the
// two query params are both explicitly present.
const DEV_SESSION_SEED_SCRIPT = `
(function () {
  try {
    var p = new URLSearchParams(window.location.search);
    var at = p.get('__seed_at');
    var rt = p.get('__seed_rt');
    if (at && rt) {
      localStorage.setItem('tc-access-token', at);
      localStorage.setItem('tc-refresh-token', rt);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {process.env.NODE_ENV === 'development' && (
          <script dangerouslySetInnerHTML={{ __html: DEV_SESSION_SEED_SCRIPT }} />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
