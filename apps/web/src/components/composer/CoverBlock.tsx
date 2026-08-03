'use client';

import { cn, Input } from '@tc/ui-web';
import type { CapsuleDraft } from '../../lib/use-capsule-draft';

/**
 * Gradient presets only for this pass — image covers would need an
 * unencrypted upload path of their own (covers are envelope metadata,
 * visible pre-unlock, so plaintext storage would be architecturally fine,
 * but no such endpoint exists yet and it isn't in T-11's ticket text).
 * Deferred; see plan/PROGRESS.md decisions log.
 */
const GRADIENT_PRESETS = [
  { value: 'linear-gradient(135deg, #F4A261, #E76F51)', theme: 'sunset' },
  { value: 'linear-gradient(135deg, #2A9D8F, #264653)', theme: 'deep-sea' },
  { value: 'linear-gradient(135deg, #E9C46A, #F4A261)', theme: 'golden-hour' },
  { value: 'linear-gradient(135deg, #8E7CC3, #4A4E69)', theme: 'twilight' },
  { value: 'linear-gradient(135deg, #6FCF97, #219653)', theme: 'meadow' },
  { value: 'linear-gradient(135deg, #56CCF2, #2F80ED)', theme: 'sky' },
] as const;

const TYPE_CHIPS = [
  { label: 'Self', type: 'self' as const },
  { label: 'Someone else', type: 'personal' as const },
];

export function CoverBlock({ draft }: { draft: CapsuleDraft }) {
  const capsule = draft.capsule!;
  const cover = capsule.cover ?? { kind: 'gradient' as const, value: GRADIENT_PRESETS[0].value, theme: GRADIENT_PRESETS[0].theme };

  return (
    <section aria-label="Cover" className="flex flex-col gap-4">
      <div
        className="flex h-40 items-end rounded-[var(--radius-card)] p-4"
        style={cover.kind === 'gradient' ? { background: cover.value } : undefined}
      >
        <div className="flex gap-2">
          {GRADIENT_PRESETS.map((preset) => (
            <button
              key={preset.theme}
              type="button"
              aria-label={`Use ${preset.theme} cover`}
              onClick={() => draft.patch({ cover: { kind: 'gradient', value: preset.value, theme: preset.theme } })}
              className={cn(
                'h-8 w-8 rounded-full border-2',
                cover.value === preset.value ? 'border-white' : 'border-white/40',
              )}
              style={{ background: preset.value }}
            />
          ))}
        </div>
      </div>

      <Input
        label="Title"
        placeholder="Name this capsule…"
        value={capsule.title ?? ''}
        onChange={(e) => draft.patch({ title: e.target.value })}
        className="text-[length:var(--text-title)]"
      />

      <div className="flex gap-2" role="radiogroup" aria-label="Capsule type">
        {TYPE_CHIPS.map((chip) => (
          <button
            key={chip.type}
            type="button"
            role="radio"
            aria-checked={capsule.type === chip.type}
            disabled
            title="Type is set at creation"
            className={cn(
              'cursor-not-allowed rounded-full border px-4 py-1.5 text-[length:var(--text-body-s)] opacity-60',
              capsule.type === chip.type
                ? 'border-[var(--color-interactive)] text-foreground'
                : 'border-[var(--color-rule-strong)] text-secondary',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </section>
  );
}
