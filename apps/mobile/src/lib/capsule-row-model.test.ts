import type { CapsuleListItem, ReceivedCapsule } from '@tc/contracts';
import { describe, expect, it } from 'vitest';
import { fromCapsuleListItem, fromReceivedCapsule } from './capsule-row-model';
import { capsuleStateColors } from './tokens';

function buildOwned(overrides: Partial<CapsuleListItem> = {}): CapsuleListItem {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    publicId: 'pub-1',
    type: 'personal',
    state: 'draft',
    title: 'A letter to future me',
    cover: null,
    teaser: 'Some things I want to remember',
    passphraseHint: null,
    sizeBytes: 0,
    unlockMode: 'absolute',
    unlockAt: null,
    unlockLocal: null,
    sealDeadlineAt: null,
    sealedAt: null,
    extendedOnce: false,
    seals: [],
    allowDownload: true,
    recipientsVisible: true,
    announceOnSeal: false,
    requireRecipientVerification: false,
    replyPrompt: null,
    location: null,
    expiresAfter: null,
    expiryStrict: false,
    expiredAt: null,
    archivedAt: null,
    mediaRetentionUntil: null,
    trashedAt: null,
    purgeAfter: null,
    withdrawnAt: null,
    legacyConfig: null,
    recurrence: null,
    breakGlass: 'disabled',
    isFavorite: false,
    tagIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function buildReceived(overrides: Partial<ReceivedCapsule> = {}): ReceivedCapsule {
  return {
    recipientId: '22222222-2222-2222-2222-222222222222',
    capsuleId: '33333333-3333-3333-3333-333333333333',
    publicId: 'pub-2',
    section: 'upcoming',
    senderName: 'Ada Lovelace',
    senderEmail: 'ada@example.com',
    title: 'Happy birthday',
    cover: null,
    teaser: 'Open when the day comes',
    unlockAt: '2026-12-25T00:00:00.000Z',
    sealedAt: '2026-01-01T00:00:00.000Z',
    firstOpenedAt: null,
    ...overrides,
  };
}

describe('capsule-row-model — fromCapsuleListItem', () => {
  it('normalizes id, title, teaser, and a null subtitle (no sender for owned rows)', () => {
    const row = fromCapsuleListItem(buildOwned());
    expect(row.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(row.title).toBe('A letter to future me');
    expect(row.teaser).toBe('Some things I want to remember');
    expect(row.subtitle).toBeNull();
  });

  it('handles the 5th state — a draft with no title yet — without throwing or inventing content', () => {
    const row = fromCapsuleListItem(buildOwned({ title: null, teaser: null, updatedAt: '2026-03-01T00:00:00.000Z' }));
    expect(row.title).toBeNull();
    expect(row.teaser).toBeNull();
    expect(row.statusLabel).toBe('Draft');
    expect(row.dateLabel).not.toBeNull();
  });

  it.each([
    ['draft', capsuleStateColors.draft],
    ['sealing', capsuleStateColors.sealing],
    ['sealed', capsuleStateColors.sealed],
    ['unlocked', capsuleStateColors.unlocked],
    ['expired', capsuleStateColors.expired],
    ['withdrawn', capsuleStateColors.withdrawn],
  ] as const)('maps state %s to its token color', (state, color) => {
    const row = fromCapsuleListItem(buildOwned({ state }));
    expect(row.statusColor).toBe(color);
  });

  it('prefers unlockAt over sealedAt as the sealed-state date', () => {
    const row = fromCapsuleListItem(
      buildOwned({ state: 'sealed', unlockAt: '2026-06-01T00:00:00.000Z', sealedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(row.dateLabel).toBe(new Date('2026-06-01T00:00:00.000Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
  });

  it('falls back to null dateLabel when no relevant date exists', () => {
    const row = fromCapsuleListItem(buildOwned({ state: 'sealed', unlockAt: null, sealedAt: null }));
    expect(row.dateLabel).toBeNull();
  });
});

describe('capsule-row-model — fromReceivedCapsule', () => {
  it('normalizes capsuleId into id, and adds a sender subtitle', () => {
    const row = fromReceivedCapsule(buildReceived());
    expect(row.id).toBe('33333333-3333-3333-3333-333333333333');
    expect(row.subtitle).toBe('From Ada Lovelace');
  });

  it.each([
    ['upcoming', 'Still sealed', capsuleStateColors.sealed],
    ['waiting', 'Ready to open', capsuleStateColors.unlocked],
    ['opened', 'Opened', capsuleStateColors.unlocked],
  ] as const)('maps section %s to label %s and the corresponding token color', (section, label, color) => {
    const row = fromReceivedCapsule(buildReceived({ section }));
    expect(row.statusLabel).toBe(label);
    expect(row.statusColor).toBe(color);
  });

  it('uses firstOpenedAt for an opened capsule when available', () => {
    const row = fromReceivedCapsule(
      buildReceived({ section: 'opened', firstOpenedAt: '2026-12-26T00:00:00.000Z', unlockAt: '2026-12-25T00:00:00.000Z' }),
    );
    expect(row.dateLabel).toBe(new Date('2026-12-26T00:00:00.000Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
  });

  it('handles a title-less received capsule without throwing', () => {
    const row = fromReceivedCapsule(buildReceived({ title: null, teaser: null }));
    expect(row.title).toBeNull();
    expect(row.teaser).toBeNull();
  });
});
