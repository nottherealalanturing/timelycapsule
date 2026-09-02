import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { enclosureNoun } from '../lib/enclosure-media';
import { extensionFor, writeTempMediaFile } from '../lib/media-temp-file';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

export interface ViewableEnclosure {
  id: string;
  kind: string;
  mime: string | null;
  caption: string | null;
  originalName: string | null;
  released: boolean;
  releasedAt: string | null;
}

type ViewerStage = 'closed' | 'opening' | 'open' | 'failed';

/** `en-GB` explicitly, matching `reveal-format.ts`'s own `formatAbsoluteDate` and web's identical hardcoded locale — `07-EXPERIENCE-BIBLE.md` §VIII.4's literal-date rule reads the same regardless of the visitor's device locale. */
function formatReleaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Mobile port of `apps/web/src/components/enclosure/EnclosureViewer.tsx` —
 * same three rules (open in place, museum-label chrome, nothing decrypts
 * itself), same stage model (`closed → opening → open|failed`), same
 * released-enclosure handling. The one structural difference: RN has no
 * blob-URL equivalent, so `load()`'s decrypted bytes are written to a real
 * temp file (`media-temp-file.ts`) instead of an object URL, with the same
 * bounded, cleaned-up-on-close lifecycle.
 *
 * `load` is supplied by the caller (the reveal screen), exactly matching
 * web's own prop shape — transport and the capsule key stay there; this
 * component only owns presentation.
 */
export function EnclosureViewer({
  enclosure,
  load,
}: {
  enclosure: ViewableEnclosure;
  load: () => Promise<Uint8Array>;
}) {
  const [stage, setStage] = useState<ViewerStage>('closed');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  async function open() {
    setStage('opening');
    try {
      const plaintext = await load();
      const { uri, cleanup } = writeTempMediaFile(plaintext, extensionFor(enclosure.mime, enclosure.originalName));
      cleanupRef.current?.();
      cleanupRef.current = cleanup;
      setFileUri(uri);
      setStage('open');
    } catch {
      // Never the raw error — an AES-GCM auth-tag failure or a truncated
      // upload carries no plaintext, but this component has no way to
      // prove that for every possible thrown value, so it states a plain,
      // non-technical message instead (closing the readiness audit's own
      // Open Decision on this exact point) and never calls console.* at all.
      setStage('failed');
    }
  }

  const noun = enclosureNoun(enclosure.kind);
  const label = enclosure.caption || enclosure.originalName || noun;
  const accessibleLabel = [noun, enclosure.caption || enclosure.originalName].filter(Boolean).join(', ');

  return (
    <View style={styles.container}>
      <View style={styles.accessionRow} accessible accessibilityRole="text" accessibilityLabel={accessibleLabel}>
        <Text style={styles.noun}>{noun}</Text>
      </View>

      {enclosure.released ? (
        <View style={styles.body}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.caption}>
            {enclosure.releasedAt ? `Released from storage on ${formatReleaseDate(enclosure.releasedAt)}.` : 'Released from storage.'}
          </Text>
        </View>
      ) : stage === 'open' && fileUri ? (
        <Rendered enclosure={enclosure} uri={fileUri} label={label} />
      ) : (
        <View style={styles.body}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {stage === 'opening' ? (
            <Text style={styles.caption} accessibilityLiveRegion="polite">
              Opening
            </Text>
          ) : (
            <Pressable
              onPress={() => void open()}
              accessibilityRole="button"
              accessibilityLabel={stage === 'failed' ? `Try again, ${accessibleLabel}` : `Open, ${accessibleLabel}`}
            >
              <Text style={styles.action}>{stage === 'failed' ? 'Try again' : 'Open'}</Text>
            </Pressable>
          )}
        </View>
      )}

      {stage === 'failed' ? (
        <Text style={styles.error} accessibilityRole="alert">
          This could not be opened. The file may not have finished arriving when the capsule was sealed.
        </Text>
      ) : null}

      {stage === 'open' && enclosure.caption ? <Text style={styles.caption}>{enclosure.caption}</Text> : null}
    </View>
  );
}

function Rendered({ enclosure, uri, label }: { enclosure: ViewableEnclosure; uri: string; label: string }) {
  if (enclosure.kind === 'image') {
    return <Image source={{ uri }} style={styles.image} accessibilityLabel={label} resizeMode="contain" />;
  }
  if (enclosure.kind === 'video') {
    return <VideoPlayerBlock uri={uri} label={label} />;
  }
  if (enclosure.kind === 'audio' || enclosure.kind === 'voice') {
    return <AudioPlayerBlock uri={uri} label={label} />;
  }
  // Documents (including PDF), archives, and anything else: no native PDF
  // renderer for V1 (the readiness audit's own explicit non-goal) — the
  // same designed, non-degraded fallback web uses for a browser that
  // refuses to embed a PDF either.
  return <Text style={styles.fallback}>{label} — kept as it was enclosed. Take a copy to open it.</Text>;
}

function VideoPlayerBlock({ uri, label }: { uri: string; label: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      accessibilityLabel={label}
      contentFit="contain"
    />
  );
}

function AudioPlayerBlock({ uri, label }: { uri: string; label: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable
      onPress={() => (status.playing ? player.pause() : player.play())}
      accessibilityRole="button"
      accessibilityLabel={`${status.playing ? 'Pause' : 'Play'}, ${label}`}
      style={styles.audioButton}
    >
      <Text style={styles.action}>{status.playing ? 'Pause' : 'Play'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[2], borderWidth: 1, borderColor: colors.rule, borderRadius: 4, padding: space[3] },
  accessionRow: { flexDirection: 'row' },
  noun: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.muted, textTransform: 'uppercase' },
  body: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  label: { flex: 1, fontSize: fontSize.body, color: colors.ink },
  caption: { fontSize: fontSize.caption, color: colors.muted },
  action: { fontSize: fontSize.body, color: colors.steel, fontWeight: fontWeight.medium },
  error: { fontSize: fontSize.body, color: colors.danger },
  fallback: { fontSize: fontSize.body, color: colors.muted },
  image: { width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: colors.raised },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: 4, backgroundColor: colors.raised },
  audioButton: {
    alignSelf: 'flex-start',
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.rule,
  },
});
