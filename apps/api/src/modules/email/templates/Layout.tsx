import type { ReactNode } from 'react';

/**
 * The Meridian email design system.
 *
 * Email is explicitly in scope for the identity, not an afterthought:
 * `design/05-IDENTITY-DECISION.md`'s register table puts "emails" in the
 * **record** register alongside letters/exports/print — paper, permanently,
 * in both themes, because there is no dark-mode toggle inside a mail client
 * to make that a live choice. `design/04-VISUAL-IDENTITY.md §10` names the
 * Meridian Line as one of five signature elements required everywhere,
 * spelling out its email form directly: *"In email it's the rule."*
 *
 * Values below are the real record-register tokens from
 * `packages/ui-web/src/tokens.css`, copied rather than imported — email
 * clients don't reliably support external CSS or custom properties, so
 * there's no way to reuse the token file directly, only its values.
 *
 * `rule` is a solid hex rather than `--r-rule`'s rgba(22,24,26,.14): Outlook
 * desktop's Word rendering engine drops rgba borders and several other
 * translucency forms, so a flattened approximation (22,24,26 at 14% over
 * the raised surface) is used instead of the token verbatim — the one place
 * this file departs from copying tokens.css byte-for-byte, and it departs
 * for compatibility, not preference.
 */
const COLORS = {
  ground: '#e9eae6', // --r-ground — the outer page
  raised: '#f3f4f0', // --r-raised — the letter itself, a bounded object on the ground
  ink: '#16181a', // --r-ink — 14.73 AAA on ground
  muted: '#5e635c', // --r-muted — 5.09 AA
  iron: '#2c3a4a', // --r-iron — 9.59 AAA, the record register's interactive colour
  onIron: '#f3f4f0', // text placed on an iron fill
  rule: '#d9dad4', // flattened --r-rule (see comment above)
  danger: '#a33f28', // --r-danger
};

/**
 * The letterhead. Mono/uppercase/tracked — the same idiom as the in-app
 * `Hallmark` component (`packages/ui-web/src/Hallmark.tsx`) — because the
 * wordmark is institutional, and `07 §II.2` holds the institution static
 * across every register: the letter you're reading is new, but who kept it
 * is not, so it's set apart from the serif body rather than blended into it.
 */
function Letterhead() {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
      <tbody>
        <tr>
          <td style={{ paddingBottom: 20 }}>
            <span
              style={{
                fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: COLORS.muted,
              }}
            >
              TimelyCapsule
            </span>
          </td>
        </tr>
        <tr>
          {/* The Meridian Line, in its email form — `04 §10`: "In email it's the rule." */}
          <td style={{ borderTop: `1px solid ${COLORS.rule}`, fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
        </tr>
      </tbody>
    </table>
  );
}

export function EmailLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ margin: 0, padding: 0, backgroundColor: COLORS.ground }}>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            <tr>
              <td align="center" style={{ padding: '40px 16px' }}>
                {/* The letter — a bounded object on the ground, never the ground
                    itself (design/06 §Constraint 1, carried into email). */}
                <table
                  width="480"
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                  style={{ backgroundColor: COLORS.raised, borderRadius: 4, border: `1px solid ${COLORS.rule}` }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: '32px 40px' }}>
                        <Letterhead />
                        <div
                          style={{
                            fontFamily: "'Source Serif 4', Charter, 'Iowan Old Style', Georgia, serif",
                            fontSize: 16,
                            lineHeight: 1.65,
                            color: COLORS.ink,
                          }}
                        >
                          {children}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p
                  style={{
                    fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: COLORS.muted,
                    marginTop: 20,
                  }}
                >
                  TimelyCapsule · This is a transactional email about your account.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

/**
 * A bulletproof table-button in the record register's interactive colour.
 * Every content template used to hand-roll this identically with the old
 * V1 gold — centralised so a future palette correction touches one place.
 */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <table cellPadding={0} cellSpacing={0} role="presentation">
      <tbody>
        <tr>
          <td style={{ borderRadius: 3, backgroundColor: COLORS.iron }}>
            <a
              href={href}
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.onIron,
                textDecoration: 'none',
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * An instrument reading set inline in a record — a code, a duration, an
 * absolute date. Mono, per `05 §Typography`'s "hallmarks and metadata in
 * mono" rule, the same reason the in-app Dual Clock and Hallmark never
 * render in the serif body face.
 */
export function EmailReading({ children, large = false }: { children: ReactNode; large?: boolean }) {
  return (
    <span
      style={{
        fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
        fontSize: large ? 28 : 14,
        letterSpacing: large ? '0.1em' : '0.02em',
        color: COLORS.ink,
      }}
    >
      {children}
    </span>
  );
}

export const emailColors = COLORS;
