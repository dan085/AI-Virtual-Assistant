/**
 * Provider-agnostic contract for AI image generators.
 *
 * Images are fast enough (2-15 s) to return synchronously, so this
 * interface is simpler than the video one — no job polling.
 */

export type ImageAspectRatio = '1:1' | '9:16' | '16:9' | '3:4' | '4:3';

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: ImageAspectRatio;
  seed?: number;
  /** Reference image for image-to-image / editing. */
  imageUrl?: string;
}

export interface GeneratedImage {
  /** Public (or signed) URL of the generated image. */
  url: string;
  /** Provider id that produced it. */
  providerId: string;
  /** Echoed prompt + any revisions the provider applied. */
  revisedPrompt?: string;
}

export interface ImageGenerator {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  generate(req: ImageGenerationRequest): Promise<GeneratedImage>;
}
