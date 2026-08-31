import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../../../../src/components/error-state';
import { LoadingState } from '../../../../src/components/loading-state';
import { MediaSourceSheet } from '../../../../src/components/media-source-sheet';
import { envelopeToText } from '../../../../src/lib/capsule-crypto';
import { formatMediaSize, pickForSource, type MediaSourceKind, type PickedMedia } from '../../../../src/lib/media-source';
import { colors, fontSize, fontWeight, radius, space } from '../../../../src/lib/tokens';
import { useCapsuleCompose, type AutosaveStatus } from '../../../../src/lib/use-capsule-compose';

/**
 * Movement II — Compose (E1.4.3; media source selection added E1.4.5).
 * Reproduces the product semantics of
 * `apps/web/src/components/composer/v2/ComposeMovement.tsx` as a
 * mobile-native screen: a native multiline `TextInput` in place of TipTap
 * (no rich-text editor is installed, and the readiness audit's own §6.4
 * names the plain-text-in-a-minimal-doc-shape choice as the lowest-risk,
 * already-decrypt-path-compatible option — not a corner cut), and this
 * screen's own `useCapsuleCompose` in place of prop-drilling from Address
 * (mobile's per-screen architecture, established by E1.4.1).
 *
 * Two structural decisions carried over from web's own header comment,
 * unmodified:
 *
 *  - **"The address stays visible."** Who and when were settled in Address;
 *    restating them here (`Hallmark`) is a *reading*, never a control —
 *    changing either means going back a movement, exactly like web.
 *  - **"There is no sticky advance."** The way onward — Seal — does not
 *    exist yet (a later E1.4 ticket), so unlike web's own footer this screen
 *    has no forward action at all, the same honest dead-end Address itself
 *    was before this screen existed. Back always returns to Address.
 *
 * **Media (E1.4.5)** stops at the selection/normalization boundary — see
 * `media-source.ts`'s own header comment. A picked file is held only in
 * this component's own React state (`pendingMedia`), never the E1.4.4
 * encrypted local draft (Decision 16: media needs connectivity, full stop —
 * there is no offline media concept for a local cache to bridge) and never
 * sent anywhere — actual encryption/upload is E1.4.7's job. This is a
 * disclosed consequence of splitting one continuous web action
 * (`onFiles`/`onEnclose` immediately kick off encryption+upload) across two
 * mobile tickets: navigating away or killing the app currently loses a
 * pending pick, unlike web's own instant-fire behavior. E1.4.7 is expected
 * to close this gap by actually enclosing (encrypting+uploading) on pick.
 *
 * Deliberately not built here (out of E1.4.5's scope, disclosed): the voice
 * recorder (`E1.4.6` — see `media-source.ts`'s header comment for why
 * "Voice" has no sheet row yet), actual encryption/upload (`E1.4.7`),
 * place-as-memory (no location UI anywhere in this ticket, and it is not a
 * media kind at all — see the design doc's "Place as memory, separated from
 * the Place Seal"), the margin writing-prompt (`MarginPrompt.tsx`), and
 * Review/Seal (`E1.4.8`).
 */
/** A picked-but-not-yet-enclosed file, held only in this screen's own state — see the module header comment for why. */
interface PendingMedia extends PickedMedia {
  id: number;
}

export default function ComposeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, retry, autosaveStatus, saveMessage, setText, flush } = useCapsuleCompose(id);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const nextMediaId = useRef(0);

  const handleSelectSource = useCallback(async (source: MediaSourceKind) => {
    setSheetVisible(false);
    setMediaMessage(null);
    const result = await pickForSource(source);
    if (result.status === 'picked') {
      setPendingMedia((prev) => [
        ...prev,
        ...result.media.map((media) => ({ ...media, id: nextMediaId.current++ })),
      ]);
    } else if (result.status === 'permission_denied') {
      // Only 'camera' and 'library' ever actually produce this status —
      // pickFile() needs no runtime permission (see media-source.ts) — but
      // the message stays exhaustive over MediaSourceKind rather than
      // assuming that never changes.
      const deniedLabel = source === 'camera' ? 'Camera' : source === 'library' ? 'Photo library' : 'File';
      setMediaMessage(`${deniedLabel} access was not granted. You can allow it in Settings.`);
    }
    // 'cancelled': the user backed out of the native picker — nothing to do.
  }, []);

  const removePendingMedia = useCallback((mediaId: number) => {
    setPendingMedia((prev) => prev.filter((m) => m.id !== mediaId));
  }, []);

  // The screen's own typing buffer, decoupled from `state.envelope` (which
  // round-trips through JSON on every save) — seeded once from whatever was
  // already written, then driven entirely by the user's own keystrokes from
  // then on, never overwritten by envelope round-tripping mid-typing.
  const [text, setLocalText] = useState('');
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (state.status === 'ready' && !hydratedRef.current) {
      hydratedRef.current = true;
      setLocalText(envelopeToText(state.envelope));
    }
  }, [state]);

  const onChangeText = useCallback(
    (next: string) => {
      setLocalText(next);
      setText(next);
    },
    [setText],
  );

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const goBack = useCallback(async () => {
    await flushRef.current();
    router.back();
  }, [router]);

  // Covers hardware back / swipe-back gestures that skip the button above —
  // web's own equivalent (`flush()` before navigation/seal) has no such gap
  // since it has no separate back gesture to miss.
  useEffect(() => {
    return () => {
      void flushRef.current();
    };
  }, []);

  const capsule = state.status === 'ready' ? state.capsule : null;
  const recipients = state.status === 'ready' ? state.recipients : [];
  const isSelf = capsule?.type === 'self';
  const addressee = isSelf ? null : recipients[0]?.displayName || recipients[0]?.email || recipients[0]?.phone || null;
  const opensAt = capsule?.unlockAt ? new Date(capsule.unlockAt) : null;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => void goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.back, { paddingTop: insets.top + space[4] }]}
      >
        <Text style={styles.backLabel}>‹ Back</Text>
      </Pressable>

      {state.status === 'loading' && <LoadingState message="Loading…" />}
      {state.status === 'error' && <ErrorState message="We couldn't load this capsule." onRetry={retry} />}

      {state.status === 'ready' ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Hallmark addressee={addressee} opensAt={opensAt} />

            <TextInput
              style={styles.editor}
              multiline
              textAlignVertical="top"
              value={text}
              onChangeText={onChangeText}
              placeholder="Write your letter…"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Letter"
            />

            <PendingMediaSection
              pending={pendingMedia}
              message={mediaMessage}
              onEnclose={() => setSheetVisible(true)}
              onRemove={removePendingMedia}
            />

            <AutosaveIndicator status={autosaveStatus} message={saveMessage} />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      <MediaSourceSheet visible={sheetVisible} onSelect={(source) => void handleSelectSource(source)} onDismiss={() => setSheetVisible(false)} />
    </View>
  );
}

