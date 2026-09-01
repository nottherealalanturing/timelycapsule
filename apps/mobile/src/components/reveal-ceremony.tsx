import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, Text, View } from 'react-native';
import { envelopeText, type LetterEnvelope } from '../lib/capsule-crypto';
import { segment, useReducedMotion, useTransit } from '../lib/reveal-transit';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

/**
 * Mobile port of `apps/web/src/components/reveal/{TransitStage,
 * RevealCeremony}.tsx`'s `RecordAtRest`, letter-only. PHASE-5.2's own
 * boundary: no media (`EnclosureViewer`'s job is PHASE-5.3's), no reply
 * composer, no download-a-copy, no "Keep this"/save-to-account — those are
 * real web features this ticket deliberately does not port, matching the
 * readiness audit's explicit non-goals for this ticket.
 *
 * `alreadyOpened` skips the ceremony animation entirely and renders the
 * record at rest immediately (`06`: "Never replay. Returning to an opened
 * capsule shows the record at rest.") — the letter itself is never gated by
 * the animation regardless (`07 §V.7`), only the ceremony choreography is.
 *
 * No haptics anywhere in this component — `07-EXPERIENCE-BIBLE.md` Part VII
 * bans them on the reveal permanently; PHASE-5.1 already established this
 * and nothing here reintroduces it.
 */
export function RevealCeremony({ publicId, senderName, envelope, alreadyOpened }: { publicId: string; senderName: string; envelope: LetterEnvelope; alreadyOpened: boolean }) {
  const { known: motionKnown, reduced } = useReducedMotion();
  // Ceremony never starts before the real reduced-motion preference is
  // known — starting with an assumed value risks animating the wrong
  // timeline (see reveal-transit.ts's own comment on why there is no
  // synchronous read available on this platform, unlike web's `matchMedia`).
  const active = !alreadyOpened && motionKnown;
  const transit = useTransit(active, reduced);

  const letterText = envelopeText(envelope);
  const paragraphs = letterText.split('\n\n').filter((line) => line.trim().length > 0);
  const letterProgress = alreadyOpened ? 1 : segment(transit.elapsedMs, transit.marks.recordEnd, transit.marks.letterEnd);
  const recordPresent = alreadyOpened || transit.elapsedMs >= transit.marks.emptyFrameEnd;

  const headingRef = useRef<View>(null);
  const announcedRef = useRef(false);

  // `06 §Accessibility` — announce the crossing once, and move focus to the
  // letter heading once it has fully arrived. Mirrors web's own
  // `aria-live="polite"` announcement + `headingRef.current?.focus()`,
  // through RN's real equivalents (`announceForAccessibility`,
  // `setAccessibilityFocus`) rather than a web-only API.
  useEffect(() => {
    if (transit.opened && !announcedRef.current) {
      announcedRef.current = true;
      AccessibilityInfo.announceForAccessibility(`Capsule opened. ${senderName} wrote to you.`);
    }
  }, [transit.opened, senderName]);

  useEffect(() => {
    if (letterProgress >= 1) {
      const node = findNodeHandle(headingRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }
  }, [letterProgress]);

  if (alreadyOpened) {
    return (
      <View style={styles.container}>
        <Frame publicId={publicId} label="Opened" />
        <Record senderName={senderName} paragraphs={paragraphs} headingRef={headingRef} progress={1} />
      </View>
    );
  }

  const approach = segment(transit.elapsedMs, 0, transit.marks.approachEnd);
  const instrumentVisible = transit.elapsedMs < transit.marks.recedeEnd;

  return (
    <View style={styles.container}>
      {!transit.done ? (
        <Pressable
          onPress={transit.skip}
          accessibilityRole="button"
          accessibilityLabel="Show the letter now"
          style={styles.skipButton}
        >
          <Text style={styles.skipLabel}>Show the letter now</Text>
        </Pressable>
      ) : null}

      <Frame publicId={publicId} label={transit.opened ? 'Opened' : 'Transit'} />

      {/*
       * "Tap advances to the end state" (`06 §Implementation`) — but this
       * tappable region deliberately covers only the instrument/blank area,
       * never the arrived record. A real TalkBack finding from this
       * ticket's own device verification: wrapping the *whole* ceremony
       * (letter included) in one `Pressable` made Android collapse every
       * paragraph into a single aggregated speakable node — a real
       * accessibility regression web's DOM structure doesn't have (a plain
       * `<main onClick>` div doesn't trigger this merging; a native touchable
       * container does). Once the record is present, it renders as a plain
       * sibling `View`, never nested inside a touchable, so every paragraph
       * stays individually reachable by TalkBack the same way capsule-
       * detail.tsx's own record already is.
       */}
      {!transit.done ? (
        <Pressable onPress={transit.skip} accessible={false} style={styles.tapCatcher}>
          {instrumentVisible ? (
            <View style={styles.instrument} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.instrumentLine} />
              <View style={[styles.instrumentMarker, { left: `${2 + approach * 68}%` }]} />
            </View>
          ) : (
            <View style={styles.instrumentPlaceholder} />
          )}
        </Pressable>
      ) : null}

      {recordPresent ? (
        <Record senderName={senderName} paragraphs={paragraphs} headingRef={headingRef} progress={letterProgress} />
      ) : null}
    </View>
  );
}

function Frame({ publicId, label }: { publicId: string; label: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.hallmark}>{publicId}</Text>
      <Text style={styles.hallmark} accessibilityLiveRegion="polite">
        {label}
      </Text>
    </View>
  );
}

/**
 * The record, at rest — letter only. `progress` drives the same staggered
 * opacity arrival web's own inline `style={{opacity}}` per-paragraph does
 * (`Math.min(1, Math.max(0, progress * 3 - i * 0.3))`), ported verbatim.
 */
function Record({
  senderName,
  paragraphs,
  headingRef,
  progress,
}: {
  senderName: string;
  paragraphs: string[];
  headingRef: React.RefObject<View | null>;
  progress: number;
}) {
  return (
    <View style={styles.record}>
      <View ref={headingRef} accessible accessibilityRole="header">
        <Text style={styles.heading}>{senderName} wrote to you.</Text>
      </View>
      {paragraphs.length > 0 ? (
        paragraphs.map((para, i) => (
          <Text key={i} style={[styles.paragraph, { opacity: Math.min(1, Math.max(0, progress * 3 - i * 0.3)) }]}>
            {para}
          </Text>
        ))
      ) : (
        <Text style={styles.paragraph}>Nothing was written.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space[6], gap: space[8] },
  tapCatcher: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  hallmark: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.muted, textTransform: 'uppercase' },
  instrument: { height: 80, justifyContent: 'center' },
  instrumentPlaceholder: { height: 80 },
  instrumentLine: { height: 1, backgroundColor: colors.rule },
  instrumentMarker: { position: 'absolute', top: '50%', width: 8, height: 8, marginTop: -4, borderRadius: 1, backgroundColor: colors.brass },
  skipButton: { alignSelf: 'flex-start', paddingVertical: space[1], paddingHorizontal: space[2] },
  skipLabel: { fontSize: fontSize.caption, color: colors.muted },
  record: { gap: space[4] },
  heading: { fontSize: fontSize.body, color: colors.muted },
  paragraph: { fontSize: fontSize.bodyLarge, color: colors.ink, lineHeight: fontSize.bodyLarge * 1.5 },
});
