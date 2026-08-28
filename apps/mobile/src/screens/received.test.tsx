import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReceivedCapsule } from '@tc/contracts';
import { Pressable, Text } from 'react-native';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceivedCapsulesState } from '../lib/use-received-capsules';

/**
 * react-native's real package can't be parsed by Vitest's transform (it
 * ships Flow syntax), so — as elsewhere in this project — it's mocked.
 * Host components are mocked as their own tag name string, which is all
 * react-test-renderer needs to build and query a tree; `CapsuleRow`/
 * `EmptyState`/`ErrorState`/`LoadingState` are the real implementations
 * (not mocked) and pick up this same mock transitively, so this exercises
 * the real integration between the screen and those components.
 */
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
}));

const push = vi.fn();
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }));

let mockState: ReceivedCapsulesState = { status: 'loading' };
const retry = vi.fn();
vi.mock('../lib/use-received-capsules', () => ({
  useReceivedCapsules: () => ({ state: mockState, retry }),
}));

// This test deliberately lives outside apps/mobile/app/: Expo Router's
// Metro integration bundles every file under app/ into the native route
// graph (even non-route files matched by its require.context), and this
// file's node:fs/node:path/node:url imports (for the static import-scan
// test below) broke the real iOS/Android bundle when it lived next to
// received.tsx. Discovered during this ticket's own manual device
// verification — see plan/PROGRESS.md's E1.3.6 entry.
const ReceivedTab = (await import('../../app/(app)/(tabs)/received')).default;

function receivedItem(overrides: Partial<ReceivedCapsule> = {}): ReceivedCapsule {
  return {
    recipientId: '22222222-2222-2222-2222-222222222222',
    capsuleId: '33333333-3333-3333-3333-333333333333',
    publicId: 'pub-2',
    section: 'upcoming',
    senderName: 'Ada Lovelace',
    senderEmail: 'ada@example.com',
    title: 'Happy birthday',
    cover: null,
    teaser: 'Open when the day comes',
    unlockAt: '2026-12-25T00:00:00.000Z',
    sealedAt: '2026-01-01T00:00:00.000Z',
    firstOpenedAt: null,
    ...overrides,
  };
}

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children);
}

function renderScreen(): TestRenderer.ReactTestRenderer {
  let instance!: TestRenderer.ReactTestRenderer;
  act(() => {
    instance = TestRenderer.create(<ReceivedTab />);
  });
  return instance;
}

beforeEach(() => {
  push.mockReset();
  retry.mockReset();
  mockState = { status: 'loading' };
});

describe('ReceivedTab', () => {
  it('renders LoadingState while loading', () => {
    mockState = { status: 'loading' };
    const instance = renderScreen();
    expect(texts(instance)).toContain("Loading what's been sent to you…");
  });

  it('renders EmptyState for a successful empty response', () => {
    mockState = { status: 'ready', items: [] };
    const instance = renderScreen();
    expect(texts(instance)).toContain('Nothing has been sent to you yet.');
  });

  it('renders ErrorState on API/network failure, and retry calls the hook\'s retry', () => {
    mockState = { status: 'error' };
    const instance = renderScreen();
    expect(texts(instance)).toContain("We couldn't load what's been sent to you.");

    const retryButton = instance.root.findByType(Pressable);
    act(() => {
      retryButton.props.onPress();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders a populated response through the normalized model, grouped by section in waiting/upcoming/opened order', () => {
    mockState = {
      status: 'ready',
      items: [
        receivedItem({ recipientId: 'r-opened', section: 'opened', title: 'Third' }),
        receivedItem({ recipientId: 'r-waiting', section: 'waiting', title: 'First' }),
        receivedItem({ recipientId: 'r-upcoming', section: 'upcoming', title: 'Second' }),
      ],
    };
    const instance = renderScreen();
    const rendered = texts(instance);

    expect(rendered).toContain('Ready to open');
    expect(rendered).toContain('Still sealed');
    expect(rendered).toContain('Opened');
    expect(rendered).toContain('First');
    expect(rendered).toContain('Second');
    expect(rendered).toContain('Third');

    // Section headings appear in waiting, upcoming, opened order.
    const headingIndices = ['Ready to open', 'Still sealed', 'Opened'].map((h) => rendered.indexOf(h));
    expect(headingIndices).toEqual([...headingIndices].sort((a, b) => a - b));
  });

  it('omits a section heading entirely when that section has no items', () => {
    mockState = { status: 'ready', items: [receivedItem({ section: 'waiting' })] };
    const instance = renderScreen();
    const rendered = texts(instance);
    expect(rendered).toContain('Ready to open');
    expect(rendered).not.toContain('Still sealed');
    expect(rendered).not.toContain('Opened');
  });

  it('renders the fallback title for a null title/teaser received capsule', () => {
    mockState = { status: 'ready', items: [receivedItem({ title: null, teaser: null })] };
    const instance = renderScreen();
    expect(texts(instance)).toContain('Untitled capsule');
  });

  it('pressing a row navigates using the mapper-normalized id (capsuleId, not recipientId)', () => {
    mockState = {
      status: 'ready',
      items: [receivedItem({ capsuleId: '99999999-9999-9999-9999-999999999999' })],
    };
    const instance = renderScreen();
    const row = instance.root.findByType(Pressable);
    act(() => {
      row.props.onPress();
    });
    expect(push).toHaveBeenCalledWith('/(app)/capsule/99999999-9999-9999-9999-999999999999');
  });

  it('exposes each section heading with accessibilityRole="header" so a screen reader can navigate by heading', () => {
    mockState = { status: 'ready', items: [receivedItem({ section: 'waiting' })] };
    const instance = renderScreen();
    const heading = instance.root.findAllByType(Text).find((node) => node.props.children === 'Ready to open');
    expect(heading?.props.accessibilityRole).toBe('header');
  });

  it('never imports the decrypt utility or any crypto primitive in the screen itself', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../../app/(app)/(tabs)/received.tsx'), 'utf-8');
    const importLines = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    expect(importLines).not.toMatch(/capsule-crypto/);
    expect(importLines).not.toMatch(/@tc\/crypto/);
  });
});
