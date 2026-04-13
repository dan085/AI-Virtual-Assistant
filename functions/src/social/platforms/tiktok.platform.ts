import { defineSecret } from 'firebase-functions/params';
import {
  OAuthCallbackContext,
  OAuthCallbackResult,
  OAuthStartResult,
  SocialAccount,
  SocialPlatform,
  SocialPublishRequest,
  SocialPublishResult,
} from '../platform.interface';
import { encodeState, freshNonce } from '../oauth/state';

/**
 * TikTok Content Posting API.
 *
 * Developer portal: https://developers.tiktok.com/
 *
 * Required app registration steps:
 *   1. Create an app on https://developers.tiktok.com/apps
 *   2. Enable "Login Kit for Web" and add the Cloud Functions redirect URI
 *      (e.g. https://<your-project>.web.app/api/oauth/tiktok/callback).
 *   3. Enable "Content Posting API" — scopes:
 *        video.upload         (upload to user's inbox draft)
 *        video.publish        (direct publish — requires review & approval)
 *        user.info.basic
 *   4. Save the Client Key and Client Secret as Firebase secrets:
 *        firebase functions:secrets:set TIKTOK_CLIENT_KEY
 *        firebase functions:secrets:set TIKTOK_CLIENT_SECRET
 *
 * IMPORTANT: `video.publish` (direct post) is NOT granted by default.
 * Until Meta approves your app, uploads go to the user's draft inbox —
 * the user must open TikTok to finalize and publish.
 *
 * Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
 */

export const TIKTOK_CLIENT_KEY = defineSecret('TIKTOK_CLIENT_KEY');
export const TIKTOK_CLIENT_SECRET = defineSecret('TIKTOK_CLIENT_SECRET');

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
const VIDEO_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
const VIDEO_STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

const SCOPES = ['user.info.basic', 'video.upload', 'video.publish'];

export class TiktokPlatform implements SocialPlatform {
  readonly id = 'tiktok' as const;
  readonly label = 'TikTok';
  readonly supportedMediaTypes = ['VIDEO', 'REEL_OR_SHORT'] as const;

  isConfigured(): boolean {
    try {
      return Boolean(TIKTOK_CLIENT_KEY.value() && TIKTOK_CLIENT_SECRET.value());
    } catch {
      return false;
    }
  }

  async buildAuthorizeUrl(
    uid: string,
    redirectUri: string,
  ): Promise<OAuthStartResult> {
    const nonce = freshNonce();
    const state = encodeState({ uid, platform: this.id, nonce });

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_key', TIKTOK_CLIENT_KEY.value());
    url.searchParams.set('scope', SCOPES.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);

    return { authorizeUrl: url.toString(), state };
  }

  async handleCallback(
    code: string,
    redirectUri: string,
    _ctx: OAuthCallbackContext,
  ): Promise<OAuthCallbackResult> {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY.value(),
        client_secret: TIKTOK_CLIENT_SECRET.value(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`TikTok token exchange failed: ${tokenRes.status} ${text}`);
    }
    const tok = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
      scope?: string;
    };

    const infoRes = await fetch(
      `${USER_INFO_URL}?fields=open_id,union_id,avatar_url,display_name`,
      { headers: { Authorization: `Bearer ${tok.access_token}` } },
    );
    const info = (await infoRes.json()) as {
      data?: { user?: { open_id: string; display_name?: string } };
    };
    const openId = info.data?.user?.open_id ?? tok.open_id ?? '';
    const displayName = info.data?.user?.display_name;

    return {
      account: {
        platform: this.id,
        accountId: openId,
        handle: displayName,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token,
        expiresAt: tok.expires_in
          ? Math.floor(Date.now() / 1000) + tok.expires_in
          : undefined,
        scopes: tok.scope?.split(','),
        connectedAt: Math.floor(Date.now() / 1000),
      },
    };
  }

  async publish(
    account: SocialAccount,
    req: SocialPublishRequest,
  ): Promise<SocialPublishResult> {
    if (!req.videoUrl) {
      throw new Error('TikTok publish requires videoUrl');
    }

    // Step 1: init the post. We use PULL_FROM_URL so TikTok downloads
    // the video from our URL instead of requiring chunked upload.
    const initBody = {
      post_info: {
        title: req.caption ?? '',
        privacy_level: 'SELF_ONLY', // safest default; bump to PUBLIC_TO_EVERYONE after review
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: req.videoUrl,
      },
    };

    const initRes = await fetch(VIDEO_INIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(initBody),
    });
    if (!initRes.ok) {
      const text = await initRes.text();
      throw new Error(`TikTok init failed: ${initRes.status} ${text}`);
    }
    const init = (await initRes.json()) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };
    if (!init.data?.publish_id) {
      throw new Error(`TikTok init error: ${init.error?.message ?? 'unknown'}`);
    }

    return {
      remoteId: init.data.publish_id,
      meta: {
        status: 'processing',
        hint: 'TikTok is downloading and processing the video. Check status via /v2/post/publish/status/fetch/.',
        statusUrl: VIDEO_STATUS_URL,
      },
    };
  }
}
