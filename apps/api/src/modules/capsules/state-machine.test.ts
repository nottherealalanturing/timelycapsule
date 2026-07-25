import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { capsules } from '../../db/schema/index.js';
import {
  assertCanArchive,
  assertCanDuplicate,
  assertCanExtend,
  assertCanPatch,
  assertCanRestore,
  assertCanSeal,
  assertCanTrash,
  assertCanUnarchive,
  assertCanWithdraw,
  assertExtendWithinBounds,
  assertUnlockAtWithinBounds,
} from './state-machine.js';

type CapsuleRow = typeof capsules.$inferSelect;

function makeCapsule(overrides: Partial<CapsuleRow> = {}): CapsuleRow {
  const now = new Date();
  return {
    id: randomUUID(),
    publicId: 'ABCD2345',
    seals: [],
    expiresAfter: null,
    expiryStrict: false,
    expiredAt: null,
    ownerId: randomUUID(),
    orgId: null,
    type: 'personal',
    state: 'draft',
    title: 'Test',
    cover: null,
    teaser: null,
    contentDocEnc: null,
    ownerKeyWrap: null,
    passphraseHint: null,
    sizeBytes: 0,
    unlockMode: 'absolute',
    unlockAt: null,
    unlockLocal: null,
    sealDeadlineAt: null,
    sealedAt: null,
    extendedOnce: false,
    recurrence: null,
    seriesId: null,
    chainParentId: null,
    chainDelay: null,
    allowDownload: true,
    recipientsVisible: false,
    announceOnSeal: true,
    breakGlass: 'disabled',
    breakGlassRequestedAt: null,
    requireRecipientVerification: false,
    replyPrompt: null,
    location: null,
    sealedDaySnapshot: null,
    archivedAt: null,
    trashedAt: null,
    purgeAfter: null,
    withdrawnAt: null,
    legacyConfig: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as CapsuleRow;
}

describe('assertUnlockAtWithinBounds', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('rejects less than 5 minutes out', () => {
    expect(() => assertUnlockAtWithinBounds(new Date('2026-01-01T00:04:59Z'), now)).toThrow();
  });

  it('accepts exactly 5 minutes out', () => {
    expect(() => assertUnlockAtWithinBounds(new Date('2026-01-01T00:05:00Z'), now)).not.toThrow();
  });

  it('rejects more than 50 years out', () => {
    expect(() => assertUnlockAtWithinBounds(new Date('2077-01-02T00:00:00Z'), now)).toThrow();
  });

  it('accepts a reasonable future date', () => {
    expect(() => assertUnlockAtWithinBounds(new Date('2027-06-01T00:00:00Z'), now)).not.toThrow();
  });
});

describe('seal immutability (assertCanPatch / assertCanSeal)', () => {
  it('allows PATCH on a draft', () => {
    expect(() => assertCanPatch(makeCapsule({ state: 'draft' }))).not.toThrow();
  });

  it.each(['sealing', 'sealed', 'unlocked', 'expired', 'withdrawn'] as const)(
    'rejects PATCH once state is %s',
    (state) => {
      const err = getError(() => assertCanPatch(makeCapsule({ state })));
      expect(err?.code).toBe('capsule_sealed');
    },
  );

  it('allows sealing a draft', () => {
    expect(() => assertCanSeal(makeCapsule({ state: 'draft' }))).not.toThrow();
  });

  it('rejects sealing an already-sealed capsule', () => {
    expect(() => assertCanSeal(makeCapsule({ state: 'sealed' }))).toThrow();
  });
});

describe('withdraw semantics (assertCanWithdraw)', () => {
  it('allows withdrawing a sealed capsule with no opens', () => {
    expect(() => assertCanWithdraw(makeCapsule({ state: 'sealed' }), false)).not.toThrow();
  });

  it('rejects withdrawing a draft', () => {
    expect(() => assertCanWithdraw(makeCapsule({ state: 'draft' }), false)).toThrow();
  });

  it('rejects withdrawing an already-unlocked capsule', () => {
    expect(() => assertCanWithdraw(makeCapsule({ state: 'unlocked' }), false)).toThrow();
  });

  it('rejects withdrawing an already-withdrawn capsule with capsule_withdrawn', () => {
    const err = getError(() => assertCanWithdraw(makeCapsule({ state: 'withdrawn' }), false));
    expect(err?.code).toBe('capsule_withdrawn');
  });

  it('rejects withdrawing once any recipient has opened it (invariant 3)', () => {
    expect(() => assertCanWithdraw(makeCapsule({ state: 'sealed' }), true)).toThrow();
  });
});

