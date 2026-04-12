import {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerator,
} from '../generator.interface';
import { GEMINI_API_KEY } from '../../agent/genkit';

/**
 * Google Imagen 3 via the Gemini API.
 *
 * Reuses the existing GEMINI_API_KEY secret.
 * Docs: https://ai.google.dev/gemini-api/docs/image-generation
 *
 * Model: imagen-3.0-generate-002 (stable at time of writing; override
 * via IMAGEN_MODEL env var).
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'imagen-3.0-generate-002';

export class ImagenProvider implements ImageGenerator {
  readonly id = 'imagen';
  readonly label = 'Google Imagen 3';

  isConfigured(): boolean {
    try {
      return Boolean(GEMINI_API_KEY.value());
    } catch {
      return false;
    }
  }

  private get apiKey(): string {
    return GEMINI_API_KEY.value();
  }

  private get model(): string {
    return process.env.IMAGEN_MODEL || DEFAULT_MODEL;
  }

  async generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
    const body = {
      instances: [
        {
          prompt: req.prompt,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: req.aspectRatio ?? '1:1',
        ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}),
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
      },
    };

    const res = await fetch(
      `${BASE}/models/${this.model}:predict?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Imagen failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
    };
    const pred = data.predictions?.[0];
    if (!pred?.bytesBase64Encoded) {
      throw new Error('Imagen returned no image data');
    }
    // Return as a data URL. The caller is responsible for persisting it
    // to Cloud Storage if a stable public URL is needed (e.g. for IG).
    return {
      url: `data:${pred.mimeType ?? 'image/png'};base64,${pred.bytesBase64Encoded}`,
      providerId: this.id,
      revisedPrompt: req.prompt,
    };
  }
}
