import type { ReactNode } from 'react';

// Inline styles only — email clients don't reliably support external/<style>
// CSS or CSS custom properties, so Meridian's palette (02-UX-DESIGN.md §6)
// is hardcoded here rather than imported from packages/ui-web/tokens.css.
const COLORS = {
  bg: '#faf7f2', // parchment
  card: '#ffffff',
  ink: '#1c1e2e',
  mist: '#8a8fa3',
  gold: '#d4a24e',
};

export function EmailLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ margin: 0, padding: 0, backgroundColor: COLORS.bg, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            <tr>
              <td align="center" style={{ padding: '32px 16px' }}>
                <table
                  width="480"
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                  style={{ backgroundColor: COLORS.card, borderRadius: 16, overflow: 'hidden' }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: '32px 40px' }}>
                        <p style={{ fontSize: 20, fontWeight: 600, color: COLORS.ink, margin: '0 0 24px' }}>
                          TimelyCapsule
                        </p>
                        {children}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ fontSize: 12, color: COLORS.mist, marginTop: 24 }}>
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

export const emailColors = COLORS;
