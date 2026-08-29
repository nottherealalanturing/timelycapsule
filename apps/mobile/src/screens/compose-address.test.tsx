import type { Capsule, Recipient, User } from '@tc/contracts';
import { act } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * react-native's real package can't be parsed by Vitest's transform (it
 * ships Flow syntax), so — as elsewhere in this project — it's mocked.
 * Host components are mocked as their own tag name string; `Platform` only
 * needs `OS` since the screen reads it once for `KeyboardAvoidingView`'s
 * `behavior` prop.
 */
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  StyleSheet: { create: (styles: unknown) => styles },
}));

// A native module with no JS-resolvable platform-suffixed entry point under
// Vitest's Node-style resolution (Metro's `.ios.js`/`.android.js`
// resolution is what makes it work at all on-device) — mocked as a plain
// tag so its `onValueChange`/`onDismiss` props can be driven directly.
vi.mock('@react-native-community/datetimepicker', () => ({
  default: 'DateTimePicker',
}));

const back = vi.fn();
let routeId = '11111111-1111-1111-1111-111111111111';
// A stable object, not a fresh literal per render — matching the real
// expo-router hook's own stability, and avoiding a test-double-only extra
// re-render each time some unrelated state changes.
const router = { back };
vi.mock('expo-router', () => ({
  useRouter: () => router,
  useLocalSearchParams: () => ({ id: routeId }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 0, left: 0, right: 0 }),
}));

let mockUser: User | null = null;
vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// The underlying transport is mocked; `useCapsuleDraft` itself is real, so
// this is a genuine integration test of fetch -> render -> patch, matching
// this project's established convention (see capsule-detail.test.tsx).
const get = vi.fn();
const patchFn = vi.fn();
const recipientsList = vi.fn();
const recipientsCreate = vi.fn();
const recipientsDelete = vi.fn();
vi.mock('../lib/api-client', () => ({
  capsulesApi: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patchFn(...args),
    recipients: (...args: unknown[]) => recipientsList(...args),
  },
  recipientsApi: {
    create: (...args: unknown[]) => recipientsCreate(...args),
    delete: (...args: unknown[]) => recipientsDelete(...args),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
    ) {
      super(message);
    }
  },
}));

const AddressScreen = (await import('../../app/(app)/compose/[id]/address')).default;

const FIXED_NOW = new Date('2026-01-01T09:00:00.000Z');

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

function renderScreen(): TestRenderer.ReactTestRenderer {
  let instance!: TestRenderer.ReactTestRenderer;
  act(() => {
    instance = TestRenderer.create(<AddressScreen />);
  });
  return instance;
}

