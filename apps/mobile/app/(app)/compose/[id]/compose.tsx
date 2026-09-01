import type { MediaItem } from '@tc/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../../../../src/components/error-state';
import { LoadingState } from '../../../../src/components/loading-state';
import { MediaSourceSheet } from '../../../../src/components/media-source-sheet';
import { VoiceRecorder } from '../../../../src/components/voice-recorder';
import { envelopeToText } from '../../../../src/lib/capsule-crypto';
import { formatMediaSize, pickForSource, type MediaSourceKind, type PickedMedia } from '../../../../src/lib/media-source';
import { colors, fontSize, fontWeight, radius, space } from '../../../../src/lib/tokens';
import { useCapsuleCompose, type AutosaveStatus } from '../../../../src/lib/use-capsule-compose';
import { useMediaEnclosures, type PendingEnclosure } from '../../../../src/lib/use-media-enclosures';

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
 *  - **The advance to Review (E1.4.8)** reproduces web's own footer gate
 *    (`Composer.tsx`'s `<Advance disabled={Boolean(blocker)}>`) exactly,
 *    minus its schedule half: `firstCompletenessBlocker`'s "choose when it
 *    opens" branch can never fire here, since Compose is only reachable once
 *    Address has already set `unlockAt` (its own advance gate). Only the
 *    "write something to seal" check remains. Flushes any pending autosave
 *    before navigating, same as the back button.
 *
 * **Media (E1.4.5 selection, E1.4.7 encrypt/upload)** now fires the full
 * enclose pipeline the instant a file is picked or a voice take is
 * accepted — matching web's own `onFiles`/`onEnclose` instant-fire behavior
 * exactly, closing the gap E1.4.5/E1.4.6 disclosed (a picked file used to
 * sit inert in local state until this ticket). All of that lifecycle —
 * encrypting → sending → finishing → enclosed/failed, plus retry/remove —
 * lives in `useMediaEnclosures`, not this component; this screen only picks
 * a source and renders whatever that hook reports. Media still never
 * touches the E1.4.4 encrypted local draft (Decision 16: media needs
 * connectivity, full stop) — see that hook's own header comment for what
 * happens if the writer leaves Compose mid-upload.
 *
 * **Voice (E1.4.6)** is a fourth enclose source alongside the three
 * picker-based ones, produced by `VoiceRecorder` instead of `pickForSource`
 * — see `media-source.ts`'s header comment for why that source is handled
 * differently, and `voice-recorder.tsx`'s own header comment for the full
 * Idle→Recording→Preparing→Ready lifecycle. An accepted take is enclosed
 * exactly like any other picked file, at the same `PickedMedia` boundary.
 *
 * Deliberately not built here (out of scope, disclosed): place-as-memory (no
 * location UI anywhere in this ticket, and it is not a media kind at all —
 * see the design doc's "Place as memory, separated from the Place Seal"),
 * and the margin writing-prompt (`MarginPrompt.tsx`).
 */
export default function ComposeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, retry, autosaveStatus, saveMessage, setText, flush, encryptForCapsule } = useCapsuleCompose(id);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [voiceRecorderOpen, setVoiceRecorderOpen] = useState(false);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const {
    items: attachedMedia,
    pending: pendingMedia,
    enclose,
    retry: retryPending,
    removePending,
    removeItem,
  } = useMediaEnclosures(id, state.status === 'ready' ? encryptForCapsule : null);

  const handleSelectSource = useCallback(
    async (source: MediaSourceKind) => {
      setSheetVisible(false);
      setMediaMessage(null);
      // Voice has no one-shot picker call to await — it opens the recorder,
      // which reports back via its own onAccept once the writer explicitly
      // decides to keep a take (see voice-recorder.tsx's header comment).
      if (source === 'voice') {
        setVoiceRecorderOpen(true);
        return;
      }
      const result = await pickForSource(source);
      if (result.status === 'picked') {
        for (const media of result.media) enclose(media);
      } else if (result.status === 'permission_denied') {
        // Only 'camera' and 'library' ever actually produce this status —
        // pickFile() needs no runtime permission (see media-source.ts) — but
        // the message stays exhaustive over MediaSourceKind rather than
        // assuming that never changes.
        const deniedLabel = source === 'camera' ? 'Camera' : source === 'library' ? 'Photo library' : 'File';
        setMediaMessage(`${deniedLabel} access was not granted. You can allow it in Settings.`);
      }
      // 'cancelled': the user backed out of the native picker — nothing to do.
    },
    [enclose],
  );

  const handleVoiceAccept = useCallback(
    (media: PickedMedia) => {
      enclose(media);
    },
    [enclose],
  );

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

  // The one thing standing between this draft and Review — matches
  // `apps/web/src/components/composer/completeness.ts`'s own
  // `firstCompletenessBlocker` exactly, minus its schedule check: Compose is
  // only ever reached once Address has already set `unlockAt` (its own
  // advance gate), so a moment always exists by the time this screen can
  // render at all.
  const blocker = text.trim().length === 0 ? 'Write something to seal' : null;

  const goToReview = useCallback(async () => {
    await flushRef.current();
    router.push(`/(app)/compose/${id}/review`);
  }, [id, router]);

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
              accessibilityHint="Saved automatically as you write"
            />

            <PendingMediaSection
              items={attachedMedia}
              pending={pendingMedia}
              message={mediaMessage}
              onEnclose={() => setSheetVisible(true)}
              onRemoveItem={removeItem}
              onRemovePending={removePending}
              onRetryPending={retryPending}
            />

            <AutosaveIndicator status={autosaveStatus} message={saveMessage} />

            <Pressable
              onPress={() => void goToReview()}
              disabled={Boolean(blocker)}
              accessibilityRole="button"
              accessibilityLabel={blocker ?? 'Review'}
              accessibilityState={{ disabled: Boolean(blocker) }}
              style={[styles.advanceButton, Boolean(blocker) && styles.advanceButtonDisabled]}
            >
              <Text style={styles.advanceButtonLabel}>{blocker ?? 'Review'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      <MediaSourceSheet visible={sheetVisible} onSelect={(source) => void handleSelectSource(source)} onDismiss={() => setSheetVisible(false)} />

      {voiceRecorderOpen ? (
        <VoiceRecorder onAccept={handleVoiceAccept} onCancel={() => setVoiceRecorderOpen(false)} />
      ) : null}
    </View>
  );
}

