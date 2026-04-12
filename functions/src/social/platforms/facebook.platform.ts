import {
  OAuthCallbackResult,
  OAuthStartResult,
  SocialAccount,
  SocialPlatform,
  SocialPublishRequest,
  SocialPublishResult,
} from '../platform.interface';
import { encodeState, freshNonce } from '../oauth/state';
import { META_APP_ID, META_APP_SECRET } from './instagram.platform';

/**
 * Facebook Pages publishing.
 *
 * Shares the same Meta App credentials (META_APP_ID / META_APP_SECRET)
 * as the Instagram platform, but:
 *   - asks for different scopes
 *   - stores the Page id + Page access token
 *   - publishes to /{page-id}/feed, /photos, or /videos
 *
 * Required scopes:
 *   pages_show_list, pages_read_engagement,
 *   pages_manage_posts, pages_manage_engagement
 *
 * Docs: https://developers.facebook.com/docs/pages-api/posts
 */

const AUTHORIZE_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_engagement',
];

export class FacebookPlatform implements SocialPlatform {
  readonly id = 'facebook' as any; // 'facebook' added to SocialPlatformId union
  readonly label = 'Facebook Pages';
  readonly supportedMediaTypes = ['TEXT', 'IMAGE', 'VIDEO'] as const;

  isConfigured(): boolean {
    try {
      return Boolean(META_APP_ID.value() && META_APP_SECRET.value());
    } catch {
      return false;
    }
  }

  buildAuthorizeUrl(uid: string, redirectUri: string): OAuthStartResult {
    const nonce = freshNonce();
    const state = encodeState({ uid, platform: 'facebook', nonce });

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', META_APP_ID.value());
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', SCOPES.join(','));
    url.searchParams.set('response_type', 'code');
    return { authorizeUrl: url.toString(), state };
  }

  async handleCallback(
    code: string,
    redirectUri: string,
  ): Promise<OAuthCallbackResult> {
    // Exchange code → user access token
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', META_APP_ID.value());
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET.value());
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);
    const tokRes = await fetch(tokenUrl);
    if (!tokRes.ok) throw new Error(`Facebook token exchange failed: ${tokRes.status}`);
    const { access_token: userToken } = (await tokRes.json()) as {
      access_token: string;
    };

    // Upgrade to long-lived user token.
    const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', META_APP_ID.value());
    longUrl.searchParams.set('client_secret', META_APP_SECRET.value());
    longUrl.searchParams.set('fb_exchange_token', userToken);
    const longRes = await fetch(longUrl);
    const { access_token: longLived, expires_in } = (await longRes.json()) as {
      access_token: string;
      expires_in?: number;
    };

    // Fetch the user's Pages — pick the first one.
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?access_token=${encodeURIComponent(longLived)}`,
    );
    const pages = (await pagesRes.json()) as {
      data?: Array<{ id: string; name: string; access_token: string }>;
    };
    const page = pages.data?.[0];
    if (!page) {
      throw new Error('No Facebook Page found on this account.');
    }

    return {
      account: {
        platform: 'facebook' as any,
        accountId: page.id,
        handle: page.name,
        accessToken: page.access_token,
        expiresAt: expires_in
          ? Math.floor(Date.now() / 1000) + expires_in
          : undefined,
        scopes: SCOPES,
        connectedAt: Math.floor(Date.now() / 1000),
      },
    };
  }

  async publish(
    account: SocialAccount,
    req: SocialPublishRequest,
  ): Promise<SocialPublishResult> {
    const base = `${GRAPH_BASE}/${account.accountId}`;
    const token = account.accessToken;

    if (req.mediaType === 'TEXT') {
      const res = await fetch(`${base}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          message: req.caption ?? '',
          access_token: token,
        }).toString(),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: { message: string };
      };
      if (!data.id) throw new Error(`Facebook publish error: ${data.error?.message}`);
      return { remoteId: data.id };
    }

    if (req.mediaType === 'IMAGE') {
      if (!req.imageUrl) throw new Error('imageUrl required');
      const res = await fetch(`${base}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          url: req.imageUrl,
          caption: req.caption ?? '',
          access_token: token,
        }).toString(),
      });
      const data = (await res.json()) as {
        id?: string;
        post_id?: string;
        error?: { message: string };
      };
      if (!data.id) throw new Error(`Facebook photo error: ${data.error?.message}`);
      return { remoteId: data.post_id ?? data.id };
    }

    if (req.mediaType === 'VIDEO') {
      if (!req.videoUrl) throw new Error('videoUrl required');
      const res = await fetch(`${base}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          file_url: req.videoUrl,
          description: req.caption ?? '',
          access_token: token,
        }).toString(),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: { message: string };
      };
      if (!data.id) throw new Error(`Facebook video error: ${data.error?.message}`);
      return { remoteId: data.id };
    }

    throw new Error(`Unsupported Facebook mediaType: ${req.mediaType}`);
  }
}
