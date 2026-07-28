import { EmailLayout, emailColors } from './Layout.js';

export interface ExportReadyProps {
  downloadUrl: string;
}

export function ExportReady({ downloadUrl }: ExportReadyProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Your data export is ready</p>
      <p style={{ fontSize: 14, color: emailColors.mist, margin: '0 0 24px', lineHeight: 1.5 }}>
        This link expires in 7 days. It contains your capsules&apos; encrypted contents and a metadata file — the
        contents stay encrypted, just as they are on our servers.
      </p>
      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tbody>
          <tr>
            <td style={{ borderRadius: 10, backgroundColor: emailColors.gold }}>
              <a
                href={downloadUrl}
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: emailColors.ink,
                  textDecoration: 'none',
                }}
              >
                Download export
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