/**
 * "Enclosed" (E1.4.5) — the mobile-native shape of web's own `Enclosures`
 * section (see `compose.tsx`'s own header comment for the full boundary
 * this stops at). Ordered Hallmark → letter → enclosures, matching
 * `ComposeMovement.tsx`'s own layout exactly.
 */
function PendingMediaSection({
  pending,
  message,
  onEnclose,
  onRemove,
}: {
  pending: PendingMedia[];
  message: string | null;
  onEnclose: () => void;
  onRemove: (id: number) => void;
}) {
  return (
    <View style={styles.enclosures}>
      {pending.length > 0 ? (
        <View style={styles.enclosureList}>
          {pending.map((media) => (
            <View key={media.id} style={styles.enclosureRow}>
              <Text style={styles.enclosureName} numberOfLines={1}>
                {media.name}
              </Text>
              <Text style={styles.enclosureSize}>{formatMediaSize(media.sizeBytes)}</Text>
              <Pressable onPress={() => onRemove(media.id)} accessibilityRole="button" accessibilityLabel={`Remove ${media.name}`}>
                <Text style={styles.enclosureRemove}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {message ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}

      <Pressable onPress={onEnclose} accessibilityRole="button" accessibilityLabel="Enclose something" style={styles.encloseButton}>
        <Text style={styles.encloseButtonLabel}>+ Enclose something</Text>
      </Pressable>
    </View>
  );
}

/**
 * "Who this is for and when it opens, held above the letter while it is
 * written" — reproduces `AddressHallmark.tsx`'s exact copy and join. A
 * reading, never a control: there is deliberately no tap target here.
 */
function Hallmark({ addressee, opensAt }: { addressee: string | null; opensAt: Date | null }) {
  const parts = [
    addressee ? `For ${addressee}` : 'For yourself',
    opensAt ? `Opens ${opensAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'No date yet',
  ];
  return (
    <Text style={styles.hallmark} accessibilityRole="text">
      {parts.join(' · ')}
    </Text>
  );
}

/**
 * State stated in text, never color alone (`design/07-EXPERIENCE-BIBLE.md`
 * §VI.3/§XVI, already the convention `LoadingState` follows) — `idle` (a
 * fresh draft, nothing typed yet) renders nothing, matching web's own
 * absence of an autosave indicator before any edit has ever happened.
 */
function AutosaveIndicator({ status, message }: { status: AutosaveStatus; message: string | null }) {
  if (status === 'error' || status === 'rejected') {
    return (
      <Text style={styles.errorText} accessibilityRole="alert">
        {message}
      </Text>
    );
  }
  if (status === 'idle') return null;
  const label = status === 'pending' ? 'Unsaved changes' : status === 'saving' ? 'Saving…' : 'Saved';
  return (
    <Text style={styles.statusText} accessibilityLiveRegion="polite">
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
  flex: { flex: 1 },
  back: { padding: space[4], alignSelf: 'flex-start' },
  backLabel: { fontSize: fontSize.body, color: colors.muted },
  content: { padding: space[4], paddingTop: 0, gap: space[4], paddingBottom: space[12], flexGrow: 1 },
  hallmark: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editor: {
    flex: 1,
    minHeight: 320,
    fontSize: fontSize.bodyLarge,
    lineHeight: fontSize.bodyLarge * 1.5,
    color: colors.ink,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.input,
    padding: space[4],
  },
  statusText: { fontSize: fontSize.caption, color: colors.muted },
  errorText: { fontSize: fontSize.body, color: colors.danger },
  enclosures: { gap: space[2] },
  enclosureList: { gap: space[2] },
  enclosureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.input,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
  },
  enclosureName: { flex: 1, fontSize: fontSize.body, color: colors.ink },
  enclosureSize: { fontSize: fontSize.caption, color: colors.muted, fontVariant: ['tabular-nums'] },
  enclosureRemove: { fontSize: fontSize.caption, color: colors.muted },
  encloseButton: { alignSelf: 'flex-start', paddingVertical: space[2] },
  encloseButtonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.brass },
});
