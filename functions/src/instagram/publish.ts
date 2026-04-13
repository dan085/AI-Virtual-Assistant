import { z } from 'zod';
import { db } from '../lib/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  createPhotoContainer,
  createVideoContainer,
  createStoryContainer,
  createCarouselContainer,
  publishContainer,
  waitForContainerReady,
  InstagramMediaType,
} from './client';

/**
 * Unified publish request schema. The `mediaType` discriminates which
 * fields are required:
 *
 *   IMAGE    -> imageUrl
 *   VIDEO    -> videoUrl (+ optional coverUrl)
 *   REELS    -> videoUrl (+ optional coverUrl, shareToFeed)
 *   STORIES  -> imageUrl OR videoUrl
 *   CAROUSEL -> children[] of {imageUrl} | {videoUrl}
 */
export const PublishRequestSchema = z
  .object({
    mediaType: z.enum(['IMAGE', 'VIDEO', 'REELS', 'STORIES', 'CAROUSEL']),
    caption: z.string().max(2200).optional(),
    imageUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    coverUrl: z.string().url().optional(),
    shareToFeed: z.boolean().optional(),
    children: z
      .array(
        z.object({
          imageUrl: z.string().url().optional(),
          videoUrl: z.string().url().optional(),
        }),
      )
      .max(10)
      .optional(),
    draftId: z.string().min(1).max(128).optional(),
  })
  .superRefine((data, ctx) => {
    switch (data.mediaType) {
      case 'IMAGE':
        if (!data.imageUrl) ctx.addIssue({ code: 'custom', message: 'imageUrl is required for IMAGE' });
        break;
      case 'VIDEO':
      case 'REELS':
        if (!data.videoUrl) ctx.addIssue({ code: 'custom', message: 'videoUrl is required for VIDEO/REELS' });
        break;
      case 'STORIES':
        if (!data.imageUrl && !data.videoUrl) {
          ctx.addIssue({ code: 'custom', message: 'STORIES requires imageUrl or videoUrl' });
        }
        break;
      case 'CAROUSEL':
        if (!data.children || data.children.length < 2) {
          ctx.addIssue({ code: 'custom', message: 'CAROUSEL requires 2-10 children' });
        }
        break;
    }
  });

export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export interface PublishResponse {
  mediaId: string;
  creationId: string;
  postDocId: string;
  mediaType: InstagramMediaType;
}

async function createContainerForRequest(
  req: PublishRequest,
): Promise<string> {
  switch (req.mediaType) {
    case 'IMAGE':
      return createPhotoContainer({
        imageUrl: req.imageUrl!,
        caption: req.caption,
      });

    case 'VIDEO':
    case 'REELS': {
      const containerId = await createVideoContainer({
        videoUrl: req.videoUrl!,
        caption: req.caption,
        coverUrl: req.coverUrl,
        mediaType: req.mediaType,
        shareToFeed: req.shareToFeed,
      });
      // Videos need processing before they can be published.
      await waitForContainerReady(containerId);
      return containerId;
    }

    case 'STORIES': {
      const containerId = await createStoryContainer({
        imageUrl: req.imageUrl,
        videoUrl: req.videoUrl,
      });
      if (req.videoUrl) {
        await waitForContainerReady(containerId);
      }
      return containerId;
    }

    case 'CAROUSEL': {
      const childIds: string[] = [];
      for (const child of req.children ?? []) {
        if (child.videoUrl) {
          const id = await createVideoContainer({
            videoUrl: child.videoUrl,
            mediaType: 'VIDEO',
            isCarouselItem: true,
          });
          await waitForContainerReady(id);
          childIds.push(id);
        } else if (child.imageUrl) {
          const id = await createPhotoContainer({
            imageUrl: child.imageUrl,
            isCarouselItem: true,
          });
          childIds.push(id);
        }
      }
      return createCarouselContainer({
        childContainerIds: childIds,
        caption: req.caption,
      });
    }
  }
}

export async function publishInstagramPost(
  userId: string,
  req: PublishRequest,
): Promise<PublishResponse> {
  const creationId = await createContainerForRequest(req);
  const mediaId = await publishContainer(creationId);

  const postsRef = db()
    .collection('users').doc(userId)
    .collection('instagramPosts');

  const docRef = req.draftId ? postsRef.doc(req.draftId) : postsRef.doc();

  await docRef.set(
    {
      mediaType: req.mediaType,
      caption: req.caption ?? '',
      imageUrl: req.imageUrl ?? null,
      videoUrl: req.videoUrl ?? null,
      coverUrl: req.coverUrl ?? null,
      children: req.children ?? null,
      status: 'published',
      creationId,
      mediaId,
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { mediaId, creationId, postDocId: docRef.id, mediaType: req.mediaType };
}
