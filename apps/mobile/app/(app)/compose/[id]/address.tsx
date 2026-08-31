import type { HorizonChoice, HorizonPerson } from '@tc/core';
import { deviceZone, horizonCandidates, instantFrom, reasonFor } from '@tc/core';
import type { Recipient } from '@tc/contracts';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState } from '../../../../src/components/error-state';
import { LoadingState } from '../../../../src/components/loading-state';
import { useAuth } from '../../../../src/lib/auth-context';
import { describeScheduleProblem, MAX_UNLOCK_HORIZON_MS } from '../../../../src/lib/schedule-validity';
import { colors, fontSize, fontWeight, radius, space } from '../../../../src/lib/tokens';
import { useCapsuleDraft } from '../../../../src/lib/use-capsule-draft';

/**
 * Movement I — Address (E1.4.1). Reproduces the product semantics of
 * `apps/web/src/components/composer/v2/AddressMovement.tsx`
 * (`design/21-CAPSULE-CREATION-V2.md §III`: address the reader first, then
 * do the arithmetic on their future age) as a mobile-native screen rather
 * than a pixel copy of web's log-scale line. Two beats, in the same order:
 * who this is for, then when it belongs — the second only appears once the
 * first is answered, same as web's `answeredWho` gate.
 *
 * Deliberately narrower than web in ways disclosed here, not silently:
 *
 *  - No contact book exists on mobile, so a recipient's birthday is never
 *    known here — `person` is only ever built for a self-capsule, from
 *    `useAuth().user?.birthday`. This means milestone horizons ("when Amara
 *    turns 10") never appear for a capsule addressed to someone else on
 *    mobile yet; the calendar-moment and length candidates still do.
 *  - No zone picker, no `recipient_local` unlock mode — this screen only
 *    ever writes `unlockAt` in the device's own current zone
 *    (`deviceZone()`), matching what `packages/core/src/zoned-time.ts`'s
 *    header comment says this ticket's native date/time picker needs.
 *
 * E1.4.3 adds the one thing this screen was honestly missing before Compose
 * existed: a "Continue" advance, gated exactly like web's own footer
 * (`apps/web/src/components/composer/Composer.tsx`'s `hasMoment` —
 * `Boolean(capsule.unlockAt || capsule.unlockLocal)`, disabled otherwise with
 * the exact copy "Choose when it opens") — not on `answeredWho`, and not on
 * `scheduleProblem` being clear: a moment that currently reads "less than
 * five minutes away" still advances (only Seal, not yet built, cares whether
 * the schedule is *valid*; Compose only cares whether one exists at all).
 */