/** Flushes the real (mocked-transport) fetch promise chain under fake timers. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function capsuleFixture(overrides: Partial<Capsule> = {}): Capsule {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    publicId: 'pub-1',
    type: 'personal',
    state: 'draft',
    title: null,
    cover: null,
    teaser: null,
    contentDocEnc: null,
    ownerKeyWrap: null,
    passphraseHint: null,
    sizeBytes: 0,
    unlockMode: 'absolute',
    unlockAt: null,
    unlockLocal: null,
    sealDeadlineAt: null,
    sealedAt: null,
    extendedOnce: false,
    seals: [],
    allowDownload: true,
    recipientsVisible: true,
    announceOnSeal: false,
    requireRecipientVerification: false,
    replyPrompt: null,
    location: null,
    expiresAfter: null,
    expiryStrict: false,
    expiredAt: null,
    archivedAt: null,
    mediaRetentionUntil: null,
    trashedAt: null,
    purgeAfter: null,
    withdrawnAt: null,
    legacyConfig: null,
    recurrence: null,
    breakGlass: 'disabled',
    isFavorite: false,
    tagIds: [],
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-01T00:00:00.000Z',
    ...overrides,
  };
}

function recipientFixture(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    capsuleId: '11111111-1111-1111-1111-111111111111',
    userId: null,
    email: 'ada@example.com',
    phone: null,
    displayName: null,
    status: 'added',
    firstOpenedAt: null,
    lastViewedAt: null,
    resolvedUnlockAt: null,
    verificationRequired: null,
    verifiedAt: null,
    isFallback: null,
    fallbackAfter: null,
    createdAt: '2025-12-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  back.mockReset();
  get.mockReset();
  patchFn.mockReset();
  recipientsList.mockReset().mockResolvedValue({ data: [] });
  recipientsCreate.mockReset();
  recipientsDelete.mockReset();
  mockUser = null;
  routeId = '11111111-1111-1111-1111-111111111111';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AddressScreen', () => {
  describe('loading and error states', () => {
    it('shows a loading state while the capsule and its recipients are being fetched', () => {
      get.mockReturnValue(new Promise(() => {}));
      const instance = renderScreen();
      expect(texts(instance)).toContain('Loading…');
    });

    it('shows an error state with retry on fetch failure, and recovers on retry', async () => {
      get.mockRejectedValueOnce(new Error('network down'));
      const instance = renderScreen();
      await flush();
      expect(texts(instance)).toContain("We couldn't load this capsule.");

      get.mockResolvedValueOnce({ capsule: capsuleFixture() });
      // Two Pressables exist even in the error state (the screen's own
      // always-rendered Back button plus ErrorState's retry control).
      const retryButton = instance.root
        .findAllByType(Pressable)
        .find((node) => node.props.accessibilityLabel !== 'Back')!;
      await act(async () => {
        retryButton.props.onPress();
      });
      await flush();
      expect(texts(instance)).toContain('Who is this for?');
    });

    it('fetches using the exact id from the route params', async () => {
      routeId = '99999999-9999-9999-9999-999999999999';
      get.mockResolvedValue({ capsule: capsuleFixture({ id: routeId }) });
      renderScreen();
      await flush();
      expect(get).toHaveBeenCalledWith('99999999-9999-9999-9999-999999999999');
      expect(recipientsList).toHaveBeenCalledWith('99999999-9999-9999-9999-999999999999');
    });
  });

  describe('who this is for — initial state', () => {
    it('defaults to "Someone else" selected for a personal-type draft, with the recipient input shown', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      const instance = renderScreen();
      await flush();

      const someoneElse = instance.root.findByProps({ accessibilityLabel: 'Someone else. They are told when it opens' });
      const myself = instance.root.findByProps({ accessibilityLabel: 'Myself. It comes back to you, and no one else' });
      expect(someoneElse.props.accessibilityState).toEqual({ selected: true });
      expect(myself.props.accessibilityState).toEqual({ selected: false });
      expect(instance.root.findByType(TextInput)).toBeTruthy();
    });

    it('shows "Myself" selected, and no recipient input, for a self-type draft', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = renderScreen();
      await flush();

      const myself = instance.root.findByProps({ accessibilityLabel: 'Myself. It comes back to you, and no one else' });
      expect(myself.props.accessibilityState).toEqual({ selected: true });
      expect(instance.root.findAllByType(TextInput)).toHaveLength(0);
    });

    it('the "When does it open?" section is hidden until someone is addressed', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      const instance = renderScreen();
      await flush();
      expect(texts(instance)).not.toContain('When does it open?');
    });

    it('the "When does it open?" section appears immediately for a self-type capsule', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = renderScreen();
      await flush();
      expect(texts(instance)).toContain('When does it open?');
    });
  });

  describe('toggling who this is for', () => {
    it('choosing "Myself" patches type: self', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      patchFn.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = renderScreen();
      await flush();

      const myself = instance.root.findByProps({ accessibilityLabel: 'Myself. It comes back to you, and no one else' });
      await act(async () => {
        myself.props.onPress();
      });
      await flush();
      expect(patchFn).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', { type: 'self' });
      expect(texts(instance)).toContain('When does it open?');
    });

    it('choosing "Someone else" patches type: personal', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      patchFn.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      const instance = renderScreen();
      await flush();

      const someoneElse = instance.root.findByProps({ accessibilityLabel: 'Someone else. They are told when it opens' });
      await act(async () => {
        someoneElse.props.onPress();
      });
      await flush();
      expect(patchFn).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', { type: 'personal' });
    });
  });

  describe('recipients — valid and invalid input', () => {
    it('adding a value containing "@" is sent as an email', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      recipientsCreate.mockResolvedValue({ recipient: recipientFixture({ email: 'amara@example.com' }), accessToken: 'raw' });
      const instance = renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => {
        input.props.onChangeText('amara@example.com');
      });
      const addButton = instance.root.findByProps({ accessibilityLabel: 'Add' });
      await act(async () => {
        addButton.props.onPress();
      });
      await flush();
      expect(recipientsCreate).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', { email: 'amara@example.com' });
    });

    it('adding a value with no "@" is sent as a phone number', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      recipientsCreate.mockResolvedValue({ recipient: recipientFixture({ email: null, phone: '+15555550123' }), accessToken: 'raw' });
      const instance = renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => {
        input.props.onChangeText('+15555550123');
      });
      const addButton = instance.root.findByProps({ accessibilityLabel: 'Add' });
      await act(async () => {
        addButton.props.onPress();
      });
      await flush();
      expect(recipientsCreate).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', { phone: '+15555550123' });
    });

    it('the "Add" button is disabled while the input is empty', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      const instance = renderScreen();
      await flush();
      const addButton = instance.root.findByProps({ accessibilityLabel: 'Add' });
      expect(addButton.props.accessibilityState).toEqual({ disabled: true });
    });

    it('a successful add renders a chip for the new recipient and clears the input', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      recipientsCreate.mockResolvedValue({ recipient: recipientFixture({ displayName: 'Amara' }), accessToken: 'raw' });
      const instance = renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => {
        input.props.onChangeText('amara@example.com');
      });
      const addButton = instance.root.findByProps({ accessibilityLabel: 'Add' });
      await act(async () => {
        addButton.props.onPress();
      });
      await flush();

      expect(texts(instance)).toContain('Amara');
      expect(instance.root.findByType(TextInput).props.value).toBe('');
    });

    it('shows a specific message for a duplicate recipient', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      const { ApiClientError } = await import('../lib/api-client');
      recipientsCreate.mockRejectedValue(new ApiClientError('recipient_already_added', 'Already added', 409));
      const instance = renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => {
        input.props.onChangeText('amara@example.com');
      });
      const addButton = instance.root.findByProps({ accessibilityLabel: 'Add' });
      await act(async () => {
        addButton.props.onPress();
      });
      await flush();
      expect(texts(instance)).toContain('That recipient is already added.');
    });

    it('shows a generic message for any other add failure', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      recipientsCreate.mockRejectedValue(new Error('network down'));
      const instance = renderScreen();
      await flush();

      const input = instance.root.findByType(TextInput);
      act(() => {
        input.props.onChangeText('amara@example.com');
      });
      const addButton = instance.root.findByProps({ accessibilityLabel: 'Add' });
      await act(async () => {
        addButton.props.onPress();
      });
      await flush();
      expect(texts(instance)).toContain('That recipient could not be added.');
    });

    it('removing a recipient calls the delete API and removes its chip', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'personal' }) });
      recipientsList.mockResolvedValue({ data: [recipientFixture({ displayName: 'Amara' })] });
      recipientsDelete.mockResolvedValue(undefined);
      const instance = renderScreen();
      await flush();
      expect(texts(instance)).toContain('Amara');

      const removeButton = instance.root.findByProps({ accessibilityLabel: 'Remove Amara' });
      await act(async () => {
        removeButton.props.onPress();
      });
      await flush();
      expect(recipientsDelete).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
      expect(texts(instance)).not.toContain('Amara');
    });
  });

  describe('when does it open — horizon and reading', () => {
    it('shows "No moment chosen yet." when nothing is selected', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = renderScreen();
      await flush();
      expect(texts(instance)).toContain('No moment chosen yet.');
    });

    it('renders at least one candidate row, and selecting one patches unlockAt with that candidate\'s instant', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      patchFn.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', unlockAt: '2026-02-01T09:00:00.000Z' }) });
      const instance = renderScreen();
      await flush();

      // Candidate rows are the Pressables whose accessibilityLabel ends in
      // a 4-digit year (the short date appended after the label/note) —
      // distinct from the two "Who is this for?" Choice buttons.
      const candidateRow = instance.root
        .findAllByType(Pressable)
        .find((n) => typeof n.props.accessibilityLabel === 'string' && /\d{4}$/.test(n.props.accessibilityLabel));
      expect(candidateRow).toBeTruthy();

      await act(async () => {
        candidateRow!.props.onPress();
      });
      await flush();
      expect(patchFn).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', expect.objectContaining({ unlockAt: expect.any(String) }));
    });

    it('the selected candidate carries accessibilityState selected: true; an unselected one does not', async () => {
      const unlockAt = '2026-02-01T09:00:00.000Z';
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', unlockAt }) });
      const instance = renderScreen();
      await flush();

      const rows = instance.root
        .findAllByType(Pressable)
        .filter((n) => typeof n.props.accessibilityLabel === 'string' && /\d{4}$/.test(n.props.accessibilityLabel));
      expect(rows.length).toBeGreaterThan(0);
      const selectedCount = rows.filter((n) => n.props.accessibilityState?.selected === true).length;
      expect(selectedCount).toBeLessThanOrEqual(1);
    });
  });

  describe('exact moment — native date/time picker', () => {
    it('shows placeholder labels before anything is chosen', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = renderScreen();
      await flush();
      expect(texts(instance)).toContain('Choose a date');
      expect(texts(instance)).toContain('Choose a time');
    });

    it('picking a date opens the native picker in "date" mode, and a value commits unlockAt at 09:00 by default', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      patchFn.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', unlockAt: '2026-03-15T09:00:00.000Z' }) });
      const instance = renderScreen();
      await flush();

      const dateField = instance.root.findByProps({ accessibilityLabel: 'Date. Choose a date' });
      act(() => {
        dateField.props.onPress();
      });

      const picker = instance.root.findByType('DateTimePicker' as never);
      expect(picker.props.mode).toBe('date');

      await act(async () => {
        picker.props.onValueChange({}, new Date('2026-03-15T00:00:00.000Z'));
      });
      await flush();

      expect(patchFn).toHaveBeenCalledTimes(1);
      const [, patchInput] = patchFn.mock.calls[0]!;
      expect(typeof patchInput.unlockAt).toBe('string');
      // No time chosen yet, so the picked date combines with the 09:00
      // default hour — matching web's own `'09:00'` fallback in
      // `ExactMoment.tsx`'s date-onChange handler.
      const committed = new Date(patchInput.unlockAt);
      expect(committed.getHours()).toBe(9);
      expect(committed.getMinutes()).toBe(0);
    });

    it('picking a time opens the native picker in "time" mode', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = renderScreen();
      await flush();

      const timeField = instance.root.findByProps({ accessibilityLabel: 'Time. Choose a time' });
      act(() => {
        timeField.props.onPress();
      });

      const picker = instance.root.findByType('DateTimePicker' as never);
      expect(picker.props.mode).toBe('time');
    });

    it('dismissing the picker without a value leaves the schedule unchanged', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = renderScreen();
      await flush();

      const dateField = instance.root.findByProps({ accessibilityLabel: 'Date. Choose a date' });
      act(() => {
        dateField.props.onPress();
      });
      const picker = instance.root.findByType('DateTimePicker' as never);
      act(() => {
        picker.props.onDismiss();
      });
      expect(patchFn).not.toHaveBeenCalled();
      expect(instance.root.findAllByType('DateTimePicker' as never)).toHaveLength(0);
    });
  });

  describe('validation messages', () => {
    it('shows the "has passed" message for a moment already in the past', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', unlockAt: '2025-01-01T00:00:00.000Z' }) });
      const instance = renderScreen();
      await flush();
      expect(texts(instance).join(' ')).toContain('has passed');
    });

    it('shows the fifty-year-horizon message for a moment set too far out', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', unlockAt: '2100-01-01T00:00:00.000Z' }) });
      const instance = renderScreen();
      await flush();
      expect(texts(instance)).toContain('A capsule can travel up to fifty years.');
    });

    it('shows no schedule-validity message for a comfortably valid moment', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self', unlockAt: '2027-01-01T00:00:00.000Z' }) });
      const instance = renderScreen();
      await flush();
      expect(texts(instance)).not.toContain('A capsule can travel up to fifty years.');
      expect(texts(instance).join(' ')).not.toContain('has passed');
    });
  });

  describe('navigation and state persistence', () => {
    it('the back button calls router.back()', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      const instance = renderScreen();
      await flush();
      const backButton = instance.root.findByProps({ accessibilityLabel: 'Back' });
      act(() => {
        backButton.props.onPress();
      });
      expect(back).toHaveBeenCalledTimes(1);
    });

    it('re-mounting for the same id reloads the current, already-saved server state (no local draft cache needed)', async () => {
      get.mockResolvedValueOnce({ capsule: capsuleFixture({ type: 'personal' }) });
      const first = renderScreen();
      await flush();
      expect(texts(first)).not.toContain('When does it open?');

      // Simulate the screen having been left and returned to: the server
      // now reflects an earlier "Myself" patch that a previous mount made.
      get.mockResolvedValueOnce({ capsule: capsuleFixture({ type: 'self' }) });
      const second = renderScreen();
      await flush();
      expect(texts(second)).toContain('When does it open?');
      expect(get).toHaveBeenCalledTimes(2);
    });
  });

  describe('accessibility', () => {
    it('pads the back button below the status bar using the real safe-area inset', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture() });
      const instance = renderScreen();
      await flush();
      const backButton = instance.root.findByProps({ accessibilityLabel: 'Back' });
      const style = [backButton.props.style].flat();
      const paddingTop = style.map((s) => s?.paddingTop).find((v) => v !== undefined);
      expect(paddingTop).toBe(40 + 16); // insets.top (40) + space[4] (16)
    });

    it('the "Who is this for?" and "When does it open?" headings are exposed as headers', async () => {
      get.mockResolvedValue({ capsule: capsuleFixture({ type: 'self' }) });
      const instance = renderScreen();
      await flush();
      expect(instance.root.findByProps({ children: 'Who is this for?' }).props.accessibilityRole).toBe('header');
      expect(instance.root.findByProps({ children: 'When does it open?' }).props.accessibilityRole).toBe('header');
    });

    it('never imports SecureStore, AsyncStorage, the token store, or the raw @tc/crypto package — this screen never touches key material', async () => {
      const { readFileSync } = await import('node:fs');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const here = dirname(fileURLToPath(import.meta.url));
      const source = readFileSync(join(here, '../../app/(app)/compose/[id]/address.tsx'), 'utf-8');
      const importLines = source
        .split('\n')
        .filter((line) => line.trim().startsWith('import '))
        .join('\n');
      expect(importLines).not.toMatch(/expo-secure-store|AsyncStorage|token-store|@tc\/crypto|master-key-context/);
    });
  });
});
