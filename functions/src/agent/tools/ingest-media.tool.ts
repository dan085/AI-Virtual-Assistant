import { z } from 'zod';
import type { Genkit } from 'genkit';
import { ingestToStorage } from '../../media/storage-ingest';
import type { ToolContext } from './context';

/**
 * Skill: persist a generated image/video URL (or data URL) to Firebase
 * Storage and register it in the user's media library.
 *
 * Why this matters: `generateAiImage` returns a data URL for Imagen
 * (base64 PNG inline) — that's not directly publishable to Instagram
 * because Meta needs an HTTPS URL. This skill bridges the gap: Nina can
 * now chain `generateAiImage` → `ingestGeneratedMedia` →
 * `createInstagramDraft` in one conversation and produce a ready-to-
 * publish draft.
 */
export function defineIngestMediaTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'ingestGeneratedMedia',
      description:
        "Uploads a generated media URL (image or video from the AI providers) into the user's Firebase Storage bucket and returns a publicly accessible signed URL that can be passed to createInstagramDraft or any publisher. Use this right after generateAiImage or when a video job succeeds, so the media is stable and reachable by Instagram / TikTok.",
      inputSchema: z.object({
        url: z
          .string()
          .describe(
            'HTTP(S) URL or data: URL of the generated media. Usually the output of generateAiImage or the videoUrl from checkVideoGenerationStatus.',
          ),
        kind: z.enum(['image', 'video']),
        filename: z.string().max(120).optional(),
      }),
      outputSchema: z.object({
        downloadUrl: z.string(),
        mediaAssetId: z.string(),
        contentType: z.string(),
        sizeBytes: z.number(),
      }),
    },
    async ({ url, kind, filename }) => {
      const res = await ingestToStorage({
        uid: ctx.uid,
        source: { kind: 'url', url },
        kind,
        filename,
      });
      return {
        downloadUrl: res.downloadUrl,
        mediaAssetId: res.mediaAssetId,
        contentType: res.contentType,
        sizeBytes: res.sizeBytes,
      };
    },
  );
}
