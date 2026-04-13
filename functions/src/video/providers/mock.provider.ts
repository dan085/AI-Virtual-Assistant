import {
  VideoGenerationJob,
  VideoGenerationRequest,
  VideoGenerator,
} from '../generator.interface';

/**
 * Deterministic mock provider for development and tests. Always succeeds
 * after a simulated delay. Uses the in-memory Map to remember jobs across
 * calls within the same container instance.
 *
 * Because Cloud Functions containers are ephemeral, the mock store is
 * lossy across cold starts — that's fine for dev. Real providers persist
 * jobs in their own infra.
 */
const MOCK_STORE = new Map<
  string,
  { submittedAt: number; request: VideoGenerationRequest }
>();

const SAMPLE_VIDEOS: Record<string, string> = {
  '9:16':
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  '16:9':
    'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  '1:1':
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
};

export class MockVideoProvider implements VideoGenerator {
  readonly id = 'mock';
  readonly label = 'Mock (development)';

  isConfigured(): boolean {
    return true;
  }

  async submit(req: VideoGenerationRequest): Promise<VideoGenerationJob> {
    const jobId = `mock_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    MOCK_STORE.set(jobId, { submittedAt: Date.now(), request: req });
    return {
      providerJobId: jobId,
      providerId: this.id,
      status: 'queued',
      progress: 0,
    };
  }

  async getStatus(providerJobId: string): Promise<VideoGenerationJob> {
    const entry = MOCK_STORE.get(providerJobId);
    if (!entry) {
      return {
        providerJobId,
        providerId: this.id,
        status: 'failed',
        errorMessage: 'Job not found (mock store evicted on cold start).',
      };
    }
    const elapsed = Date.now() - entry.submittedAt;
    // Simulate: queued < 2s, running 2-8s, succeeded >= 8s
    if (elapsed < 2000) {
      return { providerJobId, providerId: this.id, status: 'queued', progress: 10 };
    }
    if (elapsed < 8000) {
      return {
        providerJobId,
        providerId: this.id,
        status: 'running',
        progress: Math.min(95, Math.round((elapsed / 8000) * 100)),
      };
    }
    const ar = entry.request.aspectRatio ?? '9:16';
    return {
      providerJobId,
      providerId: this.id,
      status: 'succeeded',
      progress: 100,
      videoUrl: SAMPLE_VIDEOS[ar] ?? SAMPLE_VIDEOS['9:16'],
    };
  }
}
