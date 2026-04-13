import { randomBytes, createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../../lib/admin';

/**
 * Firestore-backed PKCE verifier store.
 *
 * The old in-memory Map approach broke under horizontal scaling: if the
 * Cloud Function instance that handled /startSocialOAuth was not the
 * same one that handled /api/oauth/twitter/callback, the verifier was
 * lost and the token exchange failed.
 *
 * Firestore path: `oauthPkce/{nonce}` (a top-level collection).
 * Rules: client-read-denied. Functions write and read via Admin SDK.
 * TTL: 10 minutes; consume-on-read so a verifier can only be used once.
 *
 * Enable automatic TTL cleanup for this collection in the Firebase
 * Console → Firestore → TTL policies, on the `expiresAt` field.
 */

const TTL_SECONDS = 10 * 60;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function savePkceVerifier(
  nonce: string,
  verifier: string,
): Promise<void> {
  const expiresAt = Timestamp.fromMillis(Date.now() + TTL_SECONDS * 1000);
  await db().collection('oauthPkce').doc(nonce).set({
    verifier,
    expiresAt,
    createdAt: Timestamp.now(),
  });
}

/**
 * Look up and immediately delete the verifier so it can only be
 * consumed once. Returns null if missing or expired.
 */
export async function consumePkceVerifier(
  nonce: string,
): Promise<string | null> {
  const ref = db().collection('oauthPkce').doc(nonce);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const expiresAt = data.expiresAt as Timestamp | undefined;

  // Delete first — we want single-use semantics even if the caller fails.
  await ref.delete().catch(() => undefined);

  if (expiresAt && expiresAt.toMillis() < Date.now()) return null;
  return (data.verifier as string | undefined) ?? null;
}
