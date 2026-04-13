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
 * Instagram via Facebook Login + Graph API.
 *
 * OAuth flow:
 *   1. User grants permissions on facebook.com → code
 *   2. Code → short-lived user token → long-lived user token
 *   3. /me/accounts → list of Pages with their Page tokens
 *   4. /{page}?fields=instagram_business_account → IG Business id
 *   5. We store { accountId: igId, accessToken: pageToken }
 *
 * Publishing flow:
 *   - IMAGE / VIDEO / REELS / STORIES: create container → (wait) → publish
 *   - CAROUSEL: create each child container → (wait for videos) → create
 *     parent with children=<ids> → publish
 */

export const META_APP_ID = defineSecret('META_APP_ID');
export const META_APP_SECRET = defineSecret('META_APP_SECRET');

const AUTHORIZE_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
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

  async buildAuthorizeUrl(
    uid: string,
    redirectUri: string,
  ): Promise<OAuthStartResult> {
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
    _ctx: OAuthCallbackContext,
  ): Promise<OAuthCallbackResult> {
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', META_APP_ID.value());
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET.value());
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);
    const tokRes = await fetch(tokenUrl);
    if (!tokRes.ok) throw new Error(`Meta token exchange failed: ${tokRes.status}`);
    const { access_token: shortLived } = (await tokRes.json()) as {
      access_token: string;
    };

    const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', META_APP_ID.value());
    longUrl.searchParams.set('client_secret', META_APP_SECRET.value());
    longUrl.searchParams.set('fb_exchange_token', shortLived);
    const longRes = await fetch(longUrl);
    const { access_token: longLived, expires_in } = (await longRes.json()) as {
      access_token: string;
      expires_in?: number;
    };

    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?access_token=${encodeURIComponent(longLived)}`,
    );
    const pages = (await pagesRes.json()) as {
      data?: Array<{ id: string; name: string; access_token: string }>;
    };
    const page = pages.data?.[0];
    if (!page) {
      throw new Error(
        'No Facebook Page found. Connect a Page with a linked Instagram Business account first.',
      );
    }

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
    const creationId = await this.createContainer(account, req);
    const mediaId = await this.publishContainer(account, creationId);
    return { remoteId: mediaId };
  }

  // ---------- Container creation ----------

  private async createContainer(
    account: SocialAccount,
    req: SocialPublishRequest,
  ): Promise<string> {
    switch (req.mediaType) {
      case 'IMAGE': {
        if (!req.imageUrl) throw new Error('imageUrl required');
        return this.createSimpleContainer(account, {
          image_url: req.imageUrl,
          caption: req.caption ?? '',
        });
      }

      case 'VIDEO':
      case 'REEL_OR_SHORT': {
        if (!req.videoUrl) throw new Error('videoUrl required');
        const body: Record<string, string> = {
          media_type: req.mediaType === 'REEL_OR_SHORT' ? 'REELS' : 'VIDEO',
          video_url: req.videoUrl,
        };
        if (req.caption) body.caption = req.caption;
        if (req.coverUrl) body.cover_url = req.coverUrl;
        if (req.mediaType === 'REEL_OR_SHORT') body.share_to_feed = 'true';
        const id = await this.createSimpleContainer(account, body);
        await this.waitForContainer(account, id);
        return id;
      }

      case 'STORY': {
        const body: Record<string, string> = { media_type: 'STORIES' };
        if (req.videoUrl) body.video_url = req.videoUrl;
        else if (req.imageUrl) body.image_url = req.imageUrl;
        else throw new Error('STORY requires imageUrl or videoUrl');
        const id = await this.createSimpleContainer(account, body);
        if (req.videoUrl) await this.waitForContainer(account, id);
        return id;
      }

      case 'CAROUSEL': {
        if (!req.children || req.children.length < 2 || req.children.length > 10) {
          throw new Error('CAROUSEL requires 2-10 children');
        }
        const childIds: string[] = [];
        for (const child of req.children) {
          if (child.videoUrl) {
            const id = await this.createSimpleContainer(account, {
              media_type: 'VIDEO',
              video_url: child.videoUrl,
              is_carousel_item: 'true',
            });
            await this.waitForContainer(account, id);
            childIds.push(id);
          } else if (child.imageUrl) {
            const id = await this.createSimpleContainer(account, {
              image_url: child.imageUrl,
              is_carousel_item: 'true',
            });
            childIds.push(id);
          }
        }
        return this.createSimpleContainer(account, {
          media_type: 'CAROUSEL',
          children: childIds.join(','),
          caption: req.caption ?? '',
        });
      }

      default:
        throw new Error(`Unsupported Instagram mediaType: ${req.mediaType}`);
    }
  }

  private async createSimpleContainer(
    account: SocialAccount,
    body: Record<string, string>,
  ): Promise<string> {
    const res = await fetch(`${GRAPH_BASE}/${account.accountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...body,
        access_token: account.accessToken,
      }).toString(),
    });
    const data = (await res.json()) as {
      id?: string;
      error?: { message: string };
    };
    if (!data.id) {
      throw new Error(`Instagram container error: ${data.error?.message}`);
    }
    return data.id;
  }

  /**
   * Poll a container until status_code === FINISHED. Required for
   * VIDEO / REELS / video-STORY because Meta has to download and
   * transcode the source before it can be published.
   */
  private async waitForContainer(
    account: SocialAccount,
    containerId: string,
    opts: { maxWaitMs?: number; intervalMs?: number } = {},
  ): Promise<void> {
    const maxWait = opts.maxWaitMs ?? 5 * 60 * 1000;
    const interval = opts.intervalMs ?? 5_000;
    const started = Date.now();
    while (Date.now() - started < maxWait) {
      const res = await fetch(
        `${GRAPH_BASE}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(account.accessToken)}`,
      );
      const data = (await res.json()) as {
        status_code?: string;
        status?: string;
        error?: { message: string };
      };
      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
        throw new Error(
          `Instagram container ${containerId} ${data.status_code}: ${data.status ?? ''}`,
        );
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`Timed out waiting for container ${containerId}`);
  }

  private async publishContainer(
    account: SocialAccount,
    creationId: string,
  ): Promise<string> {
    const res = await fetch(
      `${GRAPH_BASE}/${account.accountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: creationId,
          access_token: account.accessToken,
        }).toString(),
      },
    );
    const data = (await res.json()) as {
      id?: string;
      error?: { message: string };
    };
    if (!data.id) {
      throw new Error(`Instagram publish error: ${data.error?.message}`);
    }
    return data.id;
  }
}
