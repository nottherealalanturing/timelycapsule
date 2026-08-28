import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Notification } from '@tc/contracts';
import { act } from 'react';
import { Pressable, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationsState } from '../lib/use-notifications';

/**
 * react-native's real package can't be parsed by Vitest's transform (it
 * ships Flow syntax), so — as elsewhere in this project — it's mocked.
 * `FlatList` needs a real (if minimal) implementation rather than a bare
 * tag-name string, matching `home.test.tsx`'s convention: this screen's
 * pagination behavior (onEndReached, rendering every row, the footer) is
 * exactly what these tests exercise, and a string mock would never call
 * `renderItem` at all.
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

let mockState: NotificationsState = { status: 'loading' };
const retry = vi.fn();
const loadMore = vi.fn();
vi.mock('../lib/use-notifications', () => ({
  useNotifications: () => ({ state: mockState, retry, loadMore }),
}));

const NotificationsTab = (await import('../../app/(app)/(tabs)/notifications')).default;

function notificationFixture(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    category: 'social',
    title: 'Ada opened your capsule',
    body: null,
    data: { capsuleId: '22222222-2222-2222-2222-222222222222' },
    readAt: null,
    createdAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  };
}

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

function renderScreen(): TestRenderer.ReactTestRenderer {
  let instance!: TestRenderer.ReactTestRenderer;
  act(() => {
    instance = TestRenderer.create(<NotificationsTab />);
  });
  return instance;
}

beforeEach(() => {
  push.mockReset();
  retry.mockReset();
  loadMore.mockReset();
  mockState = { status: 'loading' };
});

describe('NotificationsTab', () => {
  it('renders LoadingState while loading', () => {
    mockState = { status: 'loading' };
    const instance = renderScreen();
    expect(texts(instance)).toContain('Loading your notifications…');
  });

  it('renders EmptyState for a successful empty response', () => {
    mockState = { status: 'ready', items: [], nextCursor: null, nextPageError: false };
    const instance = renderScreen();
    expect(texts(instance)).toContain('Nothing yet.');
  });

  it('renders ErrorState on initial API/network failure, and retry calls the hook\'s retry', () => {
    mockState = { status: 'error' };
    const instance = renderScreen();
    expect(texts(instance)).toContain("We couldn't load your notifications.");

    const retryButton = instance.root.findByType(Pressable);
    act(() => {
      retryButton.props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders all four known event-type shapes correctly', () => {
    mockState = {
      status: 'ready',
      items: [
        notificationFixture({ id: 'a', category: 'social', title: 'Ada opened your capsule', body: null }),
        notificationFixture({ id: 'b', category: 'social', title: 'Ada replied', body: null }),
        notificationFixture({ id: 'c', category: 'delivery', title: 'Enclosures due to be released', body: null }),
        notificationFixture({ id: 'd', category: 'delivery', title: "We couldn't reach a recipient", body: 'Emails to a@example.com keep bouncing.' }),
      ],
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    const rendered = texts(instance);
    expect(rendered).toContain('Ada opened your capsule');
    expect(rendered).toContain('Ada replied');
    expect(rendered).toContain('Enclosures due to be released');
    expect(rendered).toContain("We couldn't reach a recipient");
    expect(rendered).toContain('Emails to a@example.com keep bouncing.');
  });

  it('renders an unknown/future category without crashing', () => {
    mockState = {
      status: 'ready',
      items: [notificationFixture({ category: 'product', title: 'A future notification', body: 'Some copy.' })],
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    expect(texts(instance)).toContain('A future notification');
  });

  it('calls loadMore via onEndReached, and shows "Loading more…" while nextCursor is not null', () => {
    mockState = { status: 'ready', items: [notificationFixture()], nextCursor: 'cursor-1', nextPageError: false };
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
      items: [notificationFixture({ title: 'Still here' })],
      nextCursor: 'cursor-1',
      nextPageError: true,
    };
    const instance = renderScreen();
    const rendered = texts(instance);
    expect(rendered).toContain('Still here');
    expect(rendered).toContain("We couldn't load more notifications.");

    const retryButtons = instance.root.findAllByType(Pressable);
    act(() => {
      retryButtons[retryButtons.length - 1]!.props.onPress();
    });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows an end-of-list footer once nextCursor is null, with no "load more" affordance', () => {
    mockState = { status: 'ready', items: [notificationFixture()], nextCursor: null, nextPageError: false };
    const instance = renderScreen();
    expect(texts(instance)).toContain("That's everything.");
    expect(texts(instance)).not.toContain('Loading more…');
  });

  it('pressing a notification with a valid capsuleId navigates to /(app)/capsule/<id>', () => {
    mockState = {
      status: 'ready',
      items: [notificationFixture({ data: { capsuleId: '99999999-9999-9999-9999-999999999999' } })],
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    const row = instance.root.findByType(Pressable);
    act(() => {
      row.props.onPress();
    });
    expect(push).toHaveBeenCalledWith('/(app)/capsule/99999999-9999-9999-9999-999999999999');
  });

  it('a notification without a valid capsuleId is non-navigable and never calls push', () => {
    mockState = {
      status: 'ready',
      items: [notificationFixture({ data: null })],
      nextCursor: null,
      nextPageError: false,
    };
    const instance = renderScreen();
    const row = instance.root.findByType(Pressable);
    expect(row.props.onPress).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
  });

  it('never imports the decrypt utility, any crypto primitive, or persistent-storage APIs', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../../app/(app)/(tabs)/notifications.tsx'), 'utf-8');
    const importLines = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    expect(importLines).not.toMatch(/capsule-crypto|@tc\/crypto|master-key-context|expo-secure-store|AsyncStorage|token-store/);
  });
});
