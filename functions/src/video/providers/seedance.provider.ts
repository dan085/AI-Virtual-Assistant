import { defineSecret } from 'firebase-functions/params';
import {
  VideoGenerationJob,
  VideoGenerationRequest,
  VideoGenerator,
} from '../generator.interface';

/**
 * Seedance (ByteDance / Volcengine Ark) text-to-video provider.
 *
 * Docs: https://www.volcengine.com/docs/82379 (Ark / Doubao)
 *
 * Set the API key with:
 *   firebase functions:secrets:set SEEDANCE_API_KEY
 *
 * The model id defaults to the production Seedance Pro model — override
 * via the SEEDANCE_MODEL env var if you're on a beta/preview.
 *
 * NOTE: the exact endpoint paths and payload shapes evolve over time.
 * Verify against Volcengine's current docs before shipping to prod.
 */

export const SEEDANCE_API_KEY = defineSecret('SEEDANCE_API_KEY');

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_MODEL = 'doubao-seedance-1-0-pro-250528';

export class SeedanceProvider implements VideoGenerator {
  readonly id = 'seedance';
  readonly label = 'Seedance (ByteDance)';

  isConfigured(): boolean {
    try {
      return Boolean(SEEDANCE_API_KEY.value());
    } catch {
      return false;
    }
  }

  private get apiKey(): string {
    return SEEDANCE_API_KEY.value();
  }

  private get model(): string {
    return process.env.SEEDANCE_MODEL || DEFAULT_MODEL;
  }

  async submit(req: VideoGenerationRequest): Promise<VideoGenerationJob> {
    const body = {
      model: this.model,
      content: [
        {
          type: 'text',
          text: this.buildPromptWithParams(req),
        },
        ...(req.imageUrl
          ? [{ type: 'image_url', image_url: { url: req.imageUrl } }]
          : []),
      ],
    };

    const res = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Seedance submit failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { id?: string; task_id?: string };
    const jobId = data.id ?? data.task_id;
    if (!jobId) throw new Error('Seedance did not return a task id');

    return {
      providerJobId: jobId,
      providerId: this.id,
      status: 'queued',
    };
  }

  async getStatus(providerJobId: string): Promise<VideoGenerationJob> {
    const res = await fetch(
      `${ARK_BASE}/contents/generations/tasks/${providerJobId}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Seedance status failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as {
      status?: string;
      content?: { video_url?: string; cover_url?: string };
      error?: { message?: string };
    };

    const status = normalizeSeedanceStatus(data.status);
    const job: VideoGenerationJob = {
      providerJobId,
      providerId: this.id,
      status,
    };
    if (status === 'succeeded') {
      job.videoUrl = data.content?.video_url;
      job.thumbnailUrl = data.content?.cover_url;
    } else if (status === 'failed') {
      job.errorMessage = data.error?.message ?? 'Unknown Seedance error';
    }
    return job;
  }

  private buildPromptWithParams(req: VideoGenerationRequest): string {
    // Seedance accepts inline parameter hints via --ar, --dur etc. in the
    // prompt string. Keep this in sync with the Volcengine docs.
    const parts = [req.prompt];
    if (req.aspectRatio) parts.push(`--ar ${req.aspectRatio}`);
    if (req.durationSeconds) parts.push(`--dur ${req.durationSeconds}`);
    if (req.seed !== undefined) parts.push(`--seed ${req.seed}`);
    return parts.join(' ');
  }
}

function normalizeSeedanceStatus(raw: string | undefined): VideoGenerationJob['status'] {
  switch ((raw ?? '').toLowerCase()) {
    case 'succeeded':
    case 'success':
      return 'succeeded';
    case 'failed':
    case 'error':
      return 'failed';
    case 'queued':
    case 'pending':
      return 'queued';
    case 'running':
    case 'in_progress':
      return 'running';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'queued';
  }
}
