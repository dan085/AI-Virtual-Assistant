import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { requireAuth, wrapError } from '../lib/errors';
import { createScheduledPost, cancelScheduledPost } from './schedule';
import { SOCIAL_PLATFORM_SECRETS } from '../social/platform.registry';

const CreateSchema = z.object({
  platforms: z
    .array(z.enum(['instagram', 'facebook', 'twitter', 'tiktok']))
    .min(1)
    .max(4),
  mediaType: z.enum(['IMAGE', 'VIDEO', 'REEL_OR_SHORT', 'STORY', 'CAROUSEL', 'TEXT']),
  caption: z.string().max(2200).optional(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  scheduledAtIso: z.string(),
});

export const createScheduledPostCallable = onCall(
  {
    secrets: SOCIAL_PLATFORM_SECRETS,
    timeoutSeconds: 20,
    memory: '256MiB',
  },
  async (request) => {
    const uid = requireAuth(request.auth);
    const parsed = CreateSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.message);
    }
    const scheduledAt = new Date(parsed.data.scheduledAtIso);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new HttpsError('invalid-argument', 'Invalid ISO date');
    }
    try {
      return await createScheduledPost(uid, {
        ...parsed.data,
        scheduledAt,
      });
    } catch (err) {
      wrapError(err, 'Failed to schedule post');
    }
  },
);

const CancelSchema = z.object({ id: z.string().min(1) });

export const cancelScheduledPostCallable = onCall(
  { timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    const uid = requireAuth(request.auth);
    const parsed = CancelSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.message);
    }
    try {
      await cancelScheduledPost(uid, parsed.data.id);
      return { ok: true };
    } catch (err) {
      wrapError(err, 'Failed to cancel post');
    }
  },
);
