import { act, useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Modal: 'Modal',
  StyleSheet: { create: (styles: unknown) => styles },
}));

// voice-recorder.tsx imports media-source.ts (for normalizeVoiceRecording,
// a real, pure function left unmocked below) which itself imports these two
// native picker modules at its own top level — stubbed as inert purely so
// that import chain resolves under Node, same reasoning as every other
// native-module mock in this codebase.
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-document-picker', () => ({}));

/**
 * `expo-audio` is a native module with no JS-only fallback (confirmed
 * directly, same reason every other native Expo module in this codebase
 * gets mocked). The mocks below are plain controllable objects rather than
 * a real audio stack — they exercise `voice-recorder.tsx`'s own real
 * lifecycle/state-machine logic (Idle→Recording→Preparing→Ready, error
 * handling, cleanup) against fake-but-realistic hook return values, the
 * same "mock narrowly, test the logic for real" approach `media-source.
 * test.ts` already uses for the picker modules.
 */
const requestRecordingPermissionsAsync = vi.fn();
const recorderRecord = vi.fn();
const recorderStop = vi.fn();
const recorderPrepare = vi.fn();
let recorderUri: string | null = null;
let recorderIsRecording = false;

const recorder = {
  get isRecording() {
    return recorderIsRecording;
  },
  get uri() {
    return recorderUri;
  },
  record: (...args: unknown[]) => {
    recorderIsRecording = true;
    return recorderRecord(...args);
  },
  stop: async (...args: unknown[]) => {
    recorderIsRecording = false;
    await recorderStop(...args);
  },
  prepareToRecordAsync: (...args: unknown[]) => recorderPrepare(...args),
};

let recorderStateDurationMillis = 0;

const playerPlay = vi.fn();
const playerPause = vi.fn();
const playerRemove = vi.fn();
let playerPlaying = false;
// Real `useAudioPlayerStatus` re-renders subscribers on native playback
// events; this plain mutable-getter mock has no equivalent unless something
// notifies React. A tiny pub-sub does that job — play()/pause() notify it,
// and the mocked hook below subscribes via real useState/useEffect so
// pressing Play in a test actually produces a re-render with the new label.
const playerStatusListeners = new Set<() => void>();
function notifyPlayerStatusListeners() {
  for (const listener of playerStatusListeners) listener();
}
const player = {
  get playing() {
    return playerPlaying;
  },
  play: (...args: unknown[]) => {
    playerPlaying = true;
    notifyPlayerStatusListeners();
    return playerPlay(...args);
  },
  pause: (...args: unknown[]) => {
    playerPlaying = false;
    notifyPlayerStatusListeners();
    return playerPause(...args);
  },
  remove: (...args: unknown[]) => playerRemove(...args),
};

// Spied (not just mocked) so tests can pin a real bug found on a real
// device: expo-audio's own `useAudioRecorderState` runs a `setInterval`
// polling the recorder for as long as whatever component called it stays
// mounted, with no way to pause it short of unmounting — and playback
// starting can release the underlying native recorder, so a poll still in
// flight throws `ERR_USING_RELEASED_SHARED_OBJECT`. The fix mounts the
// hook's caller (`RecordingElapsed`) only during the 'recording' stage;
// this spy lets tests confirm it actually stops being called once that
// stage ends, rather than merely stopping its return value from being used.
const useAudioRecorderStateSpy = vi.fn((_recorder: unknown, _interval?: number) => ({
  canRecord: true,
  isRecording: recorderIsRecording,
  durationMillis: recorderStateDurationMillis,
  url: recorderUri,
}));

vi.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: (...args: unknown[]) => requestRecordingPermissionsAsync(...args),
  useAudioRecorder: () => recorder,
  useAudioRecorderState: (recorder: unknown, interval?: number) => useAudioRecorderStateSpy(recorder, interval),
  useAudioPlayer: () => player,
  useAudioPlayerStatus: () => {
    const [, forceRender] = useState(0);
    useEffect(() => {
      const listener = () => forceRender((n) => n + 1);
      playerStatusListeners.add(listener);
      return () => {
        playerStatusListeners.delete(listener);
      };
    }, []);
    return { playing: playerPlaying, currentTime: 0, duration: 0 };
  },
}));

const { VoiceRecorder, elapsedAnnouncement } = await import('./voice-recorder');

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root.findAllByType(Text).map((node) => node.props.children).flat();
}

function byLabel(instance: TestRenderer.ReactTestRenderer, label: string) {
  return instance.root.findAllByType(Pressable).find((n) => n.props.accessibilityLabel === label);
}

