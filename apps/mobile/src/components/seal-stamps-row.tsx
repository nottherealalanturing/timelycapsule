import type { SealStatus } from '@tc/contracts';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

const LABELS: Record<SealStatus['type'], string> = {
  place: 'Place',
  passphrase: 'Passphrase',
  identity: 'Identity',
};

/**
 * Mobile port of `apps/web/src/components/reveal/SealStampsRow.tsx` —
 * same text-only state reading (`07-EXPERIENCE-BIBLE.md` §V.4: "State is
 * always stated in text, not only in colour, position, or motion"), no
 * wax-stamp/emoji imagery, matching web's own rebuild away from that
 * exact anti-pattern.
 */
export function SealStampsRow({ seals, passphraseUnlocked }: { seals: SealStatus[]; passphraseUnlocked: boolean }) {
  if (seals.length === 0) return null;

  return (
    <View style={styles.row} accessibilityLabel="Conditions">
      {seals.map((seal) => {
        const satisfied = seal.type === 'passphrase' ? passphraseUnlocked : seal.satisfied;
        return (
          <View key={seal.type} style={styles.item} accessible accessibilityRole="text" accessibilityLabel={`${LABELS[seal.type]}, ${satisfied ? 'met' : 'required'}`}>
            <Text style={styles.label}>{LABELS[seal.type]}</Text>
            <Text style={[styles.value, satisfied ? styles.satisfied : styles.unsatisfied]}>{satisfied ? 'Met' : 'Required'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[6] },
  item: { gap: 2 },
  label: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.muted, textTransform: 'uppercase' },
  value: { fontSize: fontSize.body },
  satisfied: { color: colors.muted },
  unsatisfied: { color: colors.ink },
});
