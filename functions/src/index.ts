import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { getAdminApp } from './lib/admin';
import { requireAuth, wrapError } from './lib/errors';
import { ChatRequestSchema, listAgents, runAgent } from './agent/agent';
import { GEMINI_API_KEY } from './agent/genkit';
import { SKILL_CATALOG } from './agent/tools';
import {
  PublishRequestSchema,
  publishInstagramPost,
} from './instagram/publish';
import {
  INSTAGRAM_ACCESS_TOKEN,
  INSTAGRAM_BUSINESS_ID,
} from './instagram/client';
import {
  VIDEO_PROVIDER_SECRETS,
  listProviders as listVideoProviders,
} from './video/generator.registry';
import {
  IMAGE_PROVIDER_SECRETS,
  listImageProviders,
} from './image/generator.registry';

getAdminApp();

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  concurrency: 40,
});

/**
 * Callable: chat with the AI agent.
 *
 * Secrets: Gemini (for Genkit + Imagen), plus every video provider
 * (the agent may call generateAiVideo during generation).
 */
export const chatWithAgent = onCall(
  {
    secrets: [GEMINI_API_KEY, ...VIDEO_PROVIDER_SECRETS, ...IMAGE_PROVIDER_SECRETS],
    timeoutSeconds: 180,
    memory: '1GiB',
  },
  async (request) => {
    const uid = requireAuth(request.auth);
    const parsed = ChatRequestSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.message);
    }
    try {
      return await runAgent(uid, parsed.data);
    } catch (err) {
      wrapError(err, 'Agent failed to respond');
    }
  },
);

/**
 * Callable: publish to the app-wide Instagram Business account (legacy,
 * pre-OAuth path). Prefer `publishToSocial` for per-user flows.
 */
export const publishToInstagram = onCall(
  {
    secrets: [INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    const uid = requireAuth(request.auth);
    const parsed = PublishRequestSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.message);
    }
    try {
      return await publishInstagramPost(uid, parsed.data);
    } catch (err) {
      wrapError(err, 'Instagram publish failed');
    }
  },
);

/**
 * Callable: list agents, skills, and available AI providers.
 */
export const listAvailableAgents = onCall(
  { timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    requireAuth(request.auth);
    try {
      const agents = await listAgents();
      return {
        agents,
        skills: Object.values(SKILL_CATALOG),
        videoProviders: listVideoProviders(),
        imageProviders: listImageProviders(),
      };
    } catch (err) {
      wrapError(err, 'Failed to list agents');
    }
  },
);

// Scheduled
export { processDueReminders } from './scheduled/process-reminders';

// Multi-platform social (Instagram / Twitter / TikTok) OAuth + publish
export {
  listSocialConnections,
  startSocialOAuth,
  disconnectSocial,
  oauthCallback,
  publishToSocial,
} from './social/endpoints';

// Generic HTTP
export { api } from './api';
