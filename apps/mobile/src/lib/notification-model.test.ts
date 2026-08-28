import type { Notification } from '@tc/contracts';
import { describe, expect, it } from 'vitest';
import { fromNotification } from './notification-model';

function fixture(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    category: 'social',
    title: 'Ada opened your capsule',
    body: null,
    data: { capsuleId: '22222222-2222-2222-2222-222222222222', recipientId: '33333333-3333-3333-3333-333333333333' },
    readAt: null,
    createdAt: '2026-08-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('fromNotification', () => {
  it('normalizes the recipient-opened shape', () => {
    const row = fromNotification(fixture());
    expect(row.title).toBe('Ada opened your capsule');
    expect(row.capsuleId).toBe('22222222-2222-2222-2222-222222222222');
    expect(row.unread).toBe(true);
  });

  it('normalizes the reply shape (title only, no body)', () => {
    const row = fromNotification(fixture({ category: 'social', title: 'Ada replied', body: null }));
    expect(row.title).toBe('Ada replied');
    expect(row.body).toBeNull();
  });

  it('normalizes the media-release-warning shape (data carries more than capsuleId)', () => {
    const row = fromNotification(
      fixture({
        category: 'delivery',
        title: 'Enclosures due to be released',
        data: { capsuleId: '22222222-2222-2222-2222-222222222222', releaseAt: '2026-09-01T00:00:00.000Z', daysUntil: 7 },
      }),
    );
    expect(row.title).toBe('Enclosures due to be released');
    expect(row.capsuleId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('normalizes the email-bounce shape (has both title and body)', () => {
    const row = fromNotification(
      fixture({ category: 'delivery', title: "We couldn't reach a recipient", body: 'Emails to a@example.com keep bouncing.' }),
    );
    expect(row.title).toBe("We couldn't reach a recipient");
    expect(row.body).toBe('Emails to a@example.com keep bouncing.');
  });

  it('marks a notification with a non-null readAt as read (not unread)', () => {
    const row = fromNotification(fixture({ readAt: '2026-08-29T00:00:00.000Z' }));
    expect(row.unread).toBe(false);
  });

  it('treats data: null as having no capsuleId, without throwing', () => {
    const row = fromNotification(fixture({ data: null }));
    expect(row.capsuleId).toBeNull();
  });

  it('treats a missing capsuleId field as no capsuleId', () => {
    const row = fromNotification(fixture({ data: { recipientId: 'x' } }));
    expect(row.capsuleId).toBeNull();
  });

  it('treats a non-object data value as no capsuleId, without throwing', () => {
    expect(fromNotification(fixture({ data: 'a string' })).capsuleId).toBeNull();
    expect(fromNotification(fixture({ data: 42 })).capsuleId).toBeNull();
    expect(fromNotification(fixture({ data: ['array'] })).capsuleId).toBeNull();
  });

  it('treats an empty-string capsuleId as no capsuleId', () => {
    expect(fromNotification(fixture({ data: { capsuleId: '' } })).capsuleId).toBeNull();
  });

  it('treats a malformed (non-UUID) capsuleId as no capsuleId', () => {
    expect(fromNotification(fixture({ data: { capsuleId: 'not-a-real-uuid' } })).capsuleId).toBeNull();
    expect(fromNotification(fixture({ data: { capsuleId: '<script>alert(1)</script>' } })).capsuleId).toBeNull();
  });

  it('safely handles a category/shape the current four writers never produce, without crashing or inventing meaning', () => {
    const row = fromNotification(fixture({ category: 'product', title: 'A future product notification', body: 'Some new copy.', data: {} }));
    expect(row.title).toBe('A future product notification');
    expect(row.body).toBe('Some new copy.');
    expect(row.capsuleId).toBeNull();
  });

  it('falls back to the raw ISO string if createdAt is somehow unparseable, rather than throwing', () => {
    const row = fromNotification(fixture({ createdAt: 'not-a-date' }));
    expect(row.dateLabel).toBe('not-a-date');
  });
});
