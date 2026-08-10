import Link from 'next/link';
import { Lockup, ThemeToggle } from '@tc/ui-web';
import { MarketingNavAuth } from '../../components/MarketingNavAuth';

/**
 * Marketing shell — header and footer shared by the landing, pricing,
 * occasion, help, careers and legal pages (T-21).
 *
 * Mostly a server component — these pages are the SEO surface and the
 * Lighthouse target (`05-BUILD-PLAYBOOK` T-21 DoD ≥95) — with two small
 * client islands (`ThemeToggle`, `MarketingNavAuth`) rather than converting
 * the whole shell to client JS. The header is sticky but opaque from the
 * start — `02 §5.1`'s transparent-over-hero treatment predates the Meridian
 * rebuild, and a translucent bar over the thesis clock would put chrome in
 * front of the one thing `07 §X.1` says opens the page.
 */
const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/help', label: 'Help' },
  { href: '/careers', label: 'Careers' },
  { href: '/legal/terms', label: 'Terms' },
  { href: '/legal/privacy', label: 'Privacy' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--color-rule)] bg-[var(--color-bg-primary)]">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="TimelyCapsule home" className="motion-instant">
            <Lockup size={22} />
          </Link>
          <nav aria-label="Site" className="flex items-center gap-5 text-[length:var(--text-body-s)]">
            <Link href="/pricing" className="motion-instant text-secondary hover:text-foreground">
              Pricing
            </Link>
            <Link href="/help" className="motion-instant text-secondary hover:text-foreground">
              Help
            </Link>
            <MarketingNavAuth className="motion-instant text-secondary hover:text-foreground" />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-[var(--color-rule)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <Lockup size={20} />
            <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[length:var(--text-body-s)]">
              {FOOTER_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="motion-instant text-secondary hover:text-foreground">
                  {link.label}
                </Link>
              ))}
              <MarketingNavAuth className="motion-instant text-secondary hover:text-foreground" />
            </nav>
          </div>
          <p className="text-[length:var(--text-caption)] text-secondary">
            © {new Date().getFullYear()} TimelyCapsule. Contents are encrypted on your device; we cannot read them.
          </p>
        </div>
      </footer>
    </div>
  );
}