/**
 * "Enclosed" (E1.4.5 selection, E1.4.7 encrypt/upload) — the mobile-native
 * shape of web's own `Enclosures` section (see `compose.tsx`'s own header
 * comment for the full boundary this stops at). Ordered Hallmark → letter →
 * enclosures, matching `ComposeMovement.tsx`'s own layout exactly.
 *
 * `items` (truly attached, `status: 'ready'`) and `pending` (in-flight this
 * session, or recovered from one that never finished) render as the same
 * row shape — a reading of "what's enclosed," not two visually distinct
 * lists — differing only in whether a stage line and a Retry control
 * appear, exactly mirroring `useMediaEnclosures`'s own split.
 */
function PendingMediaSection({
  items,
  pending,
  message,
  onEnclose,
  onRemoveItem,
  onRemovePending,
  onRetryPending,
}: {
  items: MediaItem[];
  pending: PendingEnclosure[];
  message: string | null;
  onEnclose: () => void;
  onRemoveItem: (item: MediaItem) => void;
  onRemovePending: (id: number) => void;
  onRetryPending: (id: number) => void;
}) {
  return (
    <View style={styles.enclosures}>
      {items.length > 0 || pending.length > 0 ? (
        <View style={styles.enclosureList}>
          {items.map((item) => (
            <View key={item.id} style={styles.enclosureRow}>
              <View
                style={styles.enclosureItemInfo}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${item.originalName ?? 'A file'}, ${formatMediaSize(item.sizeBytes)}`}
              >
                <Text style={styles.enclosureName} numberOfLines={1}>
                  {item.originalName ?? 'A file'}
                </Text>
                <Text style={styles.enclosureSize}>{formatMediaSize(item.sizeBytes)}</Text>
              </View>
              <Pressable
                onPress={() => onRemoveItem(item)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.originalName ?? 'file'}`}
              >
                <Text style={styles.enclosureRemove}>Remove</Text>
              </Pressable>
            </View>
          ))}

          {pending.map((p) => (
            <View key={p.id} style={styles.enclosureRow}>
              <View
                style={styles.enclosureInfo}
                accessible
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                accessibilityLabel={`${p.name}, ${stageLabel(p)}`}
              >
                <Text style={styles.enclosureName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.enclosureStage}>{stageLabel(p)}</Text>
              </View>
              {p.stage === 'failed' && p.media && p.retryable !== false ? (
                <Pressable onPress={() => onRetryPending(p.id)} accessibilityRole="button" accessibilityLabel={`Retry ${p.name}`}>
                  <Text style={styles.enclosureRemove}>Retry</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => onRemovePending(p.id)} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`}>
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

/** State stated in text, never color alone — matches `AutosaveIndicator`'s own convention exactly. */
function stageLabel(p: PendingEnclosure): string {
  switch (p.stage) {
    case 'encrypting':
      return 'Encrypting…';
    case 'sending':
      return p.partsTotal > 1 ? `Uploading ${p.partsDone} of ${p.partsTotal}…` : 'Uploading…';
    case 'finishing':
      return 'Finishing…';
    case 'enclosed':
      return 'Enclosed';
    case 'failed':
      return p.error ?? 'Stopped before it finished';
  }
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
  enclosureInfo: { flex: 1, gap: 2 },
  // E1.4.11 — a row-direction wrapper (matches `enclosureRow`'s own layout
  // exactly, unlike `enclosureInfo`'s column stack above) purely so the
  // ready-item's name+size can be grouped into one accessible block without
  // changing their existing side-by-side visual arrangement.
  enclosureItemInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] },
  enclosureStage: { fontSize: fontSize.caption, color: colors.muted },
  enclosureRemove: { fontSize: fontSize.caption, color: colors.muted },
  encloseButton: { alignSelf: 'flex-start', paddingVertical: space[2] },
  encloseButtonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.brass },
  advanceButton: {
    marginTop: space[2],
    backgroundColor: colors.brass,
    borderRadius: radius.input,
    paddingVertical: space[3],
    alignItems: 'center',
  },
  advanceButtonDisabled: { opacity: 0.5 },
  advanceButtonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.onAccent },
});
