import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `expo-image-picker`/`expo-document-picker` are native modules with no
 * JS-only fallback (confirmed directly, same reason every other native
 * Expo module in this codebase gets mocked for tests) — mocked with
 * `vi.fn()`s this file controls per test, exercising `media-source.ts`'s
 * own real permission-gating/normalization/dispatch logic against
 * controlled fake picker responses.
 */
const requestCameraPermissionsAsync = vi.fn();
const requestMediaLibraryPermissionsAsync = vi.fn();
const launchCameraAsync = vi.fn();
const launchImageLibraryAsync = vi.fn();
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: (...args: unknown[]) => requestCameraPermissionsAsync(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => requestMediaLibraryPermissionsAsync(...args),
  launchCameraAsync: (...args: unknown[]) => launchCameraAsync(...args),
  launchImageLibraryAsync: (...args: unknown[]) => launchImageLibraryAsync(...args),
}));

const getDocumentAsync = vi.fn();
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => getDocumentAsync(...args),
}));

const { pickFromCamera, pickFromLibrary, pickFile, pickForSource, formatMediaSize } = await import('./media-source');

describe('media-source.ts', () => {
  beforeEach(() => {
    requestCameraPermissionsAsync.mockReset();
    requestMediaLibraryPermissionsAsync.mockReset();
    launchCameraAsync.mockReset();
    launchImageLibraryAsync.mockReset();
    getDocumentAsync.mockReset();
  });

  describe('pickFromCamera', () => {
    it('requests camera permission before ever launching the camera', async () => {
      requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
      await pickFromCamera();
      expect(requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(launchCameraAsync).toHaveBeenCalledTimes(1);
    });

    it('returns permission_denied and never launches the camera when permission is refused', async () => {
      requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
      const result = await pickFromCamera();
      expect(result).toEqual({ status: 'permission_denied' });
      expect(launchCameraAsync).not.toHaveBeenCalled();
    });

    it('returns cancelled when the user backs out of the camera without capturing anything', async () => {
      requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
      const result = await pickFromCamera();
      expect(result).toEqual({ status: 'cancelled' });
    });

    it('normalizes a captured photo into PickedMedia', async () => {
      requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      launchCameraAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///photo.jpg', type: 'image', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 204800, width: 1080, height: 1920 }],
      });
      const result = await pickFromCamera();
      expect(result).toEqual({
        status: 'picked',
        media: [{ uri: 'file:///photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 204800, width: 1080, height: 1920, durationMs: undefined }],
      });
    });

    it('normalizes a captured video, including duration', async () => {
      requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      launchCameraAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///clip.mov', type: 'video', fileName: 'clip.mov', mimeType: 'video/quicktime', fileSize: 5_000_000, width: 1920, height: 1080, duration: 8000 }],
      });
      const result = await pickFromCamera();
      expect(result).toEqual({
        status: 'picked',
        media: [{ uri: 'file:///clip.mov', name: 'clip.mov', mimeType: 'video/quicktime', sizeBytes: 5_000_000, width: 1920, height: 1080, durationMs: 8000 }],
      });
    });

    it('falls back to a sensible name/mimeType when the OS does not report them', async () => {
      requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
      launchCameraAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///x', type: 'image', width: 0, height: 0 }],
      });
      const result = await pickFromCamera();
      expect(result.status).toBe('picked');
      if (result.status === 'picked') {
        expect(result.media[0]!.name).toBe('Photo');
        expect(result.media[0]!.mimeType).toBe('image/jpeg');
      }
    });
  });

  describe('pickFromLibrary', () => {
    it('requests media-library permission before ever opening the library', async () => {
      requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
      launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
      await pickFromLibrary();
      expect(requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    });

    it('returns permission_denied and never opens the library when permission is refused', async () => {
      requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
      const result = await pickFromLibrary();
      expect(result).toEqual({ status: 'permission_denied' });
      expect(launchImageLibraryAsync).not.toHaveBeenCalled();
    });

    it('requests images and videos with multiple selection enabled — matches web\'s own multi-file input', async () => {
      requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
      launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
      await pickFromLibrary();
      expect(launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true }));
    });

    it('normalizes multiple selected assets in one pick', async () => {
      requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
      launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///a.jpg', type: 'image', fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 100 },
          { uri: 'file:///b.mp4', type: 'video', fileName: 'b.mp4', mimeType: 'video/mp4', fileSize: 200, duration: 3000 },
        ],
      });
      const result = await pickFromLibrary();
      expect(result.status).toBe('picked');
      if (result.status === 'picked') expect(result.media).toHaveLength(2);
    });
  });

  describe('pickFile', () => {
    it('requests no permission at all — the system file picker needs none', async () => {
      getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
      await pickFile();
      expect(requestCameraPermissionsAsync).not.toHaveBeenCalled();
      expect(requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    });

    it('filters to the server\'s known-supported MIME types', async () => {
      getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
      await pickFile();
      const [options] = getDocumentAsync.mock.calls[0]!;
      expect(options.type).toEqual(expect.arrayContaining(['application/pdf', 'image/jpeg', 'application/zip']));
    });

    it('returns cancelled when the user dismisses the document picker', async () => {
      getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
      const result = await pickFile();
      expect(result).toEqual({ status: 'cancelled' });
    });

    it('normalizes a picked document, defaulting a missing MIME type to octet-stream', async () => {
      getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///report.pdf', name: 'report.pdf', mimeType: 'application/pdf', size: 50000 }],
      });
      const result = await pickFile();
      expect(result).toEqual({ status: 'picked', media: [{ uri: 'file:///report.pdf', name: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 50000 }] });
    });

    it('defaults a missing MIME type to application/octet-stream rather than guessing', async () => {
      getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x', name: 'x', size: 10 }] });
      const result = await pickFile();
      expect(result.status).toBe('picked');
      if (result.status === 'picked') expect(result.media[0]!.mimeType).toBe('application/octet-stream');
    });
  });

  describe('pickForSource', () => {
    it('dispatches to the correct picker for each source', async () => {
      requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
      requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
      getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

      await pickForSource('camera');
      expect(requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);

      await pickForSource('library');
      expect(requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);

      await pickForSource('file');
      expect(getDocumentAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatMediaSize', () => {
    it('formats bytes, kilobytes, and megabytes matching the web product\'s own convention', () => {
      expect(formatMediaSize(500)).toBe('500 B');
      expect(formatMediaSize(2048)).toBe('2 KB');
      expect(formatMediaSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });

    it('returns an empty string for a null size', () => {
      expect(formatMediaSize(null)).toBe('');
    });
  });

  describe('security', () => {
    it('never logs a file URI, name, or any picked media field', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
        launchCameraAsync.mockResolvedValue({
          canceled: false,
          assets: [{ uri: 'file:///private/a-very-specific-path.jpg', type: 'image', fileName: 'a-very-specific-path.jpg' }],
        });
        await pickFromCamera();
        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });
});