export default function AddressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { state, retry, patch, patchError, addRecipient, removeRecipient, recipientError } = useCapsuleDraft(id);

  // Captured once per mount, exactly like web's own `AddressMovement` — a
  // horizon is measured in months and years, so a few seconds of drift
  // between this and the next render is irrelevant, and freezing it keeps
  // the candidate list from silently reordering itself mid-scroll.
  const [now] = useState(() => new Date());
  const tz = useMemo(() => deviceZone(), []);

  const capsule = state.status === 'ready' ? state.capsule : null;
  const recipients = state.status === 'ready' ? state.recipients : [];
  const isSelf = capsule?.type === 'self';

  const person = useMemo<HorizonPerson | null>(() => {
    if (!isSelf) return null;
    return user?.birthday ? { name: 'you', birthday: user.birthday, self: true } : null;
  }, [isSelf, user]);

  const candidates = useMemo(
    () => horizonCandidates(now, tz, person, { maxHorizonMs: MAX_UNLOCK_HORIZON_MS }),
    [now, tz, person],
  );

  const reason = useCallback((at: Date) => reasonFor(at, candidates, person, tz, now), [candidates, person, tz, now]);

  const selected = capsule?.unlockAt ? new Date(capsule.unlockAt) : null;
  // `now` (captured once, above) rather than a fresh `Date.now()` — reading
  // the clock during render is impure, and this screen has no ticking
  // countdown to refresh against anyway; a re-render for any other reason
  // (a patch resolving, a candidate picked) is when this reevaluates.
  const scheduleProblem = describeScheduleProblem(selected, now.getTime());

  const commit = useCallback((at: Date) => void patch({ unlockAt: at.toISOString() }), [patch]);

  const answeredWho = isSelf || recipients.length > 0;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.back, { paddingTop: insets.top + space[4] }]}
      >
        <Text style={styles.backLabel}>‹ Back</Text>
      </Pressable>

      {state.status === 'loading' && <LoadingState message="Loading…" />}
      {state.status === 'error' && <ErrorState message="We couldn't load this capsule." onRetry={retry} />}

      {state.status === 'ready' && capsule ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <WhoBeat
              isSelf={isSelf}
              onChangeIsSelf={(next) => void patch({ type: next ? 'self' : 'personal' })}
              recipients={recipients}
              onAdd={addRecipient}
              onRemove={removeRecipient}
              error={recipientError}
            />

            {patchError ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {patchError}
              </Text>
            ) : null}

            {answeredWho ? (
              <View style={styles.section} accessible={false}>
                <Text style={styles.sectionHeading} accessibilityRole="header">
                  When does it open?
                </Text>

                <Reading at={selected} reason={selected ? reason(selected) : null} />

                <View style={styles.candidateList}>
                  {candidates.map((c) => (
                    <CandidateRow key={c.id} choice={c} selected={selected} onSelect={commit} />
                  ))}
                </View>

                <ExactMomentSection selected={selected} tz={tz} now={now} onCommit={commit} />

                {scheduleProblem ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {scheduleProblem.message}
                  </Text>
                ) : null}

                <Pressable
                  onPress={() => router.push(`/(app)/compose/${id}/compose`)}
                  disabled={!selected}
                  accessibilityRole="button"
                  accessibilityLabel={selected ? 'Compose' : 'Choose when it opens'}
                  accessibilityState={{ disabled: !selected }}
                  style={[styles.advanceButton, !selected && styles.advanceButtonDisabled]}
                >
                  <Text style={styles.advanceButtonLabel}>{selected ? 'Compose' : 'Choose when it opens'}</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * "Who is this for?" — reproduces `AddresseeBeat.tsx`'s exact copy (the
 * source of truth over `design/21-CAPSULE-CREATION-V2.md §III`'s paraphrase,
 * confirmed by reading the component directly) and its two-choice-then-
 * chips-then-input shape. Contact-autocomplete suggestions are not ported:
 * mobile has no contact book at all.
 */
