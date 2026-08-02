import { EmailButton, EmailLayout, emailColors } from './Layout.js';

export interface ExportReadyProps {
  downloadUrl: string;
}

export function ExportReady({ downloadUrl }: ExportReadyProps) {
  return (
    <EmailLayout>
      <p style={{ fontSize: 16, color: emailColors.ink, margin: '0 0 16px' }}>Your data export is ready</p>
      <p style={{ fontSize: 14, color: emailColors.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
        This link expires in 7 days. It contains your capsules&apos; encrypted contents and a metadata file — the
        contents stay encrypted, just as they are on our servers.
      </p>
      <EmailButton href={downloadUrl}>Download export</EmailButton>
    </EmailLayout>
  );
}
