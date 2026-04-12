import { z } from 'zod';
import type { Genkit } from 'genkit';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../lib/admin';
import type { ToolContext } from './context';

/**
 * Skill: create a *draft* Instagram post for the current user.
 * The agent CAN draft — it CANNOT publish. Publishing always requires
 * an explicit user action in the UI (publishToInstagram callable).
 *
 * This keeps the agent safe-by-default: it can help compose captions,
 * but a human must click Publish.
 */
export function defineInstagramDraftTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'createInstagramDraft',
      description:
        'Creates a DRAFT Instagram post for the user. Returns the draft id. The user must open the Instagram tab and click Publish to actually post it. Use this when the user asks to "prepare", "draft", "compose", or "schedule" an Instagram post. Never claim the post was published.',
      inputSchema: z.object({
        caption: z
          .string()
          .min(1)
          .max(2200)
          .describe('Full caption text including hashtags.'),
        imageUrl: z
          .string()
          .url()
          .optional()
          .describe('Optional public image URL. If omitted, the user will upload one in the UI.'),
        hashtags: z
          .array(z.string())
          .optional()
          .describe('Optional list of hashtags without the # prefix. They will be appended to the caption if not already present.'),
      }),
      outputSchema: z.object({
        draftId: z.string(),
        captionPreview: z.string(),
        status: z.literal('draft'),
      }),
    },
    async ({ caption, imageUrl, hashtags }) => {
      let finalCaption = caption;
      if (hashtags?.length) {
        const tagStr = hashtags
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
        caption: finalCaption,
        imageUrl: imageUrl ?? null,
        status: 'draft',
        createdBy: 'agent',
        sourceConversationId: ctx.conversationId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        draftId: docRef.id,
        captionPreview: finalCaption.slice(0, 120),
        status: 'draft' as const,
      };
    },
  );
}
