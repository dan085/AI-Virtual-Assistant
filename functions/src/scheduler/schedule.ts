import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { SocialPlatformId, SocialMediaType } from '../social/platform.interface';

/**
 * Scheduled posts service.
 *
 * A scheduled post is a single content item queued for publication at a
 * specific future time on one OR MORE platforms. The scheduled function
 * `processDueScheduledPosts` runs every minute, picks up due posts, and
 * publishes them per-platform using the user's stored social tokens.
 *
 * Path: users/{uid}/scheduledPosts/{id}
 */

export interface ScheduledPostInput {
  platforms: SocialPlatformId[];
  mediaType: SocialMediaType;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  coverUrl?: string;
  scheduledAt: Date;
}

export interface ScheduledPostDoc extends ScheduledPostInput {
  id: string;
  status: 'scheduled' | 'publishing' | 'published' | 'partially_published' | 'failed' | 'cancelled';
  createdBy: 'user' | 'agent';
  sourceConversationId?: string;
  results?: Record<
    SocialPlatformId,
    {
      status: 'ok' | 'failed';
      remoteId?: string;
      permalink?: string;
      error?: string;
      publishedAt?: number;
    }
  >;
}

export async function createScheduledPost(
  uid: string,
  input: ScheduledPostInput,
  createdBy: 'user' | 'agent' = 'user',
  sourceConversationId?: string,
): Promise<{ id: string }> {
  if (input.platforms.length === 0) {
    throw new Error('At least one platform is required');
  }
  if (input.scheduledAt.getTime() < Date.now() - 60_000) {
    throw new Error('scheduledAt must be in the future');
  }

  const ref = db()
    .collection('users').doc(uid)
    .collection('scheduledPosts').doc();

  await ref.set({
    platforms: input.platforms,
    mediaType: input.mediaType,
    caption: input.caption ?? '',
    imageUrl: input.imageUrl ?? null,
    videoUrl: input.videoUrl ?? null,
    coverUrl: input.coverUrl ?? null,
    scheduledAt: Timestamp.fromDate(input.scheduledAt),
    status: 'scheduled',
    createdBy,
    sourceConversationId: sourceConversationId ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: ref.id };
}

export async function cancelScheduledPost(
  uid: string,
  id: string,
): Promise<void> {
  const ref = db()
    .collection('users').doc(uid)
    .collection('scheduledPosts').doc(id);

  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Scheduled post not found: ${id}`);
  const current = snap.data() ?? {};
  if (current.status !== 'scheduled') {
    throw new Error(`Cannot cancel a post in status ${current.status}`);
  }
  await ref.update({
    status: 'cancelled',
    updatedAt: FieldValue.serverTimestamp(),
  });
}
