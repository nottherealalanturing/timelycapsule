import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';
import { Providers } from './providers';
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
  title: 'TimelyCapsule',
  description: 'Send it to the future.',
};

// Applies the persisted theme choice before paint, so there's no flash of
// the wrong theme while React hydrates (data-theme drives packages/ui-web's
// tokens.css — see the [data-theme] rules there).
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('tc-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
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
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
