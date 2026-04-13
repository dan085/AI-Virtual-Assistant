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
 * Twitter / X — OAuth 2.0 with PKCE.
 *
 * Uses a Firestore-backed PKCE store keyed by the state nonce, so the
 * verifier survives across Cloud Function instances.
 */

export const TWITTER_CLIENT_ID = defineSecret('TWITTER_CLIENT_ID');
export const TWITTER_CLIENT_SECRET = defineSecret('TWITTER_CLIENT_SECRET');

const AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const ME_URL = 'https://api.x.com/2/users/me';
const TWEETS_URL = 'https://api.x.com/2/tweets';

const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

export class TwitterPlatform implements SocialPlatform {
  readonly id = 'twitter' as const;
  readonly label = 'Twitter / X';
  readonly supportedMediaTypes = ['TEXT', 'IMAGE'] as const;

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
    if (req.mediaType !== 'TEXT' && req.mediaType !== 'IMAGE') {
      throw new Error(`Twitter publish does not support mediaType ${req.mediaType}`);
    }
    // TODO: media upload via v1.1 /media/upload endpoint.
    const body: Record<string, unknown> = {
      text: req.caption ?? '',
    };

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
}
