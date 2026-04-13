import { defineSecret } from 'firebase-functions/params';
import {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerator,
} from '../generator.interface';

/**
 * Replicate provider — defaults to black-forest-labs/flux-1.1-pro.
 *
 * Secret:
 *   firebase functions:secrets:set REPLICATE_API_TOKEN
 *
 * Replicate predictions can be sync (Prefer: wait) for small models.
 * Docs: https://replicate.com/docs/reference/http
 */

export const REPLICATE_API_TOKEN = defineSecret('REPLICATE_API_TOKEN');

const DEFAULT_MODEL = 'black-forest-labs/flux-1.1-pro';

export class ReplicateProvider implements ImageGenerator {
  readonly id = 'replicate';
  readonly label = 'Replicate (Flux 1.1 Pro)';

  isConfigured(): boolean {
    try {
      return Boolean(REPLICATE_API_TOKEN.value());
    } catch {
      return false;
    }
  }

  async generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
    const model = process.env.REPLICATE_MODEL || DEFAULT_MODEL;

    const body = {
      input: {
        prompt: req.prompt,
        aspect_ratio: req.aspectRatio ?? '1:1',
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
      },
    };

    const res = await fetch(
      `https://api.replicate.com/v1/models/${model}/predictions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN.value()}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=30',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Replicate failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      output?: string | string[];
      error?: string;
    };
    if (data.error) throw new Error(`Replicate error: ${data.error}`);

    const url = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!url) throw new Error('Replicate returned no image URL');
    return { url, providerId: this.id, revisedPrompt: req.prompt };
  }
}
