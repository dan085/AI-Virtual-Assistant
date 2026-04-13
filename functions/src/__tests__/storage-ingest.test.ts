import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the storage-ingest service.
 *
 * Stubs both the firebase-admin storage bucket and the Firestore db,
 * then drives the ingest end-to-end with a mocked global.fetch.
 */

process.env.SOCIAL_OAUTH_SIGNING_SECRET = 'test-secret';

const stored: Array<{ path: string; bytes: Buffer; contentType: string }> = [];
const firestoreWrites: Array<{ path: string; data: any }> = [];

function fakeFile(path: string) {
  return {
    async save(bytes: Buffer, opts: { contentType: string }) {
      stored.push({ path, bytes, contentType: opts.contentType });
    },
    async getSignedUrl() {
      return [`https://signed.example.com/${path}`];
    },
  };
}
const fakeBucket = {
  file: (path: string) => fakeFile(path),
};

// Mock firebase-admin/storage
import * as storageMod from 'firebase-admin/storage';
(storageMod as any).getStorage = () => ({
  bucket: () => fakeBucket,
});

// Mock firebase-admin/firestore FieldValue + db
import * as adminModule from '../lib/admin';
let seq = 0;
(adminModule as any).getAdminApp = () => ({});
(adminModule as any).db = () => ({
  collection: (name: string) => ({
    doc: (uid: string) => ({
      collection: (sub: string) => ({
        doc: () => ({
          id: `asset_${++seq}`,
          async set(data: any) {
            firestoreWrites.push({ path: `${name}/${uid}/${sub}/asset_${seq}`, data });
          },
        }),
      }),
    }),
  }),
});

import { ingestToStorage } from '../media/storage-ingest';

function mockFetch(bytes: Buffer, contentType: string): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', contentType]]) as any,
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    }) as any) as any;
}

test('ingestToStorage writes bytes, signs URL, and mirrors to Firestore', async () => {
  stored.length = 0;
  firestoreWrites.length = 0;

  const realFetch = global.fetch;
  const fakeBytes = Buffer.from('fake-jpeg-bytes');
  // Provide a minimal fetch mock that exposes headers.get()
  global.fetch = (async () => ({
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k === 'content-type' ? 'image/jpeg' : null) },
    async arrayBuffer() {
      return fakeBytes.buffer.slice(fakeBytes.byteOffset, fakeBytes.byteOffset + fakeBytes.byteLength);
    },
  })) as any;

  try {
    const res = await ingestToStorage({
      uid: 'user-42',
      source: { kind: 'url', url: 'https://example.com/pic.jpg' },
      kind: 'image',
      filename: 'pic.jpg',
    });
    assert.ok(res.downloadUrl.startsWith('https://signed.example.com/'));
    assert.equal(res.contentType, 'image/jpeg');
    assert.equal(res.sizeBytes, fakeBytes.length);
    assert.equal(stored.length, 1);
    assert.ok(stored[0].path.startsWith('users/user-42/media/ingested/'));
    assert.equal(firestoreWrites.length, 1);
    assert.equal(firestoreWrites[0].data.kind, 'image');
  } finally {
    global.fetch = realFetch;
  }
});

test('ingestToStorage handles data: URLs without fetching', async () => {
  stored.length = 0;
  firestoreWrites.length = 0;
  const realFetch = global.fetch;
  // fetch should NOT be called for data: URLs.
  global.fetch = (async () => {
    throw new Error('fetch should not be called for data URLs');
  }) as any;
  try {
    const payload = Buffer.from('tiny-png-bytes').toString('base64');
    const dataUrl = `data:image/png;base64,${payload}`;
    const res = await ingestToStorage({
      uid: 'user-1',
      source: { kind: 'url', url: dataUrl },
      kind: 'image',
    });
    assert.equal(res.contentType, 'image/png');
    assert.ok(stored[0].bytes.equals(Buffer.from('tiny-png-bytes')));
  } finally {
    global.fetch = realFetch;
  }
});

test('ingestToStorage accepts base64 source directly', async () => {
  stored.length = 0;
  const payload = Buffer.from('hello world').toString('base64');
  const res = await ingestToStorage({
    uid: 'user-1',
    source: { kind: 'base64', data: payload, contentType: 'image/webp' },
    kind: 'image',
  });
  assert.equal(res.contentType, 'image/webp');
  assert.ok(stored[0].bytes.equals(Buffer.from('hello world')));
});
