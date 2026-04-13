import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Scheduler service unit tests.
 *
 * We stub the Firestore admin DB so no real Admin SDK is needed.
 */

process.env.SOCIAL_OAUTH_SIGNING_SECRET = 'test-secret-do-not-use-in-prod-42';

// Intercept the db() call used inside schedule.ts.
const writes: Array<{ path: string; data: any }> = [];
const mockDocs: Record<string, any> = {};

function fakeRef(path: string): any {
  return {
    path,
    id: path.split('/').pop(),
    async set(data: any) {
      writes.push({ path, data });
      mockDocs[path] = data;
    },
    async get() {
      return {
        exists: path in mockDocs,
        data: () => mockDocs[path],
      };
    },
    async update(data: any) {
      mockDocs[path] = { ...mockDocs[path], ...data };
    },
  };
}

function fakeCollection(parent: string): any {
  let counter = 0;
  return {
    doc(id?: string) {
      const finalId = id ?? `auto_${++counter}`;
      return fakeRef(`${parent}/${finalId}`);
    },
  };
}

function fakeUserDocs(uid: string): any {
  return {
    collection: (name: string) => fakeCollection(`users/${uid}/${name}`),
  };
}

const fakeDb: any = {
  collection: (name: string) => ({
    doc: (uid: string) => fakeUserDocs(uid),
  }),
};

// Monkey-patch the db() export from lib/admin before importing schedule.
// We use a proxy-based technique: require the compiled module and
// overwrite its export.
import * as adminModule from '../lib/admin';
(adminModule as any).db = () => fakeDb;

import { createScheduledPost, cancelScheduledPost } from '../scheduler/schedule';

test('createScheduledPost writes a doc with status scheduled', async () => {
  writes.length = 0;
  const future = new Date(Date.now() + 60 * 60 * 1000); // +1h
  const res = await createScheduledPost('user-1', {
    platforms: ['instagram', 'twitter'],
    mediaType: 'IMAGE',
    caption: 'hello world',
    imageUrl: 'https://example.com/pic.jpg',
    scheduledAt: future,
  });
  assert.ok(res.id);
  assert.equal(writes.length, 1);
  const w = writes[0];
  assert.ok(w.path.startsWith('users/user-1/scheduledPosts/'));
  assert.equal(w.data.status, 'scheduled');
  assert.deepEqual(w.data.platforms, ['instagram', 'twitter']);
  assert.equal(w.data.caption, 'hello world');
});

test('createScheduledPost rejects past scheduledAt', async () => {
  const past = new Date(Date.now() - 5 * 60 * 1000);
  await assert.rejects(
    () =>
      createScheduledPost('user-1', {
        platforms: ['instagram'],
        mediaType: 'IMAGE',
        imageUrl: 'https://example.com/x.jpg',
        scheduledAt: past,
      }),
    /must be in the future/,
  );
});

test('createScheduledPost rejects empty platforms', async () => {
  await assert.rejects(
    () =>
      createScheduledPost('user-1', {
        platforms: [],
        mediaType: 'IMAGE',
        imageUrl: 'https://example.com/x.jpg',
        scheduledAt: new Date(Date.now() + 60_000),
      }),
    /At least one platform/,
  );
});

test('cancelScheduledPost transitions scheduled → cancelled', async () => {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const { id } = await createScheduledPost('user-1', {
    platforms: ['instagram'],
    mediaType: 'IMAGE',
    imageUrl: 'https://example.com/x.jpg',
    scheduledAt: future,
  });
  await cancelScheduledPost('user-1', id);
  const stored = mockDocs[`users/user-1/scheduledPosts/${id}`];
  assert.equal(stored.status, 'cancelled');
});
