import { act } from 'react';
import { Image, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoView } from 'expo-video';

vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Image: 'Image',
  StyleSheet: { create: (styles: unknown) => styles },
}));

vi.mock('expo-file-system', () => {
  class FakeFile {
    uri = 'file:///cache/fake-temp-file';
    create() {}
    write() {}
    get exists() {
      return true;
    }
    delete() {}
  }
  return { File: FakeFile, Paths: { cache: 'fake-cache-dir' } };
});

const videoPlayerCalls: unknown[] = [];
vi.mock('expo-video', () => ({
  useVideoPlayer: (source: unknown) => {
    videoPlayerCalls.push(source);
    return { source };
  },
  VideoView: 'VideoView',
}));

// Mirrors what the real `useAudioPlayerStatus` actually does (subscribes to
// the player's own state and re-renders on change) — a plain mutable flag
// without a subscription mechanism looked reactive but silently never
// triggered a re-render when `play()`/`pause()` flipped it, which this
// test caught on its first real run.
let mockAudioSnapshot = { playing: false };
const audioListeners = new Set<() => void>();
const audioPlay = vi.fn(() => {
  mockAudioSnapshot = { playing: true };
  audioListeners.forEach((listener) => listener());
});
const audioPause = vi.fn(() => {
  mockAudioSnapshot = { playing: false };
  audioListeners.forEach((listener) => listener());
});
vi.mock('expo-audio', async () => {
  const react = await import('react');
  return {
    useAudioPlayer: (source: unknown) => ({ source, play: audioPlay, pause: audioPause }),
    // `useSyncExternalStore` requires `getSnapshot` to return a stable
    // reference between calls unless the value actually changed — a fresh
    // object literal every call (this mock's first version) makes React
    // treat every render as a change, which hits its "Maximum update
    // depth exceeded" guard. `mockAudioSnapshot` is only reassigned inside
    // `audioPlay`/`audioPause`, so reads in between return the same object.
    useAudioPlayerStatus: () =>
      react.useSyncExternalStore(
        (listener: () => void) => {
          audioListeners.add(listener);
          return () => audioListeners.delete(listener);
        },
        () => mockAudioSnapshot,
      ),
  };
});

const { EnclosureViewer } = await import('./enclosure-viewer');

function texts(instance: TestRenderer.ReactTestRenderer): string[] {
  return instance.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat()
    .filter((t): t is string => typeof t === 'string');
}

