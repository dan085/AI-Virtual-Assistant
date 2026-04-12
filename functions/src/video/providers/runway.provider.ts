import { defineSecret } from 'firebase-functions/params';
import {
  VideoGenerationJob,
  VideoGenerationRequest,
  VideoGenerator,
} from '../generator.interface';

/**
 * Runway Gen-3 Alpha text-to-video provider.
 *
 * Set the API key with:
 *   firebase functions:secrets:set RUNWAY_API_KEY
 *
 * Docs: https://docs.dev.runwayml.com/
 * Runway tasks are async: POST returns an id, GET /tasks/{id} polls.
 */

export const RUNWAY_API_KEY = defineSecret('RUNWAY_API_KEY');

const RUNWAY_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_API_VERSION = '2024-11-06';

export class RunwayProvider implements VideoGenerator {
  readonly id = 'runway';
  readonly label = 'Runway Gen-3';

  isConfigured(): boolean {
    try {
      return Boolean(RUNWAY_API_KEY.value());
    } catch {
      return false;
    }
  }

  private headers() {
    return {
      Authorization: `Bearer ${RUNWAY_API_KEY.value()}`,
      'X-Runway-Version': RUNWAY_API_VERSION,
      'Content-Type': 'application/json',
    };
  }

  async submit(req: VideoGenerationRequest): Promise<VideoGenerationJob> {
    // Runway Gen-3 requires an image_to_video or text_to_video endpoint.
    // We default to text_to_video; if the caller supplied an image, we
    // route to image_to_video instead.
    const endpoint = req.imageUrl ? 'image_to_video' : 'text_to_video';
    const body: Record<string, unknown> = {
      model: 'gen3a_turbo',
      promptText: req.prompt,
      duration: req.durationSeconds ?? 5,
      ratio: mapAspectRatio(req.aspectRatio ?? '9:16'),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.imageUrl ? { promptImage: req.imageUrl } : {}),
    };

    const res = await fetch(`${RUNWAY_BASE}/${endpoint}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Runway submit failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error('Runway did not return a task id');

    return {
      providerJobId: data.id,
      providerId: this.id,
      status: 'queued',
    };
  }

  async getStatus(providerJobId: string): Promise<VideoGenerationJob> {
    const res = await fetch(`${RUNWAY_BASE}/tasks/${providerJobId}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Runway status failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      status?: string;
      output?: string[];
      progress?: number;
      failure?: string;
    };

    const status = normalizeRunwayStatus(data.status);
    const job: VideoGenerationJob = {
      providerJobId,
      providerId: this.id,
      status,
      progress:
        typeof data.progress === 'number'
          ? Math.round(data.progress * 100)
          : undefined,
    };
    if (status === 'succeeded') {
      job.videoUrl = data.output?.[0];
    } else if (status === 'failed') {
      job.errorMessage = data.failure ?? 'Runway task failed';
    }
    return job;
  }
}

function mapAspectRatio(ar: string): string {
  switch (ar) {
    case '9:16':
      return '768:1280';
    case '16:9':
      return '1280:768';
    case '1:1':
      return '960:960';
    default:
      return '768:1280';
  }
}

function normalizeRunwayStatus(raw: string | undefined): VideoGenerationJob['status'] {
  switch ((raw ?? '').toUpperCase()) {
    case 'SUCCEEDED':
      return 'succeeded';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'RUNNING':
      return 'running';
    case 'PENDING':
    case 'THROTTLED':
    default:
      return 'queued';
  }
}
