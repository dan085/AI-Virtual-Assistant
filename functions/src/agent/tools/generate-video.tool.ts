import { z } from 'zod';
import type { Genkit } from 'genkit';
import {
  submitVideoJob,
  refreshVideoJob,
} from '../../video/job-service';
import { pickAvailableProvider } from '../../video/generator.registry';
import type { ToolContext } from './context';

/**
 * Skill: submit an AI video generation job.
 *
 * The agent passes a natural-language prompt, optional duration, aspect
 * ratio, and (optionally) a preferred provider. The job runs
 * asynchronously — this tool returns as soon as the job is queued,
 * and the agent must tell the user to wait or check back.
 */
export function defineGenerateVideoTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'generateAiVideo',
      description:
        'Starts generating a short AI-generated video clip from a text prompt. Runs asynchronously — returns a jobId immediately. Use this to create content for Instagram Stories, Reels, or feed videos. Tell the user the video will take 30-120 seconds and they should check the progress in the Videos tab (or you can call checkVideoGenerationStatus to poll).',
      inputSchema: z.object({
        prompt: z
          .string()
          .min(5)
          .max(2000)
          .describe('Descriptive text prompt of the desired scene.'),
        negativePrompt: z.string().max(500).optional(),
        durationSeconds: z
          .number()
          .int()
          .min(2)
          .max(12)
          .default(6)
          .describe('Duration of the clip. Providers typically clamp between 2 and 12 seconds.'),
        aspectRatio: z
          .enum(['9:16', '16:9', '1:1'])
          .default('9:16')
          .describe('9:16 for Instagram Stories/Reels, 1:1 for feed, 16:9 for landscape.'),
        imageUrl: z
          .string()
          .url()
          .optional()
          .describe('Optional seed image URL for image-to-video generation.'),
        provider: z
          .enum(['auto', 'seedance', 'veo', 'runway', 'mock'])
          .default('auto')
          .describe('Which provider to use. "auto" picks the first one with credentials.'),
      }),
      outputSchema: z.object({
        jobId: z.string(),
        providerId: z.string(),
        status: z.string(),
        aspectRatio: z.string(),
        durationSeconds: z.number(),
        message: z.string(),
      }),
    },
    async ({ prompt, negativePrompt, durationSeconds, aspectRatio, imageUrl, provider }) => {
      const chosenProvider =
        provider === 'auto' ? pickAvailableProvider().id : provider;

      const job = await submitVideoJob({
        uid: ctx.uid,
        conversationId: ctx.conversationId,
        providerId: chosenProvider,
        request: {
          prompt,
          negativePrompt,
          durationSeconds,
          aspectRatio,
          imageUrl,
        },
      });

      return {
        jobId: job.jobId,
        providerId: job.providerId,
        status: job.status,
        aspectRatio: job.aspectRatio,
        durationSeconds: job.durationSeconds,
        message: `Video job accepted by ${job.providerId}. It typically takes 30-120 seconds. Use checkVideoGenerationStatus with jobId "${job.jobId}" to poll, or open the Videos tab.`,
      };
    },
  );
}

/**
 * Skill: poll a previously-started video generation job.
 */
export function defineCheckVideoStatusTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'checkVideoGenerationStatus',
      description:
        'Checks the status of an AI video generation job previously started with generateAiVideo. Returns the current status and, if finished, the video URL that can be used in createInstagramDraft.',
      inputSchema: z.object({
        jobId: z.string().min(1),
      }),
      outputSchema: z.object({
        jobId: z.string(),
        status: z.string(),
        progress: z.number().optional(),
        videoUrl: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        errorMessage: z.string().optional(),
      }),
    },
    async ({ jobId }) => {
      const job = await refreshVideoJob(ctx.uid, jobId);
      return {
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        videoUrl: job.videoUrl,
        thumbnailUrl: job.thumbnailUrl,
        errorMessage: job.errorMessage,
      };
    },
  );
}
