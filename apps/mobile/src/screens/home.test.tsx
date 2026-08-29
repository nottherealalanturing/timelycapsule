import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CapsuleListItem } from '@tc/contracts';
import { act } from 'react';
import { Pressable, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { space } from '../lib/tokens';
import type { CapsulesState } from '../lib/use-capsules';

/**
 * react-native's real package can't be parsed by Vitest's transform (it
 * ships Flow syntax), so — as elsewhere in this project — it's mocked.
 * `FlatList` needs a real (if minimal) implementation rather than a bare
 * tag-name string: this screen's pagination behavior (onEndReached,
 * rendering every row, the footer) is exactly what these tests need to
 * exercise, and a string mock would never call `renderItem` at all — that
 * logic lives inside FlatList's real implementation, which a plain host
 * tag doesn't have.
 */
vi.mock('react-native', () => {
  // vi.mock factories are hoisted above this file's own imports, so a
  // top-level `import React from 'react'` isn't reachable in here yet
  // (TDZ) — `require` is the standard escape hatch for this exact case.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  function FlatList({
    data,
    renderItem,
    keyExtractor,
    onEndReached,
    ListFooterComponent,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => unknown;
    keyExtractor?: (item: unknown, index: number) => string;
    onEndReached?: () => void;
    ListFooterComponent?: unknown;
  }) {
    return React.createElement(
      'FlatList',
      { onEndReached },
      ...data.map((item, index) =>
        React.createElement(React.Fragment, { key: keyExtractor ? keyExtractor(item, index) : index }, renderItem({ item, index })),
      ),
      React.isValidElement(ListFooterComponent) ? ListFooterComponent : null,
    );
  }
  return {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    FlatList,
    StyleSheet: { create: (styles: unknown) => styles },
  };
});

const push = vi.fn();
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 0, left: 0, right: 0 }),
}));

let mockState: CapsulesState = { status: 'loading' };
const retry = vi.fn();
const loadMore = vi.fn();
vi.mock('../lib/use-capsules', () => ({
  useCapsules: () => ({ state: mockState, retry, loadMore }),
}));

const HomeTab = (await import('../../app/(app)/(tabs)/home')).default;

