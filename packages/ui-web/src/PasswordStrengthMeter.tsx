const LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];

/**
 * Lightweight heuristic (length + character-class variety) rather than
 * pulling in zxcvbn's ~800KB wordlist — good enough for inline feedback,
 * server-side validation is the actual gate (min 8 chars, see @tc/contracts).
 */
function scorePassword(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

export interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const score = scorePassword(password);
  if (!password) return null;

  const barColor =
    score <= 1 ? 'bg-[var(--color-danger)]' : score === 2 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < score ? barColor : 'bg-[var(--color-text-secondary)]/20'}`}
          />
        ))}
      </div>
      <p className="text-xs text-secondary">{LABELS[score]}</p>
    </div>
  );
}
