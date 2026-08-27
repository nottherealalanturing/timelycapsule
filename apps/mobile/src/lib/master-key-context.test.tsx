import { generateMasterKey, wrapMasterKeyWithPassword } from '@tc/crypto';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { MasterKeyProvider, useMasterKey } from './master-key-context';

/**
 * This file has no native-module dependency (pure React + @tc/crypto,
 * same as web's identical file), so — unlike auth-context.test.tsx — it
 * needs no vi.mock. react-test-renderer (not @testing-library/react-native,
 * which isn't installed anywhere in this monorepo) is the minimal way to
 * exercise a hook's real state transitions across renders.
 */
function Harness({ onReady }: { onReady: (value: ReturnType<typeof useMasterKey>) => void }) {
  const value = useMasterKey();
  onReady(value);
  return null;
}

async function render() {
  let latest!: ReturnType<typeof useMasterKey>;
  await act(async () => {
    TestRenderer.create(
      <MasterKeyProvider>
        <Harness onReady={(v) => (latest = v)} />
      </MasterKeyProvider>,
    );
  });
  return {
    get current() {
      return latest;
    },
    act: async (fn: () => Promise<void> | void) => {
      await act(async () => {
        await fn();
      });
    },
  };
}

describe('master-key-context.tsx', () => {
  it('starts with no master key', async () => {
    const h = await render();
    expect(h.current.masterKey).toBeNull();
  });

  it('setMasterKey stores the key in memory', async () => {
    const h = await render();
    const key = generateMasterKey();
    await h.act(() => h.current.setMasterKey(key));
    expect(h.current.masterKey).toEqual(key);
  });

  it('clearMasterKey removes it', async () => {
    const h = await render();
    await h.act(() => h.current.setMasterKey(generateMasterKey()));
    await h.act(() => h.current.clearMasterKey());
    expect(h.current.masterKey).toBeNull();
  });

  it('unlockWithPassword unwraps a real wrap and stores the resulting key', async () => {
    const h = await render();
    const key = generateMasterKey();
    const wrap = await wrapMasterKeyWithPassword(key, 'correct horse battery staple');
    await h.act(async () => {
      await h.current.unlockWithPassword(wrap, 'correct horse battery staple');
    });
    expect(h.current.masterKey).toEqual(key);
  });

  it('unlockWithPassword throws on the wrong password and does not set a key', async () => {
    const h = await render();
    const key = generateMasterKey();
    const wrap = await wrapMasterKeyWithPassword(key, 'correct horse battery staple');
    await expect(h.current.unlockWithPassword(wrap, 'wrong password')).rejects.toThrow();
    expect(h.current.masterKey).toBeNull();
  });

  it('unlockWithPassword throws immediately when masterKeyWrap is null', async () => {
    const h = await render();
    await expect(h.current.unlockWithPassword(null, 'anything')).rejects.toThrow(/no encryption key/i);
  });
});
