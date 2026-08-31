import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MediaSourceKind } from '../lib/media-source';
import { colors, fontSize, fontWeight, radius, space } from '../lib/tokens';

/**
 * The native-mobile "Enclose something" menu (E1.4.5; "Voice" added E1.4.6)
 * — see `media-source.ts`'s own header comment for why the first three rows
 * are a native adaptation of one web kind. A bottom sheet (`Modal` +
 * `transparent` + `slide`) rather than web's dropdown menu — the native
 * mobile-menu idiom for the same "pick one of a short list of actions"
 * interaction, per this ticket's own "adapt natively" instruction.
 *
 * Deliberately presentational only: this component never calls a picker,
 * requests a permission, or opens the recorder itself — `onSelect` hands the
 * chosen source back to the caller (`compose.tsx`), which owns both the
 * `media-source.ts` calls and mounting `VoiceRecorder`. That keeps this
 * component trivially testable (render, tap, assert) without mocking native
 * modules just to prove the menu itself works.
 */
export interface MediaSourceOption {
  source: MediaSourceKind;
  label: string;
  detail: string;
}

const OPTIONS: MediaSourceOption[] = [
  { source: 'camera', label: 'Camera', detail: 'Take a new photo or video' },
  { source: 'library', label: 'Photo & Video Library', detail: 'Choose an existing one' },
  { source: 'file', label: 'File', detail: 'Choose a document' },
  { source: 'voice', label: 'Voice', detail: 'Record a voice note' },
];

export interface MediaSourceSheetProps {
  visible: boolean;
  onSelect: (source: MediaSourceKind) => void;
  onDismiss: () => void;
}

export function MediaSourceSheet({ visible, onSelect, onDismiss }: MediaSourceSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Dismiss" accessibilityRole="button" />
      <View style={styles.sheet} accessibilityRole="menu" accessibilityLabel="Enclose something menu">
        <Text style={styles.title}>Enclose something</Text>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.source}
            style={styles.row}
            onPress={() => onSelect(option.source)}
            accessibilityRole="menuitem"
            accessibilityLabel={option.label}
          >
            <Text style={styles.rowLabel}>{option.label}</Text>
            <Text style={styles.rowDetail}>{option.detail}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.cancelRow} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22, 24, 26, 0.4)' },
  sheet: {
    backgroundColor: colors.overlay,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: space[4],
    gap: space[2],
  },
  title: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: space[2],
  },
  row: {
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.rule,
    gap: space[1],
  },
  rowLabel: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.semibold, color: colors.ink },
  rowDetail: { fontSize: fontSize.body, color: colors.muted },
  cancelRow: { paddingVertical: space[3], alignItems: 'center', marginTop: space[1] },
  cancelLabel: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.medium, color: colors.muted },
});
