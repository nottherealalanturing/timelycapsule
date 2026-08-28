import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { LoadingState } from './loading-state';

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

describe('LoadingState', () => {
  it('renders the default message', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<LoadingState />);
    });
    expect(texts(instance)).toEqual(['Loading…']);
  });

  it('renders a custom message when provided', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<LoadingState message="Unwrapping your capsule…" />);
    });
    expect(texts(instance)).toEqual(['Unwrapping your capsule…']);
  });
});
