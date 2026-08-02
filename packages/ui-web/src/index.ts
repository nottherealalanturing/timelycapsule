// Meridian V2 component library.
// Registers, tokens and motion: design/05, design/06, design/07.
// tokens.css is importable directly: `import '@tc/ui-web/tokens.css'`.
export const MERIDIAN_VERSION = '2.0.0';

export { cn } from './cn';
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Input, type InputProps } from './Input';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Select, type SelectProps } from './Select';
export { Dialog, type DialogProps } from './Dialog';
export { ToastProvider, useToast } from './Toast';
export { Skeleton } from './Skeleton';
export { StateChip, type StateChipProps, type CapsuleState } from './StateChip';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Record, type RecordProps } from './Record';
export { Hallmark, type HallmarkProps } from './Hallmark';
export { Mark, Lockup, type MarkProps, type LockupProps } from './Mark';
export {
  DualClock,
  formatDuration,
  clockEmphasis,
  type DualClockProps,
  type ClockEmphasis,
} from './DualClock';
export { PasswordStrengthMeter } from './PasswordStrengthMeter';
export { OtpInput, type OtpInputProps } from './OtpInput';
export { ThemeToggle } from './ThemeToggle';
