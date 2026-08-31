import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { normalizeVoiceRecording, type PickedMedia } from '../lib/media-source';
import { colors, fontSize, fontWeight, radius, space } from '../lib/tokens';

/**
 * The native-mobile port of web's `VoiceRecorder.tsx` (E1.4.6) — its own
 * header comment is the product's stated design principle, reproduced here
 * unmodified: **"Recording, as something you decide to keep."** Idle →
 * Recording → Preparing → Ready → (accepted, and control returns to the
 * caller). Nothing is enclosed the moment recording stops; the writer hears
 * the take back and explicitly decides. This is a *behavioral* port, not a
 * code port (web's `MediaRecorder`/`getUserMedia` have no RN equivalent) —
 * every stage, button, and the exact error copy below are read directly
 * from the real component, not reinvented.
 *
 * **Mounted only while open** (`compose.tsx` renders this element
 * conditionally, the same as web's `{recorderOpen ? <VoiceRecorder/> : null}`)
 * rather than an always-mounted `Modal visible={bool}` like
 * `media-source-sheet.tsx` — `useAudioRecorder`/`useAudioPlayer` create real
 * native objects the moment their hooks run, and this ticket's own
 * just-in-time discipline (Decision 18) means those objects should not
 * exist at all until the writer has actually chosen Voice, and should be
 * released the moment this component goes away for any reason (accept,
 * discard, cancel, or the screen navigating away out from under it).
 *
 * **E1.4.7 boundary:** stops at `onAccept(media: PickedMedia)` — the same
 * shape `media-source.ts`'s pickers already produce, via
 * `normalizeVoiceRecording`. No encryption, no upload, no media ticket.
 */
type RecorderStage = 'idle' | 'recording' | 'preparing' | 'ready';

