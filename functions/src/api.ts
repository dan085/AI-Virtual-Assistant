import { onRequest } from 'firebase-functions/v2/https';

/**
 * Lightweight HTTP endpoint for health checks.
 * Mounted at /api/health via hosting rewrites.
 *
 * OAuth callbacks are handled by a separate function (`oauthCallback`
 * in social/endpoints.ts) because callbacks need access to platform
 * secrets, while this generic api function stays secret-free.
 */
export const api = onRequest(
  { region: 'us-central1', maxInstances: 5 },
  (req, res) => {
    if (req.path === '/api/health' || req.path === '/health') {
      res.status(200).json({ status: 'ok', timestamp: Date.now() });
      return;
    }
    res.status(404).json({ error: 'Not found' });
  },
);
