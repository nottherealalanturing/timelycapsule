import type { CreateCapsuleRequest } from '@tc/contracts';
import { act } from 'react';
import { Pressable } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
}));

const replace = vi.fn();
// A stable object, not a fresh literal per call — matching the real
// expo-router hook's own stability. The screen's effect depends on
// `router` (see its own comment on why), so a mock that hands back a new
// reference every render would re-fire that effect (and re-POST) on every
// state change alone, which is a test-double artifact, not real behavior.
const router = { replace };
vi.mock('expo-router', () => ({ useRouter: () => router }));

const create = vi.fn();
vi.mock('../lib/api-client', () => ({
  capsulesApi: { create: (...args: unknown[]) => create(...args) },
}));

const NewCapsuleScreen = (await import('../../app/(app)/compose/new')).default;

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType('Text' as never).map((node) => node.props.children).flat();
}

function renderScreen(): TestRenderer.ReactTestRenderer {
  let instance!: TestRenderer.ReactTestRenderer;
  act(() => {
    instance = TestRenderer.create(<NewCapsuleScreen />);
  });
  return instance;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  replace.mockReset();
  create.mockReset();
});

describe('NewCapsuleScreen', () => {
  it('shows a loading state while the capsule is being created', () => {
    create.mockReturnValue(new Promise(() => {}));
    const instance = renderScreen();
    expect(texts(instance)).toContain('Starting a new capsule…');
  });

  it('creates exactly a bare personal-type draft — every other field arrives later, via Address', async () => {
    create.mockResolvedValue({ capsule: { id: '11111111-1111-1111-1111-111111111111' } });
    renderScreen();
    await flush();
    const input: CreateCapsuleRequest = create.mock.calls[0]![0];
    expect(input).toEqual({ type: 'personal' });
  });

  it('navigates to Address for the new draft via router.replace (not push, so back skips the transient screen)', async () => {
    create.mockResolvedValue({ capsule: { id: '99999999-9999-9999-9999-999999999999' } });
    renderScreen();
    await flush();
    expect(replace).toHaveBeenCalledWith('/(app)/compose/99999999-9999-9999-9999-999999999999/address');
  });

  it('shows an error state with retry on failure, without navigating', async () => {
    create.mockRejectedValue(new Error('network down'));
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain("We couldn't start a new capsule.");
    expect(replace).not.toHaveBeenCalled();
  });

  it('retry re-attempts creation and can succeed', async () => {
    create.mockRejectedValueOnce(new Error('network down'));
    const instance = renderScreen();
    await flush();
    expect(texts(instance)).toContain("We couldn't start a new capsule.");

    create.mockResolvedValueOnce({ capsule: { id: '22222222-2222-2222-2222-222222222222' } });
    const retryButton = instance.root.findByType(Pressable);
    await act(async () => {
      retryButton.props.onPress();
    });
    await flush();
    expect(replace).toHaveBeenCalledWith('/(app)/compose/22222222-2222-2222-2222-222222222222/address');
    expect(create).toHaveBeenCalledTimes(2);
  });
});
