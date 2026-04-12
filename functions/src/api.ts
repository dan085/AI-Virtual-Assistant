import { onRequest } from 'firebase-functions/v2/https';

/**
 * Lightweight HTTP endpoint mounted at /api/** via Hosting rewrites.
 * Use this sparingly — prefer callable functions for authenticated actions.
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
