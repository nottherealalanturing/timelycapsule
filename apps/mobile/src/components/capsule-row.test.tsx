import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pressable, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { fromCapsuleListItem, fromReceivedCapsule } from '../lib/capsule-row-model';
import { CapsuleRow } from './capsule-row';

/**
 * react-native's real package can't be parsed by Vitest's transform (it
 * ships Flow syntax), so — as elsewhere in this project — it's mocked.
 * Host components are mocked as their own tag name string, which is all
 * react-test-renderer needs to build and query a tree; no native runtime
 * involved.
 */
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
}));

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children);
}

const ownedRow = fromCapsuleListItem({
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
  unlockAt: '2026-12-25T00:00:00.000Z',
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
});

const receivedRow = fromReceivedCapsule({
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
});

describe('CapsuleRow', () => {
  it('renders an owned row (through the normalized model) with title, teaser, and status', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<CapsuleRow item={ownedRow} />);
    });
    const rendered = texts(instance);
    expect(rendered).toContain('A letter to future me');
    expect(rendered).toContain('Some things I want to remember');
    expect(rendered).toContain('Sealed');
    expect(rendered).not.toContain(undefined);
  });

  it('renders a received row (through the normalized model) with a sender subtitle', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<CapsuleRow item={receivedRow} />);
    });
    const rendered = texts(instance);
    expect(rendered).toContain('Happy birthday');
    expect(rendered).toContain('From Ada Lovelace');
    expect(rendered).toContain('Still sealed');
  });

  it('renders the fallback title and omits optional lines for missing/null fields', () => {
    const bare = {
      id: 'x',
      title: null,
      teaser: null,
      subtitle: null,
      statusLabel: 'Draft',
      statusColor: '#000',
      dateLabel: null,
    };
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<CapsuleRow item={bare} />);
    });
    const rendered = texts(instance);
    expect(rendered).toContain('Untitled capsule');
    expect(rendered).not.toContain(null);
  });

  it('calls onPress with the item id when the row is pressed', () => {
    const onPress = vi.fn();
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<CapsuleRow item={ownedRow} onPress={onPress} />);
    });
    const pressable = instance.root.findByType(Pressable);
    act(() => {
      pressable.props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith(ownedRow.id);
  });

  it('is a no-op press when onPress is not provided', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<CapsuleRow item={ownedRow} />);
    });
    const pressable = instance.root.findByType(Pressable);
    expect(pressable.props.onPress).toBeUndefined();
  });

  it('exposes one composed accessibilityLabel combining title, subtitle, teaser, state, and date', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<CapsuleRow item={receivedRow} />);
    });
    const label = instance.root.findByType(Pressable).props.accessibilityLabel as string;
    const date = new Date('2026-12-25T00:00:00.000Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    expect(label).toBe(`Happy birthday. From Ada Lovelace. Open when the day comes. Still sealed. ${date}`);
  });

  it('composes a label without stray separators when subtitle/teaser/date are absent', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(
        <CapsuleRow item={{ id: 'x', title: 'A title', teaser: null, subtitle: null, statusLabel: 'Draft', statusColor: '#000', dateLabel: null }} />,
      );
    });
    expect(instance.root.findByType(Pressable).props.accessibilityLabel).toBe('A title. Draft');
  });

  it('marks a pressable row accessibilityRole="button" and a non-interactive one "text"', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<CapsuleRow item={ownedRow} onPress={vi.fn()} />);
    });
    expect(instance.root.findByType(Pressable).props.accessibilityRole).toBe('button');

    act(() => {
      instance = TestRenderer.create(<CapsuleRow item={ownedRow} />);
    });
    expect(instance.root.findByType(Pressable).props.accessibilityRole).toBe('text');
  });

  it('never imports the decrypt utility or any crypto primitive — the normalized model cannot carry ciphertext', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, 'capsule-row.tsx'), 'utf-8');
    const importLines = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    expect(importLines).not.toMatch(/capsule-crypto/);
    expect(importLines).not.toMatch(/@tc\/crypto/);
  });
});
