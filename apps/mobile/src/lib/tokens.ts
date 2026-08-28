/**
 * Minimal color/spacing/type constants, deliberately a subset of
 * packages/ui-web's full CSS-variable token system (React Native has no
 * CSS custom properties, and full visual polish/dark mode/the record
 * register are explicitly out of scope for E1.2/E1.3). Every value below
 * is copied from tokens.css's light instrument register (`--i-*`) —
 * confirmed against that file directly, not approximated — so this reads
 * as the same product, not a system-default gray screen. This file grows
 * only as real screens need real values; it is not meant to become a
 * second design system, and whichever ticket eventually does full mobile
 * visual polish (dark mode, the record/paper register for letter content,
 * the complete type scale) should read tokens.css fresh rather than trust
 * this subset as complete.
 */
export const colors = {
  ground: '#e9eae6',
  raised: '#f3f4f0',
  overlay: '#ffffff',
  ink: '#16181a',
  muted: '#5e635c',
  brass: '#6e5a0e',
  steel: '#2c3a4a',
  success: '#2f6b4c',
  warning: '#7a5a18',
  danger: '#a33f28',
  onAccent: '#f3f4f0',
  rule: 'rgba(22, 24, 26, 0.14)',
};

/**
 * `CapsuleState` → color, matching tokens.css's `--color-state-*` mapping
 * exactly (packages/ui-web/src/tokens.css, light register) — same six
 * states as `@tc/contracts`' `CapsuleStateSchema`
 * (`draft|sealing|sealed|unlocked|expired|withdrawn`), no state invented
 * or omitted for visual convenience. Brass appears on `sealed` and nowhere
 * else — tokens.css's own rule ("the moment it decorates anything but
 * waiting, the reserved meaning is gone") carries over unchanged to
 * mobile. `expired`'s value is tokens.css's
 * `color-mix(in srgb, var(--i-ink) 38%, transparent)` expressed as a plain
 * RGBA literal (`ink` is `#16181a` = `rgb(22, 24, 26)`) since RN has no
 * `color-mix()`.
 */
export const capsuleStateColors: Record<'draft' | 'sealing' | 'sealed' | 'unlocked' | 'expired' | 'withdrawn', string> = {
  draft: colors.muted, // nothing is waiting yet
  sealing: colors.steel, // transient
  sealed: colors.brass, // WAITING — the one use
  unlocked: colors.success, // arrived
  expired: 'rgba(22, 24, 26, 0.38)',
  withdrawn: colors.muted, // deliberate, not an error
};

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
};

export const radius = {
  input: 3,
  card: 4,
};

/**
 * A minimal subset of tokens.css's type scale (`--text-*`) — only the
 * sizes E1.3's list-row and status-primitive components actually need
 * (a title, a secondary/body line, and a small caption-weight label for
 * state/date text), not the full record-vs-instrument type system.
 */
export const fontSize = {
  caption: 13,
  body: 14,
  bodyLarge: 16,
  title: 20,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
};
