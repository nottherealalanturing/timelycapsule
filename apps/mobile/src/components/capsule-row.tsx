import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CapsuleRowItem } from '../lib/capsule-row-model';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

/**
 * Renders one `CapsuleRowItem` — nothing else. It has no knowledge of
 * `CapsuleListItem`/`ReceivedCapsule`, `id`/`capsuleId`, `CapsuleState`/
 * `section`, or any backend shape; that reconciliation already happened in
 * `../lib/capsule-row-model.ts`. It also never touches ciphertext, a master
 * key, or `capsule-crypto.ts` — the normalized model it receives is
 * structurally incapable of carrying any of those (see that file's header
 * comment), so there is nothing here to decrypt.
 *
 * `onPress` is a plain callback the caller wires to navigation; this
 * component has no opinion on what screen "pressing a row" leads to.
 */
export function CapsuleRow({ item, onPress }: { item: CapsuleRowItem; onPress?: (id: string) => void }) {
  return (
    <Pressable
      onPress={onPress ? () => onPress(item.id) : undefined}
      accessibilityRole="button"
      style={styles.container}
    >
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title ?? 'Untitled capsule'}
        </Text>
        {item.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
        {item.teaser ? (
          <Text style={styles.teaser} numberOfLines={2}>
            {item.teaser}
          </Text>
        ) : null}
      </View>
      <View style={styles.meta}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: item.statusColor }]} />
          <Text style={styles.statusLabel}>{item.statusLabel}</Text>
        </View>
        {item.dateLabel ? <Text style={styles.date}>{item.dateLabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    backgroundColor: colors.raised,
    gap: space[3],
  },
  main: {
    flex: 1,
    gap: space[1],
  },
  title: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.semibold,
    color: colors.ink,
  },
  subtitle: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
  teaser: {
    fontSize: fontSize.body,
    color: colors.muted,
  },
  meta: {
    alignItems: 'flex-end',
    gap: space[1],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.ink,
  },
  date: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
});
