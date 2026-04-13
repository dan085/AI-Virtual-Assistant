import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';

/**
 * OAuth state handling.
 *
 * The state parameter bundles:
 *   - the user's uid (so the callback knows who authorized)
 *   - the platform id
 *   - a random nonce
 *   - an HMAC signature using SOCIAL_OAUTH_SIGNING_SECRET
 *
 * The HMAC prevents an attacker from forging a state that pins the
 * callback to a different user's uid.
 *
 * Resolving the signing secret:
 *   1. If the Firebase Functions secret is populated, use it.
 *   2. Otherwise (unit tests, emulator without secret) fall back to
 *      process.env.SOCIAL_OAUTH_SIGNING_SECRET.
 *   3. If neither is set, throw clearly.
 */

export const SOCIAL_OAUTH_SIGNING_SECRET = defineSecret(
  'SOCIAL_OAUTH_SIGNING_SECRET',
);

function getSigningSecret(): string {
  try {
    const v = SOCIAL_OAUTH_SIGNING_SECRET.value();
    if (v) return v;
  } catch {
    // Falls through to env lookup.
  }
  const fromEnv = process.env.SOCIAL_OAUTH_SIGNING_SECRET;
  if (fromEnv) return fromEnv;
  throw new Error(
    'SOCIAL_OAUTH_SIGNING_SECRET is not configured. Run: firebase functions:secrets:set SOCIAL_OAUTH_SIGNING_SECRET',
  );
}

export interface StatePayload {
  uid: string;
  platform: string;
  nonce: string;
}

export function encodeState(payload: StatePayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

export function decodeState(raw: string): StatePayload {
  const parts = raw.split('.');
  if (parts.length !== 2) throw new Error('Malformed state');
  const [b64, sig] = parts;
  const expected = sign(b64);
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    throw new Error('Invalid state signature');
  }
  const json = Buffer.from(b64, 'base64url').toString('utf8');
  return JSON.parse(json) as StatePayload;
}

export function freshNonce(): string {
  return randomBytes(16).toString('hex');
}

function sign(value: string): string {
  return createHmac('sha256', getSigningSecret()).update(value).digest('base64url');
}
