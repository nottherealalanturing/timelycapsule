'use client';

import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Auto-advancing OTP boxes — 02-UX-DESIGN.md §5.2 (verify-email, 2FA step). */
export function OtpInput({ length = 6, value, onChange, disabled }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(''));
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigit(index, digit);
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted) {
      e.preventDefault();
      onChange(pasted.padEnd(length, ''));
      inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Verification code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          className="h-12 w-10 rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/30 bg-[var(--color-bg-raised)] text-center text-lg text-foreground outline-none focus:ring-2 focus:ring-[var(--color-accent-violet)] focus:border-transparent"
        />
      ))}
    </div>
  );
}