function baseEnclosure(overrides: Partial<Parameters<typeof EnclosureViewer>[0]['enclosure']> = {}) {
  return {
    id: 'media-1',
    kind: 'image',
    mime: 'image/jpeg',
    caption: null,
    originalName: 'sunset.jpg',
    released: false,
    releasedAt: null,
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function renderViewer(props: Parameters<typeof EnclosureViewer>[0]): TestRenderer.ReactTestRenderer {
  let instance!: TestRenderer.ReactTestRenderer;
  act(() => {
    instance = TestRenderer.create(<EnclosureViewer {...props} />);
  });
  return instance;
}

beforeEach(() => {
  mockAudioSnapshot = { playing: false };
  audioPlay.mockClear();
  audioPause.mockClear();
  videoPlayerCalls.length = 0;
});

describe('EnclosureViewer — closed state', () => {
  it('states the kind in words and offers to open it', () => {
    const load = vi.fn();
    const instance = renderViewer({ enclosure: baseEnclosure(), load });
    expect(texts(instance).join(' ')).toContain('Photograph');
    expect(instance.root.findByProps({ accessibilityLabel: 'Open, Photograph, sunset.jpg' })).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });

  it('never decrypts anything before the recipient asks — nothing opens itself', () => {
    const load = vi.fn();
    renderViewer({ enclosure: baseEnclosure({ kind: 'video' }), load });
    expect(load).not.toHaveBeenCalled();
  });
});

describe('EnclosureViewer — released', () => {
  it('states it was released, with no Open control at all', () => {
    const instance = renderViewer({ enclosure: baseEnclosure({ released: true, releasedAt: '2026-01-15T00:00:00.000Z' }), load: vi.fn() });
    expect(texts(instance).join(' ')).toContain('Released from storage on 15 January 2026');
    expect(instance.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  });
});

describe('EnclosureViewer — per-kind rendering once opened', () => {
  it('renders an image via a real file:// uri', async () => {
    const load = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const instance = renderViewer({ enclosure: baseEnclosure({ kind: 'image' }), load });
    await act(async () => {
      instance.root.findByProps({ accessibilityLabel: 'Open, Photograph, sunset.jpg' }).props.onPress();
    });
    await flush();
    const image = instance.root.findByType(Image);
    expect(image.props.source.uri).toBe('file:///cache/fake-temp-file');
  });

  it('renders a video player', async () => {
    const load = vi.fn(async () => new Uint8Array([1]));
    const instance = renderViewer({ enclosure: baseEnclosure({ kind: 'video', mime: 'video/mp4', originalName: 'clip.mp4' }), load });
    await act(async () => {
      instance.root.findByProps({ accessibilityLabel: 'Open, Video, clip.mp4' }).props.onPress();
    });
    await flush();
    expect(instance.root.findByType(VideoView)).toBeTruthy();
    expect(videoPlayerCalls).toContain('file:///cache/fake-temp-file');
  });

  it('renders an audio Play/Pause control, stated as text (never icon-only)', async () => {
    const load = vi.fn(async () => new Uint8Array([1]));
    const instance = renderViewer({ enclosure: baseEnclosure({ kind: 'voice', mime: 'audio/m4a', originalName: 'note.m4a' }), load });
    await act(async () => {
      instance.root.findByProps({ accessibilityLabel: 'Open, Voice recording, note.m4a' }).props.onPress();
    });
    await flush();

    expect(texts(instance)).toContain('Play');
    const playButton = instance.root.findByProps({ accessibilityLabel: 'Play, note.m4a' });
    await act(async () => {
      playButton.props.onPress();
    });
    expect(audioPlay).toHaveBeenCalled();
    expect(texts(instance)).toContain('Pause');
  });

  it('falls back to plain stated text for a document/PDF — no native renderer required', async () => {
    const load = vi.fn(async () => new Uint8Array([1]));
    const instance = renderViewer({ enclosure: baseEnclosure({ kind: 'document', mime: 'application/pdf', originalName: 'contract.pdf' }), load });
    await act(async () => {
      instance.root.findByProps({ accessibilityLabel: 'Open, Document, contract.pdf' }).props.onPress();
    });
    await flush();
    expect(texts(instance).join(' ')).toContain('kept as it was enclosed');
  });

  it('falls back the same way for an unrecognized kind', async () => {
    const load = vi.fn(async () => new Uint8Array([1]));
    const instance = renderViewer({ enclosure: baseEnclosure({ kind: 'archive', originalName: 'backup.zip' }), load });
    await act(async () => {
      instance.root.findByProps({ accessibilityLabel: 'Open, Archive, backup.zip' }).props.onPress();
    });
    await flush();
    expect(texts(instance).join(' ')).toContain('kept as it was enclosed');
  });
});

describe('EnclosureViewer — failure', () => {
  it('shows a plain, non-technical error and offers Try again — never the raw thrown error', async () => {
    const load = vi.fn(async () => {
      throw new Error('AES-GCM auth tag verification failed: some technical detail');
    });
    const instance = renderViewer({ enclosure: baseEnclosure(), load });
    await act(async () => {
      instance.root.findByProps({ accessibilityLabel: 'Open, Photograph, sunset.jpg' }).props.onPress();
    });
    await flush();

    const joined = texts(instance).join(' ');
    expect(joined).toContain('This could not be opened');
    expect(joined).not.toContain('AES-GCM');
    expect(instance.root.findByProps({ accessibilityLabel: 'Try again, Photograph, sunset.jpg' })).toBeTruthy();
  });
});
