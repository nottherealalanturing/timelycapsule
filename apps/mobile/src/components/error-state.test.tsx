import { Pressable, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from './error-state';

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

describe('ErrorState', () => {
  it('renders only the message when no retry handler is given', () => {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<ErrorState message="Something went wrong." />);
    });
    expect(texts(instance)).toEqual(['Something went wrong.']);
    expect(instance.root.findAllByType(Pressable)).toHaveLength(0);
  });

  it('renders a retry control when onRetry is given, and calls it on press', () => {
    const onRetry = vi.fn();
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<ErrorState message="Something went wrong." onRetry={onRetry} />);
    });
    expect(texts(instance)).toEqual(['Something went wrong.', 'Try again']);

    const retry = instance.root.findByType(Pressable);
    act(() => {
      retry.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('never receives a raw error object — message is always a plain string prop', () => {
    // Type-level guarantee: ErrorState's `message` prop is typed `string`,
    // not `Error | ApiClientError`, so a caller cannot pass a raw error
    // object without a type error. This test documents that contract.
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<ErrorState message="We couldn't reach the server." />);
    });
    expect(typeof instance.root.findByType(ErrorState).props.message).toBe('string');
  });
});
