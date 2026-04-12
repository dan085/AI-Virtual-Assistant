import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import {
  VideoGenerationRequest,
  VideoGenerator,
  VideoGenerationJob,
} from './generator.interface';
import { getVideoProvider } from './generator.registry';

/**
 * Firestore-backed job orchestration for video generation.
 *
 * Jobs live at `users/{uid}/videoGenerations/{jobId}` and go through:
 *   queued → running → succeeded | failed | cancelled
 *
 * The agent never blocks on a generation — it kicks off a job with
 * `submitVideoJob` and tells the user to check back. A separate skill
 * `checkVideoJob` (or the UI) polls status until it's done.
 */

export interface SubmitArgs {
  uid: string;
  conversationId: string;
  providerId: string;
  request: VideoGenerationRequest;
}

export interface JobDoc extends VideoGenerationJob {
  jobId: string;
  uid: string;
  conversationId: string;
  prompt: string;
  aspectRatio: string;
  durationSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export async function submitVideoJob(args: SubmitArgs): Promise<JobDoc> {
  const provider = getVideoProvider(args.providerId);
  if (!provider.isConfigured()) {
    throw new Error(
      `Video provider "${args.providerId}" is not configured. Set its API key secret.`,
    );
  }

  const accepted = await provider.submit(args.request);

  const ref = db()
    .collection('users').doc(args.uid)
    .collection('videoGenerations')
    .doc();

  const now = Date.now();
  const doc: JobDoc = {
    jobId: ref.id,
    uid: args.uid,
    conversationId: args.conversationId,
    providerId: provider.id,
    providerJobId: accepted.providerJobId,
    status: accepted.status,
    prompt: args.request.prompt,
    aspectRatio: args.request.aspectRatio ?? '9:16',
    durationSeconds: args.request.durationSeconds ?? 6,
    progress: accepted.progress,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set({
    ...doc,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return doc;
}

export async function refreshVideoJob(
  uid: string,
  jobId: string,
): Promise<JobDoc> {
  const ref = db()
    .collection('users').doc(uid)
    .collection('videoGenerations').doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Job not found: ${jobId}`);
  const current = snap.data() as JobDoc;

  // Already terminal — no need to re-poll the provider.
  if (
    current.status === 'succeeded' ||
    current.status === 'failed' ||
    current.status === 'cancelled'
  ) {
    return current;
  }

  const provider: VideoGenerator = getVideoProvider(current.providerId);
  const fresh = await provider.getStatus(current.providerJobId);

  const update: Partial<JobDoc> = {
    status: fresh.status,
    progress: fresh.progress,
    videoUrl: fresh.videoUrl,
    thumbnailUrl: fresh.thumbnailUrl,
    errorMessage: fresh.errorMessage,
  };

  await ref.set(
    { ...update, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return { ...current, ...update };
}