function WhoBeat({
  isSelf,
  onChangeIsSelf,
  recipients,
  onAdd,
  onRemove,
  error,
}: {
  isSelf: boolean;
  onChangeIsSelf: (isSelf: boolean) => void;
  recipients: Recipient[];
  onAdd: (input: { email?: string; phone?: string }) => Promise<boolean>;
  onRemove: (id: string) => void;
  error: string | null;
}) {
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = useCallback(async () => {
    const value = input.trim();
    if (!value) return;
    const payload = isEmail(value) ? { email: value } : { phone: value };
    setAdding(true);
    try {
      const ok = await onAdd(payload);
      if (ok) setInput('');
    } finally {
      setAdding(false);
    }
  }, [input, onAdd]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading} accessibilityRole="header">
        Who is this for?
      </Text>

      <View style={styles.choiceRow}>
        <Choice selected={!isSelf} onSelect={() => onChangeIsSelf(false)} title="Someone else" detail="They are told when it opens" />
        <Choice selected={isSelf} onSelect={() => onChangeIsSelf(true)} title="Myself" detail="It comes back to you, and no one else" />
      </View>

      {isSelf ? null : (
        <View style={styles.recipientBlock}>
          {recipients.length > 0 ? (
            <View style={styles.chipRow}>
              {recipients.map((r) => {
                const label = r.displayName || r.email || r.phone || 'Someone';
                return (
                  <View key={r.id} style={styles.chip}>
                    <Text style={styles.chipLabel} numberOfLines={1}>
                      {label}
                    </Text>
                    <Pressable onPress={() => onRemove(r.id)} accessibilityRole="button" accessibilityLabel={`Remove ${label}`}>
                      <Text style={styles.chipRemove}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.recipientInput}
              value={input}
              onChangeText={setInput}
              placeholder={recipients.length > 0 ? 'jordan@example.com' : 'amara@example.com'}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              accessibilityLabel={recipients.length > 0 ? 'Anyone else?' : 'Their email or phone'}
              editable={!adding}
              onSubmitEditing={() => void submit()}
            />
            <Pressable
              onPress={() => void submit()}
              disabled={adding || input.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Add"
              accessibilityState={{ disabled: adding || input.trim().length === 0 }}
              style={[styles.addButton, (adding || input.trim().length === 0) && styles.addButtonDisabled]}
            >
              <Text style={styles.addButtonLabel}>Add</Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function Choice({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${detail}`}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={styles.choiceTitle}>{title}</Text>
      <Text style={styles.choiceDetail}>{detail}</Text>
    </Pressable>
  );
}

/**
 * What has been chosen, stated — reproduces `Horizon.tsx`'s `Reading`
 * sub-component's exact copy for the empty case, and the same
 * date-then-reason shape once something is selected. No zone/city line:
 * this screen only ever operates in the device's own zone, so there is
 * nothing else worth stating here (see this file's header comment).
 */
function Reading({ at, reason }: { at: Date | null; reason: string | null }) {
  if (!at) {
    return (
      <Text style={styles.reading} accessibilityLiveRegion="polite">
        No moment chosen yet.
      </Text>
    );
  }
  const date = at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return (
    <View accessibilityLiveRegion="polite" style={styles.readingBlock}>
      <Text style={styles.readingDate}>
        {date} · {time}
      </Text>
      {reason ? <Text style={styles.readingReason}>{reason}</Text> : null}
    </View>
  );
}

function CandidateRow({ choice, selected, onSelect }: { choice: HorizonChoice; selected: Date | null; onSelect: (at: Date) => void }) {
  const isSelected = selected !== null && Math.abs(selected.getTime() - choice.at.getTime()) < 60_000;
  const dateLabel = choice.at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const label = [choice.label, choice.note, dateLabel].filter(Boolean).join('. ');
  return (
    <Pressable
      onPress={() => onSelect(choice.at)}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
      style={[styles.candidateRow, isSelected && styles.candidateRowSelected]}
    >
      <View style={styles.candidateMain}>
        <Text style={[styles.candidateLabel, choice.kind === 'length' && styles.candidateLabelSecondary]}>{choice.label}</Text>
        {choice.note ? <Text style={styles.candidateNote}>{choice.note}</Text> : null}
      </View>
      <Text style={styles.candidateDate}>{dateLabel}</Text>
    </Pressable>
  );
}

/**
 * "Or a particular day" — reproduces `ExactMoment.tsx`'s caption and its
 * date-then-time shape, using a native picker in place of web's `<input
 * type="date">`/`<input type="time">` pair. Always in the device's own
 * zone; there is no zone/recipient-local control here (see header comment).
 */
function ExactMomentSection({
  selected,
  tz,
  now,
  onCommit,
}: {
  selected: Date | null;
  tz: string;
  now: Date;
  onCommit: (at: Date) => void;
}) {
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  const base = useMemo(() => {
    if (selected) return selected;
    const withDefaultHour = new Date(now);
    withDefaultHour.setHours(9, 0, 0, 0);
    return withDefaultHour;
  }, [selected, now]);

  const commitFromPicker = useCallback(
    (mode: 'date' | 'time', picked: Date) => {
      const wall =
        mode === 'date'
          ? { year: picked.getFullYear(), month: picked.getMonth() + 1, day: picked.getDate(), hour: base.getHours(), minute: base.getMinutes() }
          : { year: base.getFullYear(), month: base.getMonth() + 1, day: base.getDate(), hour: picked.getHours(), minute: picked.getMinutes() };
      onCommit(instantFrom(wall, tz));
    },
    [base, onCommit, tz],
  );

  const dateLabel = selected ? selected.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose a date';
  const timeLabel = selected ? selected.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Choose a time';

  return (
    <View style={styles.exactMoment}>
      <Text style={styles.exactMomentCaption}>Or a particular day</Text>
      <View style={styles.exactMomentRow}>
        <Pressable onPress={() => setPicker('date')} accessibilityRole="button" accessibilityLabel={`Date. ${dateLabel}`} style={styles.exactMomentField}>
          <Text style={styles.fieldLabel}>Date</Text>
          <Text style={styles.fieldValue}>{dateLabel}</Text>
        </Pressable>
        <Pressable onPress={() => setPicker('time')} accessibilityRole="button" accessibilityLabel={`Time. ${timeLabel}`} style={styles.exactMomentField}>
          <Text style={styles.fieldLabel}>Time</Text>
          <Text style={styles.fieldValue}>{timeLabel}</Text>
        </Pressable>
      </View>

      {picker ? (
        <DateTimePicker
          value={base}
          mode={picker}
          display="default"
          onValueChange={(_event, picked) => {
            setPicker(null);
            commitFromPicker(picker, picked);
          }}
          onDismiss={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
  flex: { flex: 1 },
  back: { padding: space[4], alignSelf: 'flex-start' },
  backLabel: { fontSize: fontSize.body, color: colors.muted },
  content: { padding: space[4], paddingTop: 0, gap: space[8], paddingBottom: space[12] },
  section: { gap: space[4] },
  sectionHeading: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.medium,
    color: colors.ink,
  },
  choiceRow: { flexDirection: 'row', gap: space[2] },
  choice: {
    flex: 1,
    gap: space[1],
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: space[3],
  },
  choiceSelected: {
    borderColor: colors.steel,
    backgroundColor: colors.raised,
  },
  choiceTitle: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.ink },
  choiceDetail: { fontSize: fontSize.caption, color: colors.muted },
  recipientBlock: { gap: space[3] },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: space[1],
    paddingHorizontal: space[3],
    maxWidth: 220,
  },
  chipLabel: { fontSize: fontSize.body, color: colors.ink, flexShrink: 1 },
  chipRemove: { fontSize: fontSize.bodyLarge, color: colors.muted },
  inputRow: { flexDirection: 'row', gap: space[2], alignItems: 'center' },
  recipientInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.input,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontSize: fontSize.body,
    color: colors.ink,
    backgroundColor: colors.overlay,
  },
  addButton: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.input,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  addButtonDisabled: { opacity: 0.5 },
  addButtonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.ink },
  errorText: { fontSize: fontSize.body, color: colors.danger },
  reading: { fontSize: fontSize.body, color: colors.muted },
  readingBlock: { gap: space[1] },
  readingDate: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.ink },
  readingReason: { fontSize: fontSize.body, color: colors.ink },
  candidateList: { gap: space[1] },
  candidateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: radius.input,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  candidateRowSelected: {
    borderLeftColor: colors.steel,
    backgroundColor: colors.raised,
  },
  candidateMain: { flex: 1, flexDirection: 'row', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap' },
  candidateLabel: { fontSize: fontSize.body, color: colors.ink },
  candidateLabelSecondary: { color: colors.muted },
  candidateNote: { fontSize: fontSize.caption, color: colors.muted },
  candidateDate: { fontSize: fontSize.caption, color: colors.muted },
  exactMoment: {
    gap: space[3],
    paddingTop: space[4],
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  exactMomentCaption: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  exactMomentRow: { flexDirection: 'row', gap: space[2] },
  exactMomentField: {
    flex: 1,
    gap: space[1],
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.input,
    padding: space[3],
  },
  fieldLabel: { fontSize: fontSize.caption, fontWeight: fontWeight.medium, color: colors.muted },
  fieldValue: { fontSize: fontSize.body, color: colors.ink },
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
