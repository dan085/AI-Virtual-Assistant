import type { ImageGenerator } from './generator.interface';
import { MockImageProvider } from './providers/mock.provider';
import { ImagenProvider } from './providers/imagen.provider';
import { DalleProvider, OPENAI_API_KEY } from './providers/dalle.provider';
import { ReplicateProvider, REPLICATE_API_TOKEN } from './providers/replicate.provider';

export type ImageProviderId = 'mock' | 'imagen' | 'dalle' | 'replicate';

const PROVIDERS: Record<ImageProviderId, () => ImageGenerator> = {
  mock: () => new MockImageProvider(),
  imagen: () => new ImagenProvider(),
  dalle: () => new DalleProvider(),
  replicate: () => new ReplicateProvider(),
};

export const IMAGE_PROVIDER_SECRETS = [
  OPENAI_API_KEY,
  REPLICATE_API_TOKEN,
  // Imagen reuses GEMINI_API_KEY, which is already declared on the
  // callable via the Genkit module.
];

export function getImageProvider(id: string): ImageGenerator {
  const factory = PROVIDERS[id as ImageProviderId];
  if (!factory) throw new Error(`Unknown image provider: ${id}`);
  return factory();
}

export function pickAvailableImageProvider(
  preferredOrder: ImageProviderId[] = ['imagen', 'dalle', 'replicate', 'mock'],
): ImageGenerator {
  for (const id of preferredOrder) {
    const p = PROVIDERS[id]();
    if (p.isConfigured()) return p;
  }
  return PROVIDERS.mock();
}

export function listImageProviders(): Array<{
  id: string;
  label: string;
  configured: boolean;
}> {
  return (Object.keys(PROVIDERS) as ImageProviderId[]).map((id) => {
    const p = PROVIDERS[id]();
    return { id: p.id, label: p.label, configured: p.isConfigured() };
  });
}
