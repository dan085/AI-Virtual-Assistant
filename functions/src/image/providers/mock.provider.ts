import {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerator,
} from '../generator.interface';

/**
 * Mock image provider for development. Uses picsum.photos with a seed
 * derived from the prompt so the same prompt returns the same image.
 */
export class MockImageProvider implements ImageGenerator {
  readonly id = 'mock';
  readonly label = 'Mock (development)';

  isConfigured(): boolean {
    return true;
  }

  async generate(req: ImageGenerationRequest): Promise<GeneratedImage> {
    const seed = Math.abs(hash(req.prompt)) % 1000;
    const { w, h } = dimensionsFor(req.aspectRatio ?? '1:1');
    return {
      url: `https://picsum.photos/seed/${seed}/${w}/${h}`,
      providerId: this.id,
      revisedPrompt: req.prompt,
    };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

function dimensionsFor(ar: string): { w: number; h: number } {
  switch (ar) {
    case '9:16':
      return { w: 720, h: 1280 };
    case '16:9':
      return { w: 1280, h: 720 };
    case '3:4':
      return { w: 768, h: 1024 };
    case '4:3':
      return { w: 1024, h: 768 };
    case '1:1':
    default:
      return { w: 1024, h: 1024 };
  }
}
