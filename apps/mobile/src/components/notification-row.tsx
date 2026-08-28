import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NotificationRowItem } from '../lib/notification-model';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

/**
 * Renders one `NotificationRowItem` — nothing else. Presentation-only: no
 * API call, no crypto import, no SecureStore/AsyncStorage access, no
 * knowledge of how to decrypt anything. `onPress` only ever receives
 * `item.capsuleId` when it is non-null (the normalized model has already
 * done the unsafe-`data`-shape checking); a notification with no usable
 * capsule id renders as a plain, non-interactive row rather than a button
 * that would navigate nowhere or throw.
 *
 * Unread is communicated with the title's own font weight — a real API
 * field (`readAt`), not an invented state — deliberately not a colored dot
 * (CapsuleRow's dot distinguishes six real lifecycle states; here there
 * are exactly two, and a weight change is the plainer, more honest way to
 * say "read" vs "unread" in text terms rather than borrowing a visual
 * language built for something else).
 */
export function NotificationRow({ item, onPress }: { item: NotificationRowItem; onPress?: (capsuleId: string) => void }) {
  const navigable = item.capsuleId !== null;
  const capsuleId = item.capsuleId;

  return (
    <Pressable
      onPress={navigable && onPress ? () => onPress(capsuleId!) : undefined}
      accessibilityRole={navigable ? 'button' : 'text'}
      style={styles.container}
    >
      <View style={styles.main}>
        <Text style={[styles.title, item.unread ? styles.titleUnread : null]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.body ? (
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
      </View>
      <Text style={styles.date}>{item.dateLabel}</Text>
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
    fontSize: fontSize.body,
    fontWeight: fontWeight.regular,
    color: colors.ink,
  },
  titleUnread: {
    fontWeight: fontWeight.semibold,
  },
  body: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
  date: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
});
