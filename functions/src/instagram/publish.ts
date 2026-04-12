import { z } from 'zod';
import { db } from '../lib/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { publishImage } from './client';

export const PublishRequestSchema = z.object({
  imageUrl: z.string().url(),
  caption: z.string().max(2200).optional(),
  draftId: z.string().min(1).max(128).optional(),
});

export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export interface PublishResponse {
  mediaId: string;
  creationId: string;
  postDocId: string;
}

export async function publishInstagramPost(
  userId: string,
  req: PublishRequest,
): Promise<PublishResponse> {
  const { creationId, mediaId } = await publishImage(req.imageUrl, req.caption);

  const postsRef = db()
    .collection('users').doc(userId)
    .collection('instagramPosts');

  const docRef = req.draftId ? postsRef.doc(req.draftId) : postsRef.doc();

  await docRef.set(
    {
      imageUrl: req.imageUrl,
      caption: req.caption ?? '',
      status: 'published',
      creationId,
      mediaId,
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { mediaId, creationId, postDocId: docRef.id };
}
