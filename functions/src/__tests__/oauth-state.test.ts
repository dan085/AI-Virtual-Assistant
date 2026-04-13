import test from 'node:test';
import assert from 'node:assert/strict';

// Provide a test-only signing secret via env var before importing the
// state module. state.ts falls back to process.env when the Firebase
// Secret Manager secret isn't populated (unit test runtime).
process.env.SOCIAL_OAUTH_SIGNING_SECRET = 'test-secret-do-not-use-in-prod-42';

import { encodeState, decodeState, freshNonce } from '../social/oauth/state';

test('encodeState + decodeState round trips', () => {
  const original = {
    uid: 'user-123',
    platform: 'twitter',
    nonce: freshNonce(),
  };
  const encoded = encodeState(original);
  assert.ok(encoded.includes('.'));
  const decoded = decodeState(encoded);
  assert.deepEqual(decoded, original);
});

test('decodeState rejects a tampered payload', () => {
  const original = {
    uid: 'user-123',
    platform: 'twitter',
    nonce: freshNonce(),
  };
  const encoded = encodeState(original);
  const [, sig] = encoded.split('.');

  // Swap the uid without re-signing.
  const tamperedPayload = JSON.stringify({ ...original, uid: 'attacker' });
  const tamperedB64 = Buffer.from(tamperedPayload, 'utf8').toString('base64url');
  const tampered = `${tamperedB64}.${sig}`;
  assert.throws(() => decodeState(tampered), /Invalid state signature/);

  // The original still verifies.
  assert.deepEqual(decodeState(encoded), original);
});

test('decodeState rejects malformed state', () => {
  assert.throws(() => decodeState('not-a-dot-separated-string'), /Malformed state/);
});

test('freshNonce returns a reasonably-long random string', () => {
  const a = freshNonce();
  const b = freshNonce();
  assert.notEqual(a, b);
  assert.ok(a.length >= 16);
});

test('encoding the same payload twice produces the same signature (deterministic)', () => {
  const payload = { uid: 'u', platform: 'tiktok', nonce: 'fixed-nonce' };
  const a = encodeState(payload);
  const b = encodeState(payload);
  assert.equal(a, b);
});
