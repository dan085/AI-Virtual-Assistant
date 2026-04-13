/**
 * Provider-agnostic contract for AI video generators.
 *
 * Why async / job-based?
 *   Every serious text-to-video model (Seedance, Veo, Runway, Luma) takes
 *   30-180+ seconds to produce a clip. Cloud Functions can run up to 9
 *   minutes for callables, but we still want to return immediately so the
 *   UI stays responsive. So the pattern is:
 *     1. `submit()` returns a provider jobId right away.
 *     2. The client (or a scheduled poller) calls `getStatus(jobId)` until
 *        status === 'succeeded' and `videoUrl` is populated.
 */

export type VideoAspectRatio = '16:9' | '9:16' | '1:1';

export interface VideoGenerationRequest {
  /** Text prompt describing the scene. */
  prompt: string;
  /** Negative prompt (what to avoid). */
  negativePrompt?: string;
  /** Desired length in seconds. Providers may clamp this. */
  durationSeconds?: number;
  /** Aspect ratio — 9:16 for Stories/Reels, 1:1 for feed, 16:9 for landscape. */
  aspectRatio?: VideoAspectRatio;
  /** Optional seed image URL for image-to-video generation. */
  imageUrl?: string;
  /** Seed for reproducibility (provider may ignore). */
  seed?: number;
}

export interface VideoGenerationJob {
  /** Opaque provider-specific id. */
  providerJobId: string;
  /** Provider name so the registry knows who to ask for status. */
  providerId: string;
  status: VideoJobStatus;
  /** Populated once status === 'succeeded'. */
  videoUrl?: string;
  /** Populated once status === 'succeeded' (optional cover frame). */
  thumbnailUrl?: string;
  /** Populated once status === 'failed'. */
  errorMessage?: string;
  /** Provider-reported progress 0..100 (optional). */
  progress?: number;
}

export type VideoJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface VideoGenerator {
  /** Canonical provider id, e.g. "seedance", "veo", "runway", "mock". */
  readonly id: string;
  /** Human-readable label shown in UI. */
  readonly label: string;
  /** Whether the provider has been configured with credentials. */
  isConfigured(): boolean;
  /** Kick off generation. Returns as soon as the job is accepted. */
  submit(req: VideoGenerationRequest): Promise<VideoGenerationJob>;
  /** Poll job status. */
  getStatus(providerJobId: string): Promise<VideoGenerationJob>;
}
