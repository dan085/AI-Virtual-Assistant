import { defineSecret } from 'firebase-functions/params';
import {
  VideoGenerationJob,
  VideoGenerationRequest,
  VideoGenerator,
} from '../generator.interface';

/**
 * Google Veo text-to-video via the Gemini API (Generative Language API).
 *
 * Set the API key with:
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * Veo returns a long-running operation. We expose operation.name as the
 * provider job id. Poll via the operation's REST path until done===true.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/video
 */

export const VEO_API_KEY = defineSecret('GEMINI_API_KEY');

const VEO_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'veo-3.0-generate-preview';

export class VeoProvider implements VideoGenerator {
  readonly id = 'veo';
  readonly label = 'Google Veo';

  isConfigured(): boolean {
    try {
      return Boolean(VEO_API_KEY.value());
    } catch {
      return false;
    }
  }

  private get apiKey(): string {
    return VEO_API_KEY.value();
  }

  private get model(): string {
    return process.env.VEO_MODEL || DEFAULT_MODEL;
  }

  async submit(req: VideoGenerationRequest): Promise<VideoGenerationJob> {
    const body = {
      instances: [
        {
          prompt: req.prompt,
          ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}),
          ...(req.imageUrl ? { image: { imageUri: req.imageUrl } } : {}),
        },
      ],
      parameters: {
        aspectRatio: req.aspectRatio ?? '9:16',
        durationSeconds: req.durationSeconds ?? 6,
        personGeneration: 'allow_adult',
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
      },
    };

    const url = `${VEO_BASE}/models/${this.model}:predictLongRunning?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Veo submit failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) throw new Error('Veo did not return an operation name');

    return {
      providerJobId: data.name,
      providerId: this.id,
      status: 'queued',
    };
  }

  async getStatus(providerJobId: string): Promise<VideoGenerationJob> {
    const url = `${VEO_BASE}/${providerJobId}?key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Veo status failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: {
        generateVideoResponse?: {
          generatedSamples?: Array<{ video?: { uri?: string } }>;
        };
      };
      metadata?: { progressPercent?: number };
    };

    if (!data.done) {
      return {
        providerJobId,
        providerId: this.id,
        status: data.metadata?.progressPercent ? 'running' : 'queued',
        progress: data.metadata?.progressPercent,
      };
    }
    if (data.error) {
      return {
        providerJobId,
        providerId: this.id,
        status: 'failed',
        errorMessage: data.error.message ?? 'Veo operation failed',
      };
    }
    const uri =
      data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) {
      return {
        providerJobId,
        providerId: this.id,
        status: 'failed',
        errorMessage: 'Veo completed without a video uri',
      };
    }
    return {
      providerJobId,
      providerId: this.id,
      status: 'succeeded',
      videoUrl: uri,
      progress: 100,
    };
  }
}
