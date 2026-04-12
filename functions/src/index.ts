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

// Initialize Admin SDK once on cold start.
getAdminApp();

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  concurrency: 40,
});

/**
 * Callable function: chat with the AI agent (Gemini via Genkit).
 */
export const chatWithAgent = onCall(
  {
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 60,
    memory: '512MiB',
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
 * Callable function: publish an image + caption to Instagram.
 */
export const publishToInstagram = onCall(
  {
    secrets: [INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID],
    timeoutSeconds: 120,
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
 * Callable function: list the agents the user can pick from, together
 * with their skill catalog. Used by the frontend agent picker.
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
      };
    } catch (err) {
      wrapError(err, 'Failed to list agents');
    }
  },
);

/**
 * Simple health check (also serves as the hosting rewrite target at /api/health).
 */
export { api } from './api';
