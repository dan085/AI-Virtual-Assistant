import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { loadSocialAccount } from '../social/account-store';
import { getPlatform } from '../social/platform.registry';
import { SOCIAL_PLATFORM_SECRETS } from '../social/platform.registry';
import { SocialPlatformId } from '../social/platform.interface';

/**
 * Scheduled job — every minute, finds due scheduled posts and publishes
 * them. Runs per-platform in parallel; a post that partially fails is
 * marked `partially_published` with per-platform error details.
 *
 * Concurrency: we use a compare-and-swap on `status` (scheduled →
 * publishing) before actually calling platform.publish(), so a second
 * invocation that overlaps won't re-publish the same post.
 */
export const processDueScheduledPosts = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: SOCIAL_PLATFORM_SECRETS,
  },
  async () => {
    const now = Timestamp.now();
    const snap = await db()
      .collectionGroup('scheduledPosts')
      .where('status', '==', 'scheduled')
      .where('scheduledAt', '<=', now)
      .limit(50)
      .get();

    if (snap.empty) return;

    // eslint-disable-next-line no-console
    console.log(`[scheduler] processing ${snap.size} due posts`);

    for (const doc of snap.docs) {
      await processOne(doc.ref.path, doc.data()).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[scheduler] ${doc.id} failed`, err);
      });
    }
  },
);

async function processOne(
  path: string,
  data: FirebaseFirestore.DocumentData,
): Promise<void> {
  const ref = db().doc(path);
  const parts = path.split('/');
  const uid = parts[1];
  if (!uid) return;

  // Compare-and-swap: only proceed if still 'scheduled'.
  const ok = await db().runTransaction(async (tx) => {
    const latest = await tx.get(ref);
    if (!latest.exists || latest.data()?.status !== 'scheduled') return false;
    tx.update(ref, {
      status: 'publishing',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!ok) return;

  const platforms = (data.platforms ?? []) as SocialPlatformId[];
  const results: Record<string, any> = {};
  let anyOk = false;
  let anyFail = false;

  for (const platformId of platforms) {
    try {
      const account = await loadSocialAccount(uid, platformId);
      if (!account) throw new Error(`No connected ${platformId} account`);
      const platform = getPlatform(platformId);
      const res = await platform.publish(account, {
        mediaType: data.mediaType,
        caption: data.caption,
        imageUrl: data.imageUrl ?? undefined,
        videoUrl: data.videoUrl ?? undefined,
        coverUrl: data.coverUrl ?? undefined,
      });
      results[platformId] = {
        status: 'ok',
        remoteId: res.remoteId,
        permalink: res.permalink ?? null,
        publishedAt: Date.now(),
      };
      anyOk = true;
    } catch (err) {
      results[platformId] = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'unknown',
      };
      anyFail = true;
    }
  }

  const finalStatus = anyOk && anyFail
    ? 'partially_published'
    : anyOk
      ? 'published'
      : 'failed';

  await ref.update({
    status: finalStatus,
    results,
    publishedAt: anyOk ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