describe('trash rules (assertCanTrash)', () => {
  it('allows trashing a plain draft', () => {
    expect(() =>
      assertCanTrash(makeCapsule({ state: 'draft' }), { anyRecipientOpened: false, hasThirdPartyRecipients: false }),
    ).not.toThrow();
  });

  it('rejects trashing once any recipient has opened it (invariant 3)', () => {
    expect(() =>
      assertCanTrash(makeCapsule({ state: 'sealed' }), { anyRecipientOpened: true, hasThirdPartyRecipients: true }),
    ).toThrow();
  });

  it('rejects trashing a sealed capsule with third-party recipients — must withdraw first (invariant 4)', () => {
    expect(() =>
      assertCanTrash(makeCapsule({ state: 'sealed' }), { anyRecipientOpened: false, hasThirdPartyRecipients: true }),
    ).toThrow();
  });

  it('allows trashing a sealed capsule with no recipients yet', () => {
    expect(() =>
      assertCanTrash(makeCapsule({ state: 'sealed' }), { anyRecipientOpened: false, hasThirdPartyRecipients: false }),
    ).not.toThrow();
  });

  it('allows trashing a withdrawn capsule with third-party recipients (already withdrawn, not sealed)', () => {
    expect(() =>
      assertCanTrash(makeCapsule({ state: 'withdrawn' }), { anyRecipientOpened: false, hasThirdPartyRecipients: true }),
    ).not.toThrow();
  });

  it('rejects trashing a legacy capsule with active legacy config (invariant 4)', () => {
    expect(() =>
      assertCanTrash(makeCapsule({ type: 'legacy', legacyConfig: { trigger: 'date' } }), {
        anyRecipientOpened: false,
        hasThirdPartyRecipients: false,
      }),
    ).toThrow();
  });

  it('allows trashing a legacy capsule once legacy config is disabled (null)', () => {
    expect(() =>
      assertCanTrash(makeCapsule({ type: 'legacy', legacyConfig: null }), {
        anyRecipientOpened: false,
        hasThirdPartyRecipients: false,
      }),
    ).not.toThrow();
  });

  it('rejects trashing an already-trashed capsule', () => {
    expect(() =>
      assertCanTrash(makeCapsule({ trashedAt: new Date() }), {
        anyRecipientOpened: false,
        hasThirdPartyRecipients: false,
      }),
    ).toThrow();
  });
});

describe('restore / archive / unarchive / duplicate', () => {
  it('assertCanRestore requires trashedAt to be set', () => {
    expect(() => assertCanRestore(makeCapsule({ trashedAt: null }))).toThrow();
    expect(() => assertCanRestore(makeCapsule({ trashedAt: new Date() }))).not.toThrow();
  });

  it('assertCanArchive rejects an already-archived or trashed capsule', () => {
    expect(() => assertCanArchive(makeCapsule({ archivedAt: new Date() }))).toThrow();
    expect(() => assertCanArchive(makeCapsule({ trashedAt: new Date() }))).toThrow();
    expect(() => assertCanArchive(makeCapsule({}))).not.toThrow();
  });

  it('assertCanUnarchive requires archivedAt to be set', () => {
    expect(() => assertCanUnarchive(makeCapsule({ archivedAt: null }))).toThrow();
    expect(() => assertCanUnarchive(makeCapsule({ archivedAt: new Date() }))).not.toThrow();
  });

  it('assertCanDuplicate rejects a trashed capsule', () => {
    expect(() => assertCanDuplicate(makeCapsule({ trashedAt: new Date() }))).toThrow();
    expect(() => assertCanDuplicate(makeCapsule({ state: 'sealed' }))).not.toThrow();
  });
});

describe('extend-once (assertCanExtend / assertExtendWithinBounds)', () => {
  it('allows extending a sealed, not-yet-extended capsule', () => {
    expect(() => assertCanExtend(makeCapsule({ state: 'sealed', extendedOnce: false }))).not.toThrow();
  });

  it('rejects extending a draft', () => {
    expect(() => assertCanExtend(makeCapsule({ state: 'draft' }))).toThrow();
  });

  it('rejects extending twice', () => {
    expect(() => assertCanExtend(makeCapsule({ state: 'sealed', extendedOnce: true }))).toThrow();
  });

  it('rejects a new unlock time not later than the current one', () => {
    const current = new Date('2027-01-01T00:00:00Z');
    expect(() => assertExtendWithinBounds(current, current)).toThrow();
    expect(() => assertExtendWithinBounds(current, new Date('2026-12-31T00:00:00Z'))).toThrow();
  });

  it('rejects extending by more than 30 days', () => {
    const current = new Date('2027-01-01T00:00:00Z');
    expect(() => assertExtendWithinBounds(current, new Date('2027-02-05T00:00:00Z'))).toThrow();
  });

  it('allows extending by exactly 30 days', () => {
    const current = new Date('2027-01-01T00:00:00Z');
    const now = new Date('2026-06-01T00:00:00Z');
    expect(() => assertExtendWithinBounds(current, new Date('2027-01-31T00:00:00Z'), now)).not.toThrow();
  });
});

function getError(fn: () => void): { code: string } | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    return err as { code: string };
  }
}
