import { defineSecret } from 'firebase-functions/params';
import {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerator,
} from '../generator.interface';

/**
 * OpenAI DALL-E 3 provider.
 *
 * Secret:
 *   firebase functions:secrets:set OPENAI_API_KEY
 *
 * Docs: https://platform.openai.com/docs/guides/images
 */

export const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

export class DalleProvider implements ImageGenerator {
  readonly id = 'dalle';
  readonly label = 'OpenAI DALL-E 3';

  isConfigured(): boolean {
    try {
      return Boolean(OPENAI_API_KEY.value());
    } catch {
      return false;
    }
  }

  async generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
    const size = mapSize(req.aspectRatio ?? '1:1');
    const body = {
      model: 'dall-e-3',
      prompt: req.prompt,
      n: 1,
      size,
      response_format: 'url',
    };

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DALL-E failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      data?: Array<{ url?: string; revised_prompt?: string }>;
    };
    const first = data.data?.[0];
    if (!first?.url) throw new Error('DALL-E returned no image URL');

    return {
      url: first.url,
      providerId: this.id,
      revisedPrompt: first.revised_prompt ?? req.prompt,
    };
  }
}

function mapSize(ar: string): string {
  // DALL-E 3 supports 1024x1024, 1792x1024, 1024x1792 only.
  switch (ar) {
    case '16:9':
      return '1792x1024';
    case '9:16':
    case '3:4':
      return '1024x1792';
    case '4:3':
    case '1:1':
    default:
      return '1024x1024';
  }
}
