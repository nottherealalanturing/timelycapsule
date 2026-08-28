import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pressable, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationRowItem } from '../lib/notification-model';
import { NotificationRow } from './notification-row';

/**
 * react-native's real package can't be parsed by Vitest's transform (it
 * ships Flow syntax), so — as elsewhere in this project — it's mocked.
 * Host components are mocked as their own tag name string, which is all
 * react-test-renderer needs to build and query a tree.
 */
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
}));

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

const base: NotificationRowItem = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Ada opened your capsule',
  body: null,
  dateLabel: 'Aug 28, 2026',
  unread: true,
  capsuleId: '22222222-2222-2222-2222-222222222222',
};

describe('NotificationRow', () => {
  it('renders the title and date', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<NotificationRow item={base} />);
    });
    const rendered = texts(instance);
    expect(rendered).toContain('Ada opened your capsule');
    expect(rendered).toContain('Aug 28, 2026');
  });

  it('renders the body when present, and omits it when null', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<NotificationRow item={{ ...base, body: "Emails to a@example.com keep bouncing." }} />);
    });
    expect(texts(instance)).toContain("Emails to a@example.com keep bouncing.");

    act(() => {
      instance = TestRenderer.create(<NotificationRow item={{ ...base, body: null }} />);
    });
    expect(texts(instance)).not.toContain("Emails to a@example.com keep bouncing.");
  });

  it('calls onPress with capsuleId when the row has one and is pressed', () => {
    const onPress = vi.fn();
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<NotificationRow item={base} onPress={onPress} />);
    });
    const pressable = instance.root.findByType(Pressable);
    act(() => {
      pressable.props.onPress();
    });
    expect(onPress).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });

  it('is not pressable (onPress is undefined) when capsuleId is null, even if onPress is supplied', () => {
    const onPress = vi.fn();
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<NotificationRow item={{ ...base, capsuleId: null }} onPress={onPress} />);
    });
    const pressable = instance.root.findByType(Pressable);
    expect(pressable.props.onPress).toBeUndefined();
  });

  it('marks a navigable row accessibilityRole="button" and a non-navigable one "text"', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<NotificationRow item={base} />);
    });
    expect(instance.root.findByType(Pressable).props.accessibilityRole).toBe('button');

    act(() => {
      instance = TestRenderer.create(<NotificationRow item={{ ...base, capsuleId: null }} />);
    });
    expect(instance.root.findByType(Pressable).props.accessibilityRole).toBe('text');
  });

  it('renders without crashing for a read (non-unread) item', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<NotificationRow item={{ ...base, unread: false }} />);
    });
    expect(texts(instance)).toContain('Ada opened your capsule');
  });

  it('never imports SecureStore, AsyncStorage, the token store, or any crypto primitive', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, 'notification-row.tsx'), 'utf-8');
    const importLines = source
      .split('\n')
      .filter((line) => line.trim().startsWith('import '))
      .join('\n');
    expect(importLines).not.toMatch(/expo-secure-store|AsyncStorage|token-store|capsule-crypto|@tc\/crypto|api-client/);
  });
});
