'use client';

import { Button, Hallmark, Record } from '@tc/ui-web';
import { useState } from 'react';

export interface RecoveryKitProps {
  code: string;
  className?: string;
}

/**
 * The recovery code, presented as a **record**.
 *
 * `09 §VII` lists the recovery kit as one of five sacred things, and `07 §XI`
 * calls it "the one genuinely unfamiliar concept, and the one place where
 * confusion is unrecoverable." It earns the register.
 *
 * Paper is the correct register on the merits, not just for weight: `05`
 * defines records as letters, exports, print and keepsakes, and this is
 * something the user is explicitly told to print and file. Rendering it as a
 * bounded paper object says *take this out of the software and keep it*, which
 * is exactly the instruction.
 *
 * The explanation stays outside the record, in the instrument register — the
 * advice is chrome, the code is the document.
 *
 * **Pre-existing bug fixed here:** all three call sites painted the code box
 * with `--color-surface-raised`, a token that has never existed. The box has
 * been rendering with no background since T-06.
 */
export function RecoveryKit({ code, className }: RecoveryKitProps) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      // Reverts on its own; a permanent "Copied" would misreport a later state.
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Record className={className}>
      <Hallmark>Recovery code</Hallmark>
      <p
        className="mt-3 select-all break-all font-[family-name:var(--font-mono)] text-[length:var(--text-title-s)] leading-[1.5] tracking-[0.08em]"
        // Announced so a screen-reader user is told the code exists rather
        // than having to hunt for it after the heading changes.
        aria-label={`Recovery code: ${code.split('').join(' ')}`}
      >
        {code}
      </p>
      <div className="mt-5 border-t border-[var(--color-rule)] pt-4">
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy to clipboard'}
        </Button>
      </div>
    </Record>
  );
}
