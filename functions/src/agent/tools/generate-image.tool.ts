import { z } from 'zod';
import type { Genkit } from 'genkit';
import {
  getImageProvider,
  pickAvailableImageProvider,
} from '../../image/generator.registry';
import type { ToolContext } from './context';

/**
 * Skill: generate a still image via Imagen / DALL-E / Flux.
 *
 * Returns a URL (may be a data: URL for Imagen). For Instagram posting
 * the URL must be publicly reachable, so the frontend is responsible
 * for uploading data URLs to Cloud Storage before calling publish.
 */
export function defineGenerateImageTool(ai: Genkit, _ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'generateAiImage',
      description:
        'Generates a still image from a text prompt using an AI image model. Fast (2-15 s). Use this when the user asks for an image for an Instagram post, Story, or carousel. Returns a URL which can be passed to createInstagramDraft.',
      inputSchema: z.object({
        prompt: z.string().min(5).max(2000),
        negativePrompt: z.string().max(500).optional(),
        aspectRatio: z
          .enum(['1:1', '9:16', '16:9', '3:4', '4:3'])
          .default('1:1')
          .describe('9:16 for Stories/Reels covers, 1:1 for feed, 4:3 for carousels.'),
        provider: z
          .enum(['auto', 'imagen', 'dalle', 'replicate', 'mock'])
          .default('auto'),
      }),
      outputSchema: z.object({
        url: z.string(),
        providerId: z.string(),
        revisedPrompt: z.string().optional(),
      }),
    },
    async ({ prompt, negativePrompt, aspectRatio, provider }) => {
      const gen =
        provider === 'auto'
          ? pickAvailableImageProvider()
          : getImageProvider(provider);

      const result = await gen.generate({
        prompt,
        negativePrompt,
        aspectRatio,
      });
      return result;
    },
  );
}