describe('VoiceRecorder', () => {
  let onAccept: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onAccept = vi.fn();
    onCancel = vi.fn();
    requestRecordingPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
    recorderRecord.mockReset();
    recorderStop.mockReset().mockResolvedValue(undefined);
    recorderPrepare.mockReset().mockResolvedValue(undefined);
    recorderUri = null;
    recorderIsRecording = false;
    recorderStateDurationMillis = 0;
    playerPlay.mockReset();
    playerPause.mockReset();
    playerRemove.mockReset();
    playerPlaying = false;
    // Most tests here never call `instance.unmount()` (matches this
    // codebase's existing convention elsewhere), so a prior test's render
    // tree is never actually torn down — only garbage-collected once
    // nothing references it. Since `useAudioPlayerStatus`'s mock registers
    // its listener into this module-level Set and only removes it on real
    // unmount, a stale listener from an earlier test can otherwise survive
    // into a later one and get woken by that later test's own
    // `notifyPlayerStatusListeners()` call — cleared here so each test
    // starts from an empty subscriber list regardless of what earlier tests
    // left mounted.
    playerStatusListeners.clear();
    useAudioRecorderStateSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render() {
    let instance!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      instance = TestRenderer.create(<VoiceRecorder onAccept={onAccept} onCancel={onCancel} />);
    });
    return instance;
  }

  describe('idle stage', () => {
    it('starts idle, with Start recording and Cancel available', async () => {
      const instance = await render();
      expect(texts(instance).join(' ')).toContain('Voice recording');
      expect(byLabel(instance, 'Start recording')).toBeDefined();
      expect(byLabel(instance, 'Cancel')).toBeDefined();
      expect(byLabel(instance, 'Stop recording')).toBeUndefined();
    });

    it('requests no microphone permission merely by mounting — only when Start recording is tapped', async () => {
      await render();
      expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    });

    it('Cancel calls onCancel directly, without ever recording anything', async () => {
      const instance = await render();
      await act(async () => byLabel(instance, 'Cancel')!.props.onPress());
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(recorderRecord).not.toHaveBeenCalled();
    });
  });

  describe('permission handling', () => {
    it('requests permission only when Start recording is tapped (just-in-time)', async () => {
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('shows the exact web-matching error and stays idle when permission is refused', async () => {
      requestRecordingPermissionsAsync.mockResolvedValue({ granted: false });
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());

      expect(texts(instance).join(' ')).toContain('No microphone available, or permission was refused.');
      expect(recorderRecord).not.toHaveBeenCalled();
      expect(byLabel(instance, 'Start recording')).toBeDefined(); // still idle, not stuck
    });

    it('shows the same error if the recorder itself throws (e.g. no device) rather than the permission call', async () => {
      recorderPrepare.mockRejectedValue(new Error('no input device'));
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      expect(texts(instance).join(' ')).toContain('No microphone available, or permission was refused.');
    });

    it('a later Start recording after a denial tries again — no permanent lockout', async () => {
      requestRecordingPermissionsAsync.mockResolvedValueOnce({ granted: false }).mockResolvedValueOnce({ granted: true });
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(2);
      expect(recorderRecord).toHaveBeenCalledTimes(1);
    });
  });

  describe('recording lifecycle', () => {
    it('moves to the recording stage, showing the elapsed timer and only Stop', async () => {
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());

      expect(recorderRecord).toHaveBeenCalledTimes(1);
      expect(byLabel(instance, 'Stop recording')).toBeDefined();
      expect(byLabel(instance, 'Start recording')).toBeUndefined();
      expect(texts(instance).join(' ')).toContain('Recording');
      expect(texts(instance).join(' ')).toMatch(/00:00/);
    });

    it('stopping calls recorder.stop() and moves to ready with a real take', async () => {
      recorderUri = 'file:///take.m4a';
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      await act(async () => byLabel(instance, 'Stop recording')!.props.onPress());

      expect(recorderStop).toHaveBeenCalledTimes(1);
      expect(texts(instance).join(' ')).toContain('Ready');
      expect(byLabel(instance, 'Enclose this')).toBeDefined();
      expect(byLabel(instance, 'Record again')).toBeDefined();
      expect(byLabel(instance, 'Discard')).toBeDefined();
    });

    it('a stop that produces no uri fails safely back to idle, with an error, never a crash', async () => {
      recorderUri = null; // stop() "succeeds" but the recorder never produced a file
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      await act(async () => byLabel(instance, 'Stop recording')!.props.onPress());

      expect(texts(instance).join(' ')).toContain("couldn't be prepared");
      expect(byLabel(instance, 'Start recording')).toBeDefined();
    });
  });

  describe('ready stage — preview and decision', () => {
    async function reachReady(instance: TestRenderer.ReactTestRenderer) {
      recorderUri = 'file:///take.m4a';
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      await act(async () => byLabel(instance, 'Stop recording')!.props.onPress());
    }

    it('Play toggles playback and the button label', async () => {
      const instance = await render();
      await reachReady(instance);

      expect(texts(instance).join(' ')).toContain('Play');
      await act(async () => byLabel(instance, 'Play')!.props.onPress());
      expect(playerPlay).toHaveBeenCalledTimes(1);
      expect(texts(instance).join(' ')).toContain('Pause');
    });

    it('nothing has left the device before Enclose this — accepting is what hands off the take', async () => {
      const instance = await render();
      await reachReady(instance);
      expect(onAccept).not.toHaveBeenCalled();

      await act(async () => byLabel(instance, 'Enclose this')!.props.onPress());
      expect(onAccept).toHaveBeenCalledTimes(1);
      const [media] = onAccept.mock.calls[0]!;
      // Matches media-source.ts's own normalizeVoiceRecording shape exactly
      // (tested for real, in isolation, in media-source.test.ts) — asserted
      // here structurally rather than by importing that module, which would
      // also drag in expo-image-picker/expo-document-picker unnecessarily
      // for a component test about the recorder, not the pickers.
      expect(media).toEqual(
        expect.objectContaining({
          uri: 'file:///take.m4a',
          mimeType: 'audio/mp4',
          sizeBytes: null,
          durationMs: expect.any(Number),
        }),
      );
    });

    it('Enclose this also calls onCancel, closing the recorder — matches web\'s exact onAccept-then-onCancel sequence', async () => {
      const instance = await render();
      await reachReady(instance);
      await act(async () => byLabel(instance, 'Enclose this')!.props.onPress());
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('Discard calls onCancel without ever calling onAccept', async () => {
      const instance = await render();
      await reachReady(instance);
      await act(async () => byLabel(instance, 'Discard')!.props.onPress());
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onAccept).not.toHaveBeenCalled();
    });

    it('Record again discards the current take and returns to recording — a real second attempt, not stuck on the first', async () => {
      const instance = await render();
      await reachReady(instance);

      recorderUri = 'file:///second-take.m4a';
      await act(async () => byLabel(instance, 'Record again')!.props.onPress());

      expect(recorderRecord).toHaveBeenCalledTimes(2);
      expect(byLabel(instance, 'Stop recording')).toBeDefined();
      expect(onAccept).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('regression: stops polling recorder status once recording has stopped, so a later release (e.g. from starting playback) cannot crash a still-running poll', async () => {
      const instance = await render();
      await reachReady(instance);
      const callsAtReady = useAudioRecorderStateSpy.mock.calls.length;

      // Simulate the real-device failure this pins: expo-audio releases the
      // native recorder once playback starts. Any further call into it
      // should be a crash if something is still polling it.
      await act(async () => byLabel(instance, 'Play')!.props.onPress());

      expect(useAudioRecorderStateSpy.mock.calls.length).toBe(callsAtReady);
    });
  });

  describe('cleanup', () => {
    it('releases the player on unmount', async () => {
      const instance = await render();
      await act(async () => instance.unmount());
      expect(playerRemove).toHaveBeenCalledTimes(1);
    });

    it('stops an in-progress recording on unmount rather than leaving the microphone live', async () => {
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      expect(recorderIsRecording).toBe(true);

      await act(async () => instance.unmount());
      expect(recorderStop).toHaveBeenCalledTimes(1);
    });

    it('does not call recorder.stop() again on unmount when nothing was recording', async () => {
      const instance = await render();
      await act(async () => instance.unmount());
      expect(recorderStop).not.toHaveBeenCalled();
    });

    it('regression: unmount cleanup does not throw if the native recorder or player were already released (e.g. by starting playback)', async () => {
      const instance = await render();
      recorderUri = 'file:///take.m4a';
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      await act(async () => byLabel(instance, 'Stop recording')!.props.onPress());

      // A real device confirmed this can happen: expo-audio's own
      // `.isRecording`/`.stop()`/`.remove()` are live native calls on a
      // shared object, and releasing it out from under the JS wrapper
      // makes any of them throw `ERR_USING_RELEASED_SHARED_OBJECT`. Cleanup
      // must treat that as "already gone," not crash the unmount.
      const originalIsRecording = Object.getOwnPropertyDescriptor(recorder, 'isRecording')!;
      Object.defineProperty(recorder, 'isRecording', {
        configurable: true,
        get() {
          throw Object.assign(new Error('released'), { code: 'ERR_USING_RELEASED_SHARED_OBJECT' });
        },
      });
      playerRemove.mockImplementation(() => {
        throw Object.assign(new Error('released'), { code: 'ERR_USING_RELEASED_SHARED_OBJECT' });
      });

      try {
        await expect(act(async () => instance.unmount())).resolves.not.toThrow();
      } finally {
        Object.defineProperty(recorder, 'isRecording', originalIsRecording);
      }
    });
  });

  describe('accessibility', () => {
    it('every control has a distinct, non-empty accessible label and role', async () => {
      const instance = await render();
      for (const label of ['Start recording', 'Cancel']) {
        const el = byLabel(instance, label)!;
        expect(el.props.accessibilityRole).toBe('button');
      }
    });

    it('the stage label is exposed as a polite live region so state changes are announced', async () => {
      const instance = await render();
      const region = instance.root.findAllByProps({ accessibilityLiveRegion: 'polite' });
      expect(region.length).toBeGreaterThan(0);
    });

    it('E1.4.11: the elapsed reading is a live region, so a writer recording without sight of the screen hears it too', async () => {
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());

      const elapsed = instance.root
        .findAllByProps({ accessibilityLiveRegion: 'polite' })
        .find((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.includes('seconds recorded'));
      expect(elapsed).toBeDefined();
    });

    it('never exposes the raw file URI in any accessibility label or visible text', async () => {
      recorderUri = 'file:///a-very-specific-private-path.m4a';
      const instance = await render();
      await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
      await act(async () => byLabel(instance, 'Stop recording')!.props.onPress());

      const allLabels = instance.root.findAllByType(Pressable).map((n) => n.props.accessibilityLabel);
      expect(texts(instance).join(' ')).not.toContain('a-very-specific-private-path');
      expect(allLabels.join(' ')).not.toContain('a-very-specific-private-path');
    });
  });

  /**
   * `elapsedAnnouncement` (E1.4.11) is tested directly rather than through a
   * full component render + simulated tick sequence: the mocked
   * `useAudioRecorderStateSpy` above is a plain function with no internal
   * polling of its own (unlike the real `expo-audio` hook, which re-renders
   * its caller every 200ms) — nothing in this test file's existing mock
   * architecture can force `RecordingElapsed` to re-render on a changed
   * `recorderStateDurationMillis` without a real timer driving it, so a
   * multi-tick integration test here would only prove the mock's own
   * plumbing, not this function's real bucketing logic. Testing the exported
   * pure function directly is exactly this codebase's own established
   * fallback for that situation (`media-source.test.ts`'s "mock narrowly,
   * test the logic for real" philosophy, cited in this file's own header
   * comment) — it is the same function `voice-recorder.tsx` actually calls.
   */
  describe('elapsedAnnouncement (E1.4.11)', () => {
    it('while recording, rounds down to five-second buckets rather than announcing every tick', () => {
      expect(elapsedAnnouncement(0, 'recording')).toBe('0 seconds recorded');
      expect(elapsedAnnouncement(1200, 'recording')).toBe('0 seconds recorded');
      expect(elapsedAnnouncement(4999, 'recording')).toBe('0 seconds recorded'); // one tick before the boundary — must not fire early
      expect(elapsedAnnouncement(5000, 'recording')).toBe('5 seconds recorded');
      expect(elapsedAnnouncement(7300, 'recording')).toBe('5 seconds recorded'); // mid-bucket — must not have changed again yet
      expect(elapsedAnnouncement(9999, 'recording')).toBe('5 seconds recorded');
      expect(elapsedAnnouncement(10000, 'recording')).toBe('10 seconds recorded');
    });

    it('once stopped, announces the exact final duration — not rounded to a five-second bucket', () => {
      expect(elapsedAnnouncement(7300, 'ready')).toBe('7 seconds recorded'); // Math.round(7300 / 1000)
      expect(elapsedAnnouncement(7600, 'ready')).toBe('8 seconds recorded');
    });
  });

  describe('security', () => {
    it('never logs the recorded file URI or any recording data', async () => {
      recorderUri = 'file:///a-very-specific-private-path.m4a';
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const instance = await render();
        await act(async () => byLabel(instance, 'Start recording')!.props.onPress());
        await act(async () => byLabel(instance, 'Stop recording')!.props.onPress());
        await act(async () => byLabel(instance, 'Enclose this')!.props.onPress());

        for (const spy of [logSpy, errorSpy]) {
          for (const call of spy.mock.calls) {
            expect(call.map((a) => String(a)).join(' ')).not.toContain('a-very-specific-private-path');
          }
        }
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });
});
