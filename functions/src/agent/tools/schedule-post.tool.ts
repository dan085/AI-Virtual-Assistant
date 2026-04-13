import { z } from 'zod';
import type { Genkit } from 'genkit';
import type { ToolContext } from './context';
import { createScheduledPost } from '../../scheduler/schedule';

/**
 * Skill: schedule a multi-platform post for a future time.
 *
 * The agent must have already gathered caption + media URLs + target
 * platforms. This tool only persists the schedule entry; actual
 * publishing happens later via the scheduled function.
 */
export function defineSchedulePostTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'schedulePost',
      description:
        'Schedules a post to be automatically published at a future date/time on one or more connected social platforms. The user must have already connected the target platforms via /connections. Returns the scheduled post id. Always confirm the final schedule to the user in their language.',
      inputSchema: z.object({
        platforms: z
          .array(z.enum(['instagram', 'facebook', 'twitter', 'tiktok']))
          .min(1)
          .max(4),
        mediaType: z.enum(['IMAGE', 'VIDEO', 'REEL_OR_SHORT', 'STORY', 'TEXT']),
        caption: z.string().max(2200).optional(),
        imageUrl: z.string().url().optional(),
        videoUrl: z.string().url().optional(),
        coverUrl: z.string().url().optional(),
        scheduledAtIso: z
          .string()
          .describe('When to publish, as an ISO-8601 datetime string.'),
      }),
      outputSchema: z.object({
        scheduledPostId: z.string(),
        scheduledAt: z.string(),
        platforms: z.array(z.string()),
      }),
    },
    async ({
      platforms,
      mediaType,
      caption,
      imageUrl,
      videoUrl,
      coverUrl,
      scheduledAtIso,
    }) => {
      const scheduledAt = new Date(scheduledAtIso);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new Error(`Invalid ISO date: ${scheduledAtIso}`);
      }
      const { id } = await createScheduledPost(
        ctx.uid,
        {
          platforms,
          mediaType,
          caption,
          imageUrl,
          videoUrl,
          coverUrl,
          scheduledAt,
        },
        'agent',
        ctx.conversationId,
      );
      return {
        scheduledPostId: id,
        scheduledAt: scheduledAt.toISOString(),
        platforms,
      };
    },
  );
}
