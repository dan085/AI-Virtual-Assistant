import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { requireAuth } from '../lib/errors';
import { getPlatform, listPlatforms, SOCIAL_PLATFORM_SECRETS } from './platform.registry';
import { decodeState } from './oauth/state';
import {
  disconnectSocialAccount,
  listConnectedAccounts,
  loadSocialAccount,
  saveSocialAccount,
} from './account-store';
import { SocialPublishRequest } from './platform.interface';

/**
 * Build the absolute redirect URI for OAuth callbacks. It points to the
 * HTTPS function `oauthCallback` via the hosting rewrite defined in
 * firebase.json (`/api/oauth/{platform}/callback`).
 *
 * We derive the host from FIREBASE_CONFIG so this works both locally
 * (emulator) and in prod.
 */
function buildRedirectUri(platform: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/oauth/${platform}/callback`;
}

// ---------------------------------------------------------------
// Callable: list connected accounts
// ---------------------------------------------------------------
export const listSocialConnections = onCall(
  { secrets: SOCIAL_PLATFORM_SECRETS, timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    const uid = requireAuth(request.auth);
    const connected = await listConnectedAccounts(uid);
    return {
      connected,
      available: listPlatforms(),
    };
  },
);

// ---------------------------------------------------------------
// Callable: start an OAuth flow — returns the authorize URL
// ---------------------------------------------------------------
const StartSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'twitter', 'tiktok']),
  origin: z.string().url(),
});

export const startSocialOAuth = onCall(
  { secrets: SOCIAL_PLATFORM_SECRETS, timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    const uid = requireAuth(request.auth);
    const parsed = StartSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.message);
    }
    const platform = getPlatform(parsed.data.platform);
    if (!platform.isConfigured()) {
      throw new HttpsError(
        'failed-precondition',
        `Platform ${parsed.data.platform} is not configured. Set its client secrets.`,
      );
    }
    const redirectUri = buildRedirectUri(platform.id, parsed.data.origin);
    return platform.buildAuthorizeUrl(uid, redirectUri);
  },
);

// ---------------------------------------------------------------
// Callable: disconnect a platform
// ---------------------------------------------------------------
const DisconnectSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'twitter', 'tiktok']),
});
export const disconnectSocial = onCall(
  { secrets: SOCIAL_PLATFORM_SECRETS, timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    const uid = requireAuth(request.auth);
    const parsed = DisconnectSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.message);
    }
    await disconnectSocialAccount(uid, parsed.data.platform);
    return { ok: true };
  },
);

// ---------------------------------------------------------------
// HTTP: OAuth callback
// Accepts /api/oauth/{platform}/callback?code=...&state=...
// ---------------------------------------------------------------
export const oauthCallback = onRequest(
  {
    secrets: SOCIAL_PLATFORM_SECRETS,
    region: 'us-central1',
    timeoutSeconds: 60,
  },
  async (req, res) => {
    try {
      const match = req.path.match(/^\/api\/oauth\/([a-z]+)\/callback$/);
      if (!match) {
        res.status(404).send('Not found');
        return;
      }
      const platformId = match[1];
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      if (!code || !state) {
        res.status(400).send('Missing code or state');
        return;
      }

      const decoded = decodeState(state);
      if (decoded.platform !== platformId) {
        res.status(400).send('State platform mismatch');
        return;
      }

      const platform = getPlatform(platformId);
      const redirectUri = buildRedirectUri(
        platformId,
        `${req.protocol}://${req.get('host')}`,
      );
      const result = await platform.handleCallback(code, redirectUri);
      await saveSocialAccount(decoded.uid, result.account);

      // Redirect back to the frontend Connections page.
      res.redirect(302, '/connections?connected=' + platformId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[oauthCallback]', err);
      res
        .status(500)
        .send(err instanceof Error ? err.message : 'OAuth callback failed');
    }
  },
);

// ---------------------------------------------------------------
// Callable: publish to a given platform using the user's stored account
// ---------------------------------------------------------------
const SocialPublishSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'twitter', 'tiktok']),
  mediaType: z.enum(['IMAGE', 'VIDEO', 'REEL_OR_SHORT', 'STORY', 'CAROUSEL', 'TEXT']),
  caption: z.string().max(2200).optional(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
});

export const publishToSocial = onCall(
  {
    secrets: SOCIAL_PLATFORM_SECRETS,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (request) => {
    const uid = requireAuth(request.auth);
    const parsed = SocialPublishSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.message);
    }
    const account = await loadSocialAccount(uid, parsed.data.platform);
    if (!account) {
      throw new HttpsError(
        'failed-precondition',
        `No ${parsed.data.platform} account connected. Visit /connections first.`,
      );
    }
    const platform = getPlatform(parsed.data.platform);
    const { platform: _platform, ...rest } = parsed.data;
    try {
      return await platform.publish(account, rest as SocialPublishRequest);
    } catch (err) {
      throw new HttpsError(
        'internal',
        err instanceof Error ? err.message : 'Publish failed',
      );
    }
  },
);
