import type { VideoGenerator } from './generator.interface';
import { MockVideoProvider } from './providers/mock.provider';
import { SeedanceProvider, SEEDANCE_API_KEY } from './providers/seedance.provider';
import { VeoProvider, VEO_API_KEY } from './providers/veo.provider';
import { RunwayProvider, RUNWAY_API_KEY } from './providers/runway.provider';

/**
 * Pluggable registry of video generators. Adding a new provider is a
 * matter of (a) implementing the VideoGenerator interface and (b) adding
 * an entry to PROVIDERS below.
 */

export type VideoProviderId = 'mock' | 'seedance' | 'veo' | 'runway';

const PROVIDERS: Record<VideoProviderId, () => VideoGenerator> = {
  mock: () => new MockVideoProvider(),
  seedance: () => new SeedanceProvider(),
  veo: () => new VeoProvider(),
  runway: () => new RunwayProvider(),
};

/** All secrets any provider might need. Declared on the callable that runs generation. */
export const VIDEO_PROVIDER_SECRETS = [
  SEEDANCE_API_KEY,
  VEO_API_KEY,
  RUNWAY_API_KEY,
];

export function getVideoProvider(id: string): VideoGenerator {
  const factory = PROVIDERS[id as VideoProviderId];
  if (!factory) {
    throw new Error(`Unknown video provider: ${id}`);
  }
  return factory();
}

/**
 * Select the first provider in `preferredOrder` that has credentials
 * configured. Always falls back to the mock provider so local dev works.
 */
export function pickAvailableProvider(
  preferredOrder: VideoProviderId[] = ['seedance', 'veo', 'runway', 'mock'],
): VideoGenerator {
  for (const id of preferredOrder) {
    const p = PROVIDERS[id]();
    if (p.isConfigured()) return p;
  }
  return PROVIDERS.mock();
}

export function listProviders(): Array<{
  id: string;
  label: string;
  configured: boolean;
}> {
  return (Object.keys(PROVIDERS) as VideoProviderId[]).map((id) => {
    const p = PROVIDERS[id]();
    return { id: p.id, label: p.label, configured: p.isConfigured() };
  });
}
