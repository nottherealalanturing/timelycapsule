/**
 * Minimal color/spacing constants for E1.2's placeholder screens only —
 * not a port of packages/ui-web's full CSS-variable token system (React
 * Native has no CSS custom properties, and final visual polish is
 * explicitly out of scope for this task). Values are the light instrument
 * register from packages/ui-web/src/tokens.css so this at least reads as
 * the same product, not a system-default gray screen. Dark mode, the
 * record register, and the full type scale are deliberately not ported —
 * whichever ticket does mobile visual polish should read tokens.css fresh
 * rather than trust this subset as complete.
 */
export const colors = {
  ground: '#e9eae6',
  raised: '#f3f4f0',
  overlay: '#ffffff',
  ink: '#16181a',
  muted: '#5e635c',
  brass: '#6e5a0e',
  steel: '#2c3a4a',
  danger: '#a33f28',
  onAccent: '#f3f4f0',
  rule: 'rgba(22, 24, 26, 0.14)',
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
