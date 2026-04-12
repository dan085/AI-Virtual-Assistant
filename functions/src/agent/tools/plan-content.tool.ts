import { z } from 'zod';
import type { Genkit } from 'genkit';
import type { ToolContext } from './context';

/**
 * Skill: decide whether a Story (or post) should be created as an image
 * or a video, and draft the corresponding prompts.
 *
 * This is a "meta-skill" — the main agent delegates classification to a
 * dedicated structured call. Implemented with Genkit's generate() and a
 * Zod output schema so the return value is guaranteed well-formed.
 *
 * Why delegate? Forces the agent to produce a normalized plan before
 * committing to a (potentially expensive) image or video generation job,
 * instead of picking randomly in free-form prose.
 */
export function definePlanContentTool(ai: Genkit, _ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'planStoryContent',
      description:
        "Given a brief describing what the user wants to post, decides whether the content should be created as an IMAGE or a VIDEO (for an Instagram/Tiktok Story or Reel), drafts the prompt for the chosen media type, and explains the rationale. Call this BEFORE generateAiImage or generateAiVideo when the user's brief is ambiguous about format.",
      inputSchema: z.object({
        brief: z
          .string()
          .min(10)
          .max(2000)
          .describe("The user's content brief (product, moment, vibe, audience)."),
        platform: z
          .enum(['instagram_story', 'instagram_reel', 'instagram_feed', 'tiktok', 'twitter'])
          .default('instagram_story'),
        audience: z
          .string()
          .max(300)
          .optional()
          .describe('Optional target audience description.'),
      }),
      outputSchema: z.object({
        mediaType: z.enum(['IMAGE', 'VIDEO']),
        imagePrompt: z.string().optional(),
        videoPrompt: z.string().optional(),
        aspectRatio: z.enum(['1:1', '9:16', '16:9']),
        durationSeconds: z.number().optional(),
        rationale: z.string(),
        suggestedCaption: z.string(),
        suggestedHashtags: z.array(z.string()).max(15),
      }),
    },
    async ({ brief, platform, audience }) => {
      const decisionSchema = z.object({
        mediaType: z.enum(['IMAGE', 'VIDEO']),
        imagePrompt: z.string().optional(),
        videoPrompt: z.string().optional(),
        aspectRatio: z.enum(['1:1', '9:16', '16:9']),
        durationSeconds: z.number().optional(),
        rationale: z.string(),
        suggestedCaption: z.string(),
        suggestedHashtags: z.array(z.string()).max(15),
      });

      // Force structured output via Genkit's schema support.
      const res = await ai.generate({
        system: [
          'You are a social-media content planner.',
          'Decide whether the brief is better served by a STILL IMAGE or a SHORT VIDEO.',
          'Rules of thumb:',
          ' - VIDEO for motion, transformations, demos, before/after, process, storytelling.',
          ' - IMAGE for product shots, quotes, announcements, graphic stats, minimal scenes.',
          ' - Stories and Reels use 9:16. Feed posts use 1:1. TikTok uses 9:16.',
          ' - Keep videos 4-8 seconds to save generation cost and match Story length.',
          'Write the chosen prompt in English (image/video models work best in English) but the caption in the same language as the brief.',
          'Return ONLY data matching the schema.',
        ].join(' '),
        prompt: [
          `Platform: ${platform}`,
          audience ? `Audience: ${audience}` : '',
          `Brief: ${brief}`,
        ]
          .filter(Boolean)
          .join('\n'),
        output: { schema: decisionSchema },
      });

      const plan = (res as any).output as z.infer<typeof decisionSchema> | undefined;
      if (!plan) {
        throw new Error('Planner returned no structured output');
      }
      return plan;
    },
  );
}
