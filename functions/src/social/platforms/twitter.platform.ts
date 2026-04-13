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
import { createPkcePair, savePkceVerifier, consumePkceVerifier } from '../oauth/pkce-store';

/**
 * Twitter / X — OAuth 2.0 with PKCE for auth + v2 tweets + v1.1 media upload.
 *
 * Media attachment flow (v1.1 chunked upload):
 *   INIT → returns media_id
 *   APPEND (one or more segments) → uploads the bytes
 *   FINALIZE → marks complete, returns processing_info for async media
 *   (optional) STATUS until state === 'succeeded'
 *   Then: POST /2/tweets with { text, media: { media_ids: [id] } }
 *
 * NOTE: v1.1 media upload uses OAuth 1.0a authentication normally, but
 * Twitter also accepts OAuth 2.0 user context tokens for the media
 * upload endpoint. We use the same Bearer token we get from the OAuth
 * 2.0 flow. If your app was created before media upload was enabled
 * on OAuth 2.0, you may need to migrate or use the deprecated
 * `1.1/media/upload.json` endpoint with app-only credentials.
 */

export const TWITTER_CLIENT_ID = defineSecret('TWITTER_CLIENT_ID');
export const TWITTER_CLIENT_SECRET = defineSecret('TWITTER_CLIENT_SECRET');

const AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const ME_URL = 'https://api.x.com/2/users/me';
const TWEETS_URL = 'https://api.x.com/2/tweets';
const MEDIA_UPLOAD_URL = 'https://upload.x.com/1.1/media/upload.json';

const SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access',
  'media.write',
];

// Twitter media type mapping
const MEDIA_CATEGORY: Record<string, string> = {
  'image/jpeg': 'tweet_image',
  'image/jpg': 'tweet_image',
  'image/png': 'tweet_image',
  'image/webp': 'tweet_image',
  'image/gif': 'tweet_gif',
  'video/mp4': 'tweet_video',
  'video/quicktime': 'tweet_video',
};

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB per APPEND segment

export class TwitterPlatform implements SocialPlatform {
  readonly id = 'twitter' as const;
  readonly label = 'Twitter / X';
  readonly supportedMediaTypes = ['TEXT', 'IMAGE', 'VIDEO'] as const;

  isConfigured(): boolean {
    try {
      return Boolean(TWITTER_CLIENT_ID.value() && TWITTER_CLIENT_SECRET.value());
    } catch {
      return false;
    }
  }

  async buildAuthorizeUrl(
    uid: string,
    redirectUri: string,
  ): Promise<OAuthStartResult> {
    const nonce = freshNonce();
    const { verifier, challenge } = createPkcePair();
    await savePkceVerifier(nonce, verifier);

    const state = encodeState({ uid, platform: this.id, nonce });

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', TWITTER_CLIENT_ID.value());
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return { authorizeUrl: url.toString(), state };
  }

  async handleCallback(
    code: string,
    redirectUri: string,
    ctx: OAuthCallbackContext,
  ): Promise<OAuthCallbackResult> {
    const verifier = await consumePkceVerifier(ctx.nonce);
    if (!verifier) {
      throw new Error('Twitter PKCE verifier missing or expired — start the flow again.');
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${TWITTER_CLIENT_ID.value()}:${TWITTER_CLIENT_SECRET.value()}`,
          ).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Twitter token exchange failed: ${tokenRes.status} ${text}`);
    }
    const tok = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    const meRes = await fetch(ME_URL, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!meRes.ok) throw new Error('Twitter /users/me failed');
    const me = (await meRes.json()) as { data?: { id: string; username: string } };
    if (!me.data) throw new Error('Twitter /users/me returned no data');

