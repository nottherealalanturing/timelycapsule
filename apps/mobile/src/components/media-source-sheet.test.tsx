import { act } from 'react';
import { Modal, Pressable, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Modal: 'Modal',
  StyleSheet: { create: (styles: unknown) => styles },
}));

const { MediaSourceSheet } = await import('./media-source-sheet');

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

describe('MediaSourceSheet', () => {
  let onSelect: ReturnType<typeof vi.fn>;
  let onDismiss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
    onDismiss = vi.fn();
  });

  function render(visible = true) {
    let instance!: TestRenderer.ReactTestRenderer;
    act(() => {
      instance = TestRenderer.create(<MediaSourceSheet visible={visible} onSelect={onSelect} onDismiss={onDismiss} />);
    });
    return instance;
  }

  it('renders the modal as visible/hidden exactly matching the `visible` prop', () => {
    const shown = render(true);
    expect(shown.root.findByType(Modal).props.visible).toBe(true);

    const hidden = render(false);
    expect(hidden.root.findByType(Modal).props.visible).toBe(false);
  });

  it('renders exactly the four currently-supported sources, in deterministic order', () => {
    const instance = render();
    const items = instance.root.findAllByProps({ accessibilityRole: 'menuitem' });
    expect(items.map((n) => n.props.accessibilityLabel)).toEqual(['Camera', 'Photo & Video Library', 'File', 'Voice']);
  });

  it('renders a "Voice" row now that the recorder exists (E1.4.6)', () => {
    const instance = render();
    expect(texts(instance).join(' ')).toMatch(/voice/i);
  });

  it('shows each option\'s descriptive detail line, matching its label', () => {
    const instance = render();
    const joined = texts(instance).join(' ');
    expect(joined).toContain('Take a new photo or video');
    expect(joined).toContain('Choose an existing one');
    expect(joined).toContain('Choose a document');
    expect(joined).toContain('Record a voice note');
  });

  it('calls onSelect with the correct source when a row is tapped', () => {
    const instance = render();
    const camera = instance.root.findAllByProps({ accessibilityRole: 'menuitem' }).find((n) => n.props.accessibilityLabel === 'Camera')!;
    act(() => {
      camera.props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith('camera');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect with "voice" when the Voice row is tapped', () => {
    const instance = render();
    const voice = instance.root.findAllByProps({ accessibilityRole: 'menuitem' }).find((n) => n.props.accessibilityLabel === 'Voice')!;
    act(() => {
      voice.props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith('voice');
  });

  it('calls onDismiss when Cancel is pressed', () => {
    const instance = render();
    const cancel = instance.root.findAllByType(Pressable).find((n) => n.props.accessibilityLabel === 'Cancel')!;
    act(() => {
      cancel.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onDismiss when the backdrop is pressed', () => {
    const instance = render();
    const backdrop = instance.root.findAllByType(Pressable).find((n) => n.props.accessibilityLabel === 'Dismiss')!;
    act(() => {
      backdrop.props.onPress();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss on the hardware back gesture (Modal onRequestClose)', () => {
    const instance = render();
    act(() => {
      instance.root.findByType(Modal).props.onRequestClose();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('every option row and the cancel row carry an accessible role and label', () => {
    const instance = render();
    const items = instance.root.findAllByProps({ accessibilityRole: 'menuitem' });
    expect(items).toHaveLength(4);
    for (const item of items) expect(typeof item.props.accessibilityLabel).toBe('string');

    const menu = instance.root.findByProps({ accessibilityRole: 'menu' });
    expect(menu.props.accessibilityLabel).toBe('Enclose something menu');
  });
});
