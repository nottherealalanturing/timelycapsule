import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
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
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
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