    return {
      account: {
        platform: this.id,
        accountId: me.data.id,
        handle: `@${me.data.username}`,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token,
        expiresAt: tok.expires_in
          ? Math.floor(Date.now() / 1000) + tok.expires_in
          : undefined,
        scopes: tok.scope?.split(' '),
        connectedAt: Math.floor(Date.now() / 1000),
      },
    };
  }

  async publish(
    account: SocialAccount,
    req: SocialPublishRequest,
  ): Promise<SocialPublishResult> {
    let mediaIds: string[] = [];

    if (req.mediaType === 'IMAGE' && req.imageUrl) {
      mediaIds = [await this.uploadMedia(account, req.imageUrl, 'image')];
    } else if (req.mediaType === 'VIDEO' && req.videoUrl) {
      mediaIds = [await this.uploadMedia(account, req.videoUrl, 'video')];
    } else if (req.mediaType !== 'TEXT' && req.mediaType !== 'IMAGE' && req.mediaType !== 'VIDEO') {
      throw new Error(`Twitter publish does not support mediaType ${req.mediaType}`);
    }

    const body: Record<string, unknown> = {
      text: req.caption ?? '',
    };
    if (mediaIds.length) {
      body.media = { media_ids: mediaIds };
    }

    const res = await fetch(TWEETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twitter publish failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { data?: { id: string } };
    if (!data.data) throw new Error('Twitter publish returned no id');
    return {
      remoteId: data.data.id,
      permalink: `https://x.com/${account.handle?.replace(/^@/, '')}/status/${data.data.id}`,
    };
  }

  // ---------------------------------------------------------------
  // v1.1 chunked media upload
  // ---------------------------------------------------------------

  private async uploadMedia(
    account: SocialAccount,
    url: string,
    kind: 'image' | 'video',
  ): Promise<string> {
    const { bytes, contentType } = await fetchBytes(url);
    const mediaCategory =
      MEDIA_CATEGORY[contentType.toLowerCase()] ??
      (kind === 'video' ? 'tweet_video' : 'tweet_image');

    // 1. INIT
    const initRes = await this.formPost(account, MEDIA_UPLOAD_URL, {
      command: 'INIT',
      media_type: contentType,
      total_bytes: String(bytes.length),
      media_category: mediaCategory,
    });
    const initJson = (await initRes.json()) as { media_id_string?: string };
    const mediaId = initJson.media_id_string;
    if (!mediaId) throw new Error('Twitter INIT returned no media_id');

    // 2. APPEND (chunked)
    let segmentIndex = 0;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_SIZE, bytes.length));
      const form = new FormData();
      form.append('command', 'APPEND');
      form.append('media_id', mediaId);
      form.append('segment_index', String(segmentIndex));
      form.append('media', new Blob([chunk], { type: contentType }));
      const appendRes = await fetch(MEDIA_UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${account.accessToken}` },
        body: form,
      });
      if (!appendRes.ok) {
        throw new Error(
          `Twitter APPEND segment ${segmentIndex} failed: ${appendRes.status}`,
        );
      }
      segmentIndex++;
    }

    // 3. FINALIZE
    const finalizeRes = await this.formPost(account, MEDIA_UPLOAD_URL, {
      command: 'FINALIZE',
      media_id: mediaId,
    });
    const finalizeJson = (await finalizeRes.json()) as {
      processing_info?: { state: string; check_after_secs?: number };
    };

    // 4. STATUS polling for async media (mostly videos)
    if (finalizeJson.processing_info) {
      await this.pollMediaStatus(account, mediaId);
    }
    return mediaId;
  }

  private async pollMediaStatus(
    account: SocialAccount,
    mediaId: string,
  ): Promise<void> {
    const started = Date.now();
    const maxWaitMs = 5 * 60 * 1000;
    let interval = 2_000;

    while (Date.now() - started < maxWaitMs) {
      await new Promise((r) => setTimeout(r, interval));
      const res = await fetch(
        `${MEDIA_UPLOAD_URL}?command=STATUS&media_id=${mediaId}`,
        { headers: { Authorization: `Bearer ${account.accessToken}` } },
      );
      if (!res.ok) throw new Error(`Twitter STATUS failed: ${res.status}`);
      const json = (await res.json()) as {
        processing_info?: {
          state: 'pending' | 'in_progress' | 'succeeded' | 'failed';
          check_after_secs?: number;
          error?: { message?: string };
        };
      };
      const info = json.processing_info;
      if (!info) return; // No processing_info = done
      if (info.state === 'succeeded') return;
      if (info.state === 'failed') {
        throw new Error(
          `Twitter media processing failed: ${info.error?.message ?? 'unknown'}`,
        );
      }
      interval = Math.min(
        10_000,
        info.check_after_secs ? info.check_after_secs * 1000 : interval * 2,
      );
    }
    throw new Error('Twitter media processing timed out');
  }

  private formPost(
    account: SocialAccount,
    url: string,
    fields: Record<string, string>,
  ): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields).toString(),
    });
  }
}

async function fetchBytes(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, contentType };
}
