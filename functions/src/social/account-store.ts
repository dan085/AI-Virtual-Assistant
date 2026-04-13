import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { SocialAccount, SocialPlatformId } from './platform.interface';

/**
 * Storage layer for user-connected social accounts.
 *
 * Path: users/{uid}/socialAccounts/{platformId}
 *
 * The public summary (used by the frontend Connections page) strips
 * every secret field — only the handle, platform, scopes and
 * connection metadata are exposed.
 */

export interface PublicSocialAccount {
  platform: SocialPlatformId;
  accountId: string;
  handle?: string;
  scopes?: string[];
  connectedAt?: number;
  expiresAt?: number;
}

export async function saveSocialAccount(
  uid: string,
  account: SocialAccount,
): Promise<void> {
  await db()
    .collection('users').doc(uid)
    .collection('socialAccounts').doc(account.platform)
    .set(
      {
        ...account,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function loadSocialAccount(
  uid: string,
  platform: SocialPlatformId,
): Promise<SocialAccount | null> {
  const snap = await db()
    .collection('users').doc(uid)
    .collection('socialAccounts').doc(platform)
    .get();
  if (!snap.exists) return null;
  return snap.data() as SocialAccount;
}

export async function listConnectedAccounts(
  uid: string,
): Promise<PublicSocialAccount[]> {
  const snap = await db()
    .collection('users').doc(uid)
    .collection('socialAccounts')
    .get();
  return snap.docs.map((d) => {
    const data = d.data() as SocialAccount;
    return {
      platform: data.platform,
      accountId: data.accountId,
      handle: data.handle,
      scopes: data.scopes,
      connectedAt: data.connectedAt,
      expiresAt: data.expiresAt,
    };
  });
}

export async function disconnectSocialAccount(
  uid: string,
  platform: SocialPlatformId,
): Promise<void> {
  await db()
    .collection('users').doc(uid)
    .collection('socialAccounts').doc(platform)
    .delete();
}
