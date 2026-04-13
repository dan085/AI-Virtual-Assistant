import { z } from 'zod';
import type { Genkit } from 'genkit';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../lib/admin';
import type { ToolContext } from './context';

/**
 * Skill: create a *draft* Instagram post of ANY supported media type:
 * feed photo, feed video, Reel, Story (photo or video), or carousel.
 *
 * SAFETY: the agent drafts. It never publishes. Publishing is always an
 * explicit user action via the publishToInstagram callable from the UI.
 *
 * The agent can chain this skill with generateAiVideo: first call
 * generateAiVideo to kick off a clip, then (after polling) call this
 * skill with the resulting videoUrl to save the draft.
 */
export function defineInstagramDraftTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'createInstagramDraft',
      description:
        'Creates a DRAFT Instagram post or story for the user. Supports all Instagram Business media types: feed photo (IMAGE), feed video (VIDEO), Reel (REELS), Story (STORIES, photo or video), and carousel posts. Returns the draft id. The user must open the Instagram tab and click Publish to actually post it. Never claim the post was published.',
      inputSchema: z
        .object({
          mediaType: z
            .enum(['IMAGE', 'VIDEO', 'REELS', 'STORIES', 'CAROUSEL'])
            .describe(
              'IMAGE = single feed photo. VIDEO = feed video. REELS = Reel. STORIES = 9:16 ephemeral story (photo or video). CAROUSEL = 2-10 photos/videos.',
            ),
          caption: z
            .string()
            .max(2200)
            .optional()
            .describe('Caption text. Not used by STORIES. Auto-appends hashtags if provided.'),
          imageUrl: z
            .string()
            .url()
            .optional()
            .describe('Public image URL. Required for IMAGE and for photo STORIES.'),
          videoUrl: z
            .string()
            .url()
            .optional()
            .describe('Public video URL. Required for VIDEO / REELS and for video STORIES. Can come from generateAiVideo.'),
          coverUrl: z
            .string()
            .url()
            .optional()
            .describe('Optional thumbnail URL for VIDEO / REELS.'),
          shareReelToFeed: z
            .boolean()
            .default(true)
            .describe('For REELS only: whether to also share to the feed grid.'),
          children: z
            .array(
              z.object({
                imageUrl: z.string().url().optional(),
                videoUrl: z.string().url().optional(),
              }),
            )
            .max(10)
            .optional()
            .describe('For CAROUSEL only: 2 to 10 children, each either imageUrl or videoUrl.'),
          hashtags: z
            .array(z.string())
            .optional()
            .describe('Optional list of hashtags without the # prefix.'),
          generationJobId: z
            .string()
            .optional()
            .describe('If this draft references a video from generateAiVideo, pass the jobId so the UI can link them.'),
        })
        .superRefine((data, refCtx) => {
          switch (data.mediaType) {
            case 'IMAGE':
              if (!data.imageUrl) refCtx.addIssue({ code: 'custom', message: 'imageUrl is required for IMAGE' });
              break;
            case 'VIDEO':
            case 'REELS':
              if (!data.videoUrl) refCtx.addIssue({ code: 'custom', message: 'videoUrl is required for VIDEO/REELS' });
              break;
            case 'STORIES':
              if (!data.imageUrl && !data.videoUrl) {
                refCtx.addIssue({ code: 'custom', message: 'STORIES requires imageUrl or videoUrl' });
              }
              break;
            case 'CAROUSEL':
              if (!data.children || data.children.length < 2) {
                refCtx.addIssue({ code: 'custom', message: 'CAROUSEL requires 2-10 children' });
              }
              break;
          }
        }),
      outputSchema: z.object({
        draftId: z.string(),
        mediaType: z.string(),
        status: z.literal('draft'),
        hint: z.string(),
      }),
    },
    async (input) => {
      let finalCaption = input.caption ?? '';
      if (input.hashtags?.length && input.mediaType !== 'STORIES') {
        const tagStr = input.hashtags
          .map((t) => (t.startsWith('#') ? t : `#${t}`))
          .join(' ');
        if (!finalCaption.includes(tagStr)) {
          finalCaption = `${finalCaption}\n\n${tagStr}`.slice(0, 2200);
        }
      }

      const docRef = db()
        .collection('users').doc(ctx.uid)
        .collection('instagramPosts').doc();

      await docRef.set({
        mediaType: input.mediaType,
        caption: finalCaption,
        imageUrl: input.imageUrl ?? null,
        videoUrl: input.videoUrl ?? null,
        coverUrl: input.coverUrl ?? null,
        shareReelToFeed: input.mediaType === 'REELS' ? input.shareReelToFeed : null,
        children: input.children ?? null,
        status: 'draft',
        createdBy: 'agent',
        sourceConversationId: ctx.conversationId,
        generationJobId: input.generationJobId ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const hintByType: Record<string, string> = {
        IMAGE: 'Open the Instagram tab, pick this draft, and click Publish.',
        VIDEO: 'Open the Instagram tab. Video drafts take ~30s extra to process after you click Publish.',
        REELS: 'Open the Instagram tab. Reels take ~30s extra to process after you click Publish.',
        STORIES: 'Open the Instagram tab and click Publish. Stories disappear after 24h.',
        CAROUSEL: 'Open the Instagram tab and review each slide before publishing.',
      };

      return {
        draftId: docRef.id,
        mediaType: input.mediaType,
        status: 'draft' as const,
        hint: hintByType[input.mediaType],
      };
    },
  );
}
