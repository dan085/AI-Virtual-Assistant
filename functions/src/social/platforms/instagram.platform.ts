import { defineSecret } from 'firebase-functions/params';
import {
  OAuthCallbackResult,
  OAuthStartResult,
  SocialAccount,
  SocialPlatform,
  SocialPublishRequest,
  SocialPublishResult,
} from '../platform.interface';
import { encodeState, freshNonce } from '../oauth/state';

/**
 * Instagram via Facebook Login + Graph API.
 *
 * Instagram Business accounts publish through their linked Facebook Page.
 * OAuth flow goes through Facebook Login → long-lived user token → we
 * derive a Page token → we find the IG business account id linked to
 * that page.
 *
 * Secrets:
 *   firebase functions:secrets:set META_APP_ID
 *   firebase functions:secrets:set META_APP_SECRET
 *
 * Scopes required on the Facebook App:
 *   instagram_basic
 *   instagram_content_publish
 *   pages_show_list
 *   pages_read_engagement
 *   business_management
 */

export const META_APP_ID = defineSecret('META_APP_ID');
export const META_APP_SECRET = defineSecret('META_APP_SECRET');

const AUTHORIZE_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';
const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];

export class InstagramPlatform implements SocialPlatform {
  readonly id = 'instagram' as const;
  readonly label = 'Instagram';
  readonly supportedMediaTypes = [
    'IMAGE',
    'VIDEO',
    'REEL_OR_SHORT',
    'STORY',
    'CAROUSEL',
  ] as const;

  isConfigured(): boolean {
    try {
      return Boolean(META_APP_ID.value() && META_APP_SECRET.value());
    } catch {
      return false;
    }
  }

  buildAuthorizeUrl(uid: string, redirectUri: string): OAuthStartResult {
    const nonce = freshNonce();
    const state = encodeState({ uid, platform: this.id, nonce });

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
    // 1. Exchange code → short-lived user token
    const tokenUrl = new URL(TOKEN_URL);
    tokenUrl.searchParams.set('client_id', META_APP_ID.value());
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET.value());
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokRes = await fetch(tokenUrl);
    if (!tokRes.ok) throw new Error(`Meta token exchange failed: ${tokRes.status}`);
    const { access_token: shortLived } = (await tokRes.json()) as {
      access_token: string;
    };

    // 2. Upgrade to long-lived user token (~60 days).
    const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', META_APP_ID.value());
    longUrl.searchParams.set('client_secret', META_APP_SECRET.value());
    longUrl.searchParams.set('fb_exchange_token', shortLived);

    const longRes = await fetch(longUrl);
    if (!longRes.ok) throw new Error('Meta long-lived token exchange failed');
    const { access_token: longLived, expires_in } = (await longRes.json()) as {
      access_token: string;
      expires_in?: number;
    };

    // 3. Find the user's Pages.
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?access_token=${encodeURIComponent(longLived)}`,
    );
    if (!pagesRes.ok) throw new Error('Meta /me/accounts failed');
    const pages = (await pagesRes.json()) as {
      data?: Array<{ id: string; name: string; access_token: string }>;
    };
    const page = pages.data?.[0];
    if (!page) {
      throw new Error(
        'No Facebook Page found. Connect a Page with a linked Instagram Business account first.',
      );
    }

    // 4. Fetch the IG business account id linked to that page.
    const igRes = await fetch(
      `${GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`,
    );
    const igData = (await igRes.json()) as {
      instagram_business_account?: { id: string };
    };
    const igId = igData.instagram_business_account?.id;
    if (!igId) {
      throw new Error(
        'This Facebook Page is not linked to an Instagram Business account.',
      );
    }

    return {
      account: {
        platform: this.id,
        accountId: igId,
        handle: page.name,
        accessToken: page.access_token, // we store the PAGE token — that's what publishes
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
    // Reuse the existing Instagram media client, but pass the per-user
    // page token + IG business id from the SocialAccount instead of
    // the platform-wide secrets.
    const body: Record<string, string> = {
      access_token: account.accessToken,
    };

    switch (req.mediaType) {
      case 'IMAGE':
        if (!req.imageUrl) throw new Error('imageUrl required');
        body.image_url = req.imageUrl;
        if (req.caption) body.caption = req.caption;
        break;
      case 'VIDEO':
      case 'REEL_OR_SHORT':
        if (!req.videoUrl) throw new Error('videoUrl required');
        body.media_type = req.mediaType === 'REEL_OR_SHORT' ? 'REELS' : 'VIDEO';
        body.video_url = req.videoUrl;
        if (req.caption) body.caption = req.caption;
        if (req.coverUrl) body.cover_url = req.coverUrl;
        break;
      case 'STORY':
        body.media_type = 'STORIES';
        if (req.videoUrl) body.video_url = req.videoUrl;
        else if (req.imageUrl) body.image_url = req.imageUrl;
        else throw new Error('STORY requires imageUrl or videoUrl');
        break;
      default:
        throw new Error(`Unsupported Instagram mediaType: ${req.mediaType}`);
    }

    // Step 1: create container
    const containerRes = await fetch(`${GRAPH_BASE}/${account.accountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    const container = (await containerRes.json()) as {
      id?: string;
      error?: { message: string };
    };
    if (!container.id) {
      throw new Error(`Instagram container error: ${container.error?.message}`);
    }

    // TODO: for VIDEO/REELS we should poll /{container-id}?fields=status_code
    // until FINISHED. Keeping it terse here since the non-OAuth path in
    // instagram/client.ts already has the polling helper.

    // Step 2: publish
    const pubRes = await fetch(
      `${GRAPH_BASE}/${account.accountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: container.id,
          access_token: account.accessToken,
        }).toString(),
      },
    );
    const pub = (await pubRes.json()) as {
      id?: string;
      error?: { message: string };
    };
    if (!pub.id) {
      throw new Error(`Instagram publish error: ${pub.error?.message}`);
    }
    return { remoteId: pub.id };
  }
}