function elapsedReading(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export interface VoiceRecorderProps {
  onAccept: (media: PickedMedia) => void;
  onCancel: () => void;
}

/**
 * `useAudioRecorderState`'s polling interval is bound to `recorder.id` for
 * the life of whatever component calls it — passing a new `interval` value
 * later does not reset it, so it cannot be paused once started. Mounted only
 * while `stage === 'recording'`, this pays for that polling exactly as long
 * as it's needed: on unmount (stage leaving `'recording'`) its `setInterval`
 * is torn down for good. This isn't just tidiness — on a real device,
 * starting playback releases the underlying native recorder object, and a
 * still-running poll then throws `ERR_USING_RELEASED_SHARED_OBJECT`
 * (confirmed via real-device testing; expo-audio's own hook has no option to
 * quiesce it otherwise).
 */
function RecordingElapsed({ recorder, onTick }: { recorder: AudioRecorder; onTick: (ms: number) => void }) {
  const recorderState = useAudioRecorderState(recorder, 200); // 200ms — matches web's own elapsed-reading cadence exactly
  useEffect(() => {
    onTick(recorderState.durationMillis);
  }, [recorderState.durationMillis, onTick]);
  return null;
}

export function VoiceRecorder({ onAccept, onCancel }: VoiceRecorderProps) {
  const [stage, setStage] = useState<RecorderStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<{ uri: string; durationMs: number } | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // The live elapsed reading while actually recording, and the last value
  // observed before `.stop()` — read straight from `RecordingElapsed`'s
  // ticks rather than trusted to still be current once stopped. Written to
  // both a ref (for `stop()` to read synchronously) and state (to re-render
  // the on-screen timer); see `RecordingElapsed`'s own header comment for
  // why the polling that feeds this is scoped to the 'recording' stage only.
  const [liveDurationMs, setLiveDurationMs] = useState(0);
  const lastDurationRef = useRef(0);
  const handleTick = useCallback((ms: number) => {
    lastDurationRef.current = ms;
    setLiveDurationMs(ms);
  }, []);

  const player = useAudioPlayer(take?.uri ?? null);
  const playerStatus = useAudioPlayerStatus(player);

  // Release native resources the instant this component goes away for any
  // reason — an accepted/discarded/cancelled take, or the screen
  // navigating away out from under an in-progress recording. Matches web's
  // own unmount cleanup (`stream.getTracks().forEach(t => t.stop())`,
  // `URL.revokeObjectURL`) — the RN equivalents are `recorder.stop()` and
  // `player.remove()`.
  //
  // Both are wrapped defensively: `recorder.isRecording` and `.stop()` are
  // live native property/method calls on a shared object, and real-device
  // testing confirmed starting playback can release that object out from
  // under us (Android reclaiming the input stream for the output session) —
  // a plain, uncaught property read at that point throws
  // `ERR_USING_RELEASED_SHARED_OBJECT`. An already-released object has
  // nothing left to clean up, so the error is swallowed, not surfaced.
  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) void recorder.stop();
      } catch {
        // Already released — nothing to stop.
      }
      try {
        player.remove();
      } catch {
        // Already released — nothing to remove.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on unmount only, by design; recorder/player identity is stable for this component's lifetime.
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        // Exact copy from web's own catch branch — deliberately
        // non-specific (a refused permission and "no microphone at all"
        // are not usefully distinguishable to the person recording).
        setError('No microphone available, or permission was refused.');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStage('recording');
    } catch {
      setError('No microphone available, or permission was refused.');
      setStage('idle');
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    setStage('preparing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('no uri after stop');
      setTake({ uri, durationMs: lastDurationRef.current });
      setStage('ready');
    } catch {
      setError("That couldn't be prepared. Try recording again.");
      setStage('idle');
    }
  }, [recorder]);

  const handleAccept = useCallback(() => {
    if (!take) return;
    onAccept(normalizeVoiceRecording(take.uri, take.durationMs));
    onCancel();
  }, [take, onAccept, onCancel]);

  const elapsedMs = stage === 'recording' ? liveDurationMs : (take?.durationMs ?? 0);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      {stage === 'recording' ? <RecordingElapsed recorder={recorder} onTick={handleTick} /> : null}
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss" accessibilityRole="button" />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerLabel}>
            {stage === 'recording' ? <View style={styles.recordingDot} accessibilityElementsHidden /> : null}
            <Text style={styles.stageLabel} accessibilityLiveRegion="polite">
              {stage === 'recording' ? 'Recording' : stage === 'preparing' ? 'Preparing' : stage === 'ready' ? 'Ready' : 'Voice recording'}
            </Text>
          </View>
          {stage === 'recording' || stage === 'ready' ? (
            <Text style={styles.elapsed} accessibilityLabel={`${Math.round(elapsedMs / 1000)} seconds`}>
              {elapsedReading(elapsedMs)}
            </Text>
          ) : null}
        </View>

        {stage === 'ready' && take ? (
          <Pressable
            onPress={() => (playerStatus.playing ? player.pause() : player.play())}
            accessibilityRole="button"
            accessibilityLabel={playerStatus.playing ? 'Pause' : 'Play'}
            style={styles.playButton}
          >
            <Text style={styles.playButtonLabel}>{playerStatus.playing ? '‖ Pause' : '▶ Play'}</Text>
          </Pressable>
        ) : null}

        {error ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {stage === 'idle' ? (
            <>
              <Pressable onPress={() => void start()} accessibilityRole="button" accessibilityLabel="Start recording" style={styles.primaryButton}>
                <Text style={styles.primaryButtonLabel}>Start recording</Text>
              </Pressable>
              <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.ghostButton}>
                <Text style={styles.ghostButtonLabel}>Cancel</Text>
              </Pressable>
            </>
          ) : null}

          {stage === 'recording' ? (
            <Pressable onPress={() => void stop()} accessibilityRole="button" accessibilityLabel="Stop recording" style={styles.primaryButton}>
              <Text style={styles.primaryButtonLabel}>Stop</Text>
            </Pressable>
          ) : null}

          {stage === 'ready' && take ? (
            <>
              <Pressable onPress={handleAccept} accessibilityRole="button" accessibilityLabel="Enclose this" style={styles.primaryButton}>
                <Text style={styles.primaryButtonLabel}>Enclose this</Text>
              </Pressable>
              <Pressable onPress={() => void start()} accessibilityRole="button" accessibilityLabel="Record again" style={styles.ghostButton}>
                <Text style={styles.ghostButtonLabel}>Record again</Text>
              </Pressable>
              <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Discard" style={styles.ghostButton}>
                <Text style={styles.ghostButtonLabel}>Discard</Text>
              </Pressable>
            </>
          ) : null}
        </View>
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
    gap: space[3],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  stageLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  elapsed: { fontSize: fontSize.body, color: colors.ink, fontVariant: ['tabular-nums'] },
  playButton: { alignSelf: 'flex-start', paddingVertical: space[2] },
  playButtonLabel: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.medium, color: colors.brass },
  errorText: { fontSize: fontSize.body, color: colors.danger },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  primaryButton: {
    backgroundColor: colors.brass,
    borderRadius: radius.input,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  primaryButtonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.onAccent },
  ghostButton: { paddingVertical: space[3], paddingHorizontal: space[2] },
  ghostButtonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.muted },
});