function capsuleFixture(overrides: Partial<CapsuleListItem> = {}): CapsuleListItem {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    publicId: 'pub-1',
    type: 'personal',
    state: 'sealed',
    title: 'A letter to future me',
    cover: null,
    teaser: 'Some things I want to remember',
    passphraseHint: null,
    sizeBytes: 0,
    unlockMode: 'absolute',
    unlockAt: '2026-06-01T00:00:00.000Z',
    unlockLocal: null,
    sealDeadlineAt: null,
    sealedAt: '2026-01-01T00:00:00.000Z',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

function renderScreen(): TestRenderer.ReactTestRenderer {
  let instance!: TestRenderer.ReactTestRenderer;
  act(() => {
    instance = TestRenderer.create(<HomeTab />);
  });
  return instance;
}

beforeEach(() => {
  push.mockReset();
  retry.mockReset();
  loadMore.mockReset();
  mockState = { status: 'loading' };
});

describe('HomeTab', () => {
  it('renders LoadingState while loading', () => {
    mockState = { status: 'loading' };
    const instance = renderScreen();
    expect(texts(instance)).toContain('Loading your capsules…');
  });

  it('renders EmptyState for a successful empty response', () => {
    mockState = { status: 'ready', items: [], nextCursor: null, nextPageError: false };
    const instance = renderScreen();
    expect(texts(instance)).toContain('Nothing sealed yet.');
  });

  it('renders ErrorState on initial API/network failure, and retry calls the hook\'s retry', () => {
    mockState = { status: 'error' };
    const instance = renderScreen();
    expect(texts(instance)).toContain("We couldn't load your capsules.");

    // Two Pressables now exist (the header's "New" button plus the retry
    // control); ErrorState's is the one carrying an accessibilityRole of
    // "button" with no accessibilityLabel of "New capsule".
    const retryButton = instance.root
      .findAllByType(Pressable)
      .find((node) => node.props.accessibilityLabel !== 'New capsule')!;
    act(() => {
      retryButton.props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders multiple capsules through the normalized model', () => {
    mockState = {
      status: 'ready',
      items: [capsuleFixture({ id: 'a', title: 'First' }), capsuleFixture({ id: 'b', title: 'Second' })],
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    const rendered = texts(instance);
    expect(rendered).toContain('First');
    expect(rendered).toContain('Second');
  });

  it('renders the fallback title and no crash for a capsule with null title/teaser', () => {
    mockState = {
      status: 'ready',
      items: [capsuleFixture({ title: null, teaser: null })],
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    expect(texts(instance)).toContain('Untitled capsule');
  });

  it('renders every documented CapsuleState without crashing', () => {
    const states: CapsuleListItem['state'][] = ['draft', 'sealing', 'sealed', 'unlocked', 'expired', 'withdrawn'];
    mockState = {
      status: 'ready',
      items: states.map((state, i) => capsuleFixture({ id: `id-${i}`, state, title: `Capsule ${state}` })),
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    const rendered = texts(instance);
    for (const state of states) {
      expect(rendered).toContain(`Capsule ${state}`);
    }
  });

  it('calls loadMore via onEndReached, and shows "Loading more…" while nextCursor is not null', () => {
    mockState = { status: 'ready', items: [capsuleFixture()], nextCursor: 'cursor-1', nextPageError: false };
    const instance = renderScreen();
    expect(texts(instance)).toContain('Loading more…');

    const list = instance.root.findByType('FlatList' as never);
    act(() => {
      (list.props as { onEndReached: () => void }).onEndReached();
    });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows a footer retry control (not a full-screen error) when a next-page request fails, preserving existing rows', () => {
    mockState = {
      status: 'ready',
      items: [capsuleFixture({ title: 'Still here' })],
      nextCursor: 'cursor-1',
      nextPageError: true,
    };
    const instance = renderScreen();
    const rendered = texts(instance);
    expect(rendered).toContain('Still here');
    expect(rendered).toContain("We couldn't load more capsules.");

    const retryButtons = instance.root.findAllByType(Pressable);
    act(() => {
      retryButtons[retryButtons.length - 1]!.props.onPress();
    });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows an end-of-list footer once nextCursor is null, with no "load more" affordance', () => {
    mockState = { status: 'ready', items: [capsuleFixture()], nextCursor: null, nextPageError: false };
    const instance = renderScreen();
    expect(texts(instance)).toContain("That's everything.");
    expect(texts(instance)).not.toContain('Loading more…');
  });

  it('pressing a row for a non-draft capsule navigates to /(app)/capsule/<id>', () => {
    mockState = {
      status: 'ready',
      items: [capsuleFixture({ id: '99999999-9999-9999-9999-999999999999', state: 'sealed' })],
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    const rows = instance.root.findAllByType(Pressable);
    const row = rows[rows.length - 1]!; // the last Pressable is the capsule row; the first is the "New" button
    act(() => {
      row.props.onPress();
    });
    expect(push).toHaveBeenCalledWith('/(app)/capsule/99999999-9999-9999-9999-999999999999');
  });

  it('pressing a draft row navigates to Address (E1.4.1) instead of the read-only detail screen', () => {
    mockState = {
      status: 'ready',
      items: [capsuleFixture({ id: '88888888-8888-8888-8888-888888888888', state: 'draft' })],
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    const rows = instance.root.findAllByType(Pressable);
    const row = rows[rows.length - 1]!;
    act(() => {
      row.props.onPress();
    });
    expect(push).toHaveBeenCalledWith('/(app)/compose/88888888-8888-8888-8888-888888888888/address');
  });

  it('the "New" button navigates to the create-capsule entry route', () => {
    mockState = { status: 'ready', items: [], nextCursor: null, nextPageError: false };
    const instance = renderScreen();
    const newButton = instance.root.findByProps({ accessibilityLabel: 'New capsule' });
    act(() => {
      newButton.props.onPress();
    });
    expect(push).toHaveBeenCalledWith('/(app)/compose/new');
  });

  it('pads the header below the status bar using the real safe-area inset, so the "New" button is not swallowed by the system status bar for touch or TalkBack activation', () => {
    // Confirmed as a real on-device defect, not a theoretical one: without
    // this padding, the tabs layout renders with `headerShown: false` and
    // no safe-area wrapper of its own, so a tap on the real "New" button
    // landed under the system status bar and never reached the app —
    // the same class of defect E1.3.8/E1.3.10 already found and fixed for
    // the capsule-detail screen's back button.
    mockState = { status: 'ready', items: [], nextCursor: null, nextPageError: false };
    const instance = renderScreen();
    const header = instance.root.findByProps({ accessibilityLabel: 'New capsule' }).parent!;
    const style = [header.props.style].flat();
    const paddingTop = style.map((s) => s?.paddingTop).find((v) => v !== undefined);
    expect(paddingTop).toBe(40 + space[6]);
  });

  it('never imports the decrypt utility or any crypto primitive — the list endpoint carries no ciphertext to decrypt', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../../app/(app)/(tabs)/home.tsx'), 'utf-8');
    const importLines = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    expect(importLines).not.toMatch(/capsule-crypto/);
    expect(importLines).not.toMatch(/@tc\/crypto/);
    expect(importLines).not.toMatch(/master-key-context/);
  });
});
