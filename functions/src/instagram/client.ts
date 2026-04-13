import { defineSecret } from 'firebase-functions/params';

/**
 * Instagram Graph API client — supports all media types publishable by
 * the Graph API for Instagram Business accounts:
 *   - IMAGE        (single photo to feed)
 *   - VIDEO        (feed video — legacy; Meta pushes Reels for new content)
 *   - REELS        (Reels video)
 *   - STORIES      (photo OR video story, 9:16)
 *   - CAROUSEL     (up to 10 photos/videos in a single post)
 *
 * Set the credentials with:
 *   firebase functions:secrets:set INSTAGRAM_ACCESS_TOKEN
 *   firebase functions:secrets:set INSTAGRAM_BUSINESS_ID
 *
 * The access token must be a long-lived token for a Facebook user who
 * administers the Page linked to the Instagram Business account.
 */
export const INSTAGRAM_ACCESS_TOKEN = defineSecret('INSTAGRAM_ACCESS_TOKEN');
export const INSTAGRAM_BUSINESS_ID = defineSecret('INSTAGRAM_BUSINESS_ID');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

export type InstagramMediaType =
  | 'IMAGE'
  | 'VIDEO'
  | 'REELS'
  | 'STORIES'
  | 'CAROUSEL';

export interface ContainerStatus {
  id: string;
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  status?: string;
}

async function graphCall<T = any>(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, string>,
): Promise<T> {
  const url = `${GRAPH_BASE}${path}`;
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    init.body = new URLSearchParams(body).toString();
  }
  const res = await fetch(url, init);
  const json = (await res.json()) as { error?: { message: string } } & T;
  if (!res.ok || (json as any).error) {
    const msg = (json as any).error?.message ?? res.statusText;
    throw new Error(`Instagram Graph API error: ${msg}`);
  }
  return json;
}

// -----------------------------------------------------------------
// Container creation — one function per media type
// -----------------------------------------------------------------

export interface CreatePhotoContainerArgs {
  imageUrl: string;
  caption?: string;
  isCarouselItem?: boolean;
}

export async function createPhotoContainer(
  args: CreatePhotoContainerArgs,
): Promise<string> {
  const businessId = INSTAGRAM_BUSINESS_ID.value();
  const token = INSTAGRAM_ACCESS_TOKEN.value();

  const body: Record<string, string> = {
    image_url: args.imageUrl,
    access_token: token,
  };
  if (args.caption) body.caption = args.caption;
  if (args.isCarouselItem) body.is_carousel_item = 'true';

  const res = await graphCall<{ id: string }>(
    `/${businessId}/media`,
    'POST',
    body,
  );
  if (!res.id) throw new Error('Instagram did not return a photo container id');
  return res.id;
}

export interface CreateVideoContainerArgs {
  videoUrl: string;
  caption?: string;
  coverUrl?: string;
  mediaType: 'VIDEO' | 'REELS';
  shareToFeed?: boolean; // Reels only
  isCarouselItem?: boolean;
}

export async function createVideoContainer(
  args: CreateVideoContainerArgs,
): Promise<string> {
  const businessId = INSTAGRAM_BUSINESS_ID.value();
  const token = INSTAGRAM_ACCESS_TOKEN.value();

  const body: Record<string, string> = {
    media_type: args.mediaType,
    video_url: args.videoUrl,
    access_token: token,
  };
  if (args.caption) body.caption = args.caption;
  if (args.coverUrl) body.cover_url = args.coverUrl;
  if (args.mediaType === 'REELS' && args.shareToFeed !== false) {
    body.share_to_feed = 'true';
  }
  if (args.isCarouselItem) body.is_carousel_item = 'true';

  const res = await graphCall<{ id: string }>(
    `/${businessId}/media`,
    'POST',
    body,
  );
  if (!res.id) throw new Error('Instagram did not return a video container id');
  return res.id;
}

export interface CreateStoryContainerArgs {
  imageUrl?: string;
  videoUrl?: string;
}

export async function createStoryContainer(
  args: CreateStoryContainerArgs,
): Promise<string> {
  if (!args.imageUrl && !args.videoUrl) {
    throw new Error('Story container requires imageUrl OR videoUrl');
  }
  const businessId = INSTAGRAM_BUSINESS_ID.value();
  const token = INSTAGRAM_ACCESS_TOKEN.value();

  const body: Record<string, string> = {
    media_type: 'STORIES',
    access_token: token,
  };
  if (args.videoUrl) body.video_url = args.videoUrl;
  else if (args.imageUrl) body.image_url = args.imageUrl;

  const res = await graphCall<{ id: string }>(
    `/${businessId}/media`,
    'POST',
    body,
  );
  if (!res.id) throw new Error('Instagram did not return a story container id');
  return res.id;
}

export interface CreateCarouselContainerArgs {
  childContainerIds: string[];
  caption?: string;
}

export async function createCarouselContainer(
  args: CreateCarouselContainerArgs,
): Promise<string> {
  if (args.childContainerIds.length < 2 || args.childContainerIds.length > 10) {
    throw new Error('Carousel requires between 2 and 10 children');
  }
  const businessId = INSTAGRAM_BUSINESS_ID.value();
  const token = INSTAGRAM_ACCESS_TOKEN.value();

  const body: Record<string, string> = {
    media_type: 'CAROUSEL',
    children: args.childContainerIds.join(','),
    access_token: token,
  };
  if (args.caption) body.caption = args.caption;

  const res = await graphCall<{ id: string }>(
    `/${businessId}/media`,
    'POST',
    body,
  );
  if (!res.id) throw new Error('Instagram did not return a carousel container id');
  return res.id;
}

// -----------------------------------------------------------------
// Container status (required for video — upload + processing takes time)
// -----------------------------------------------------------------

export async function getContainerStatus(
  containerId: string,
): Promise<ContainerStatus> {
  const token = INSTAGRAM_ACCESS_TOKEN.value();
  const res = await graphCall<ContainerStatus>(
    `/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
    'GET',
  );
  return res;
}

/**
 * Poll a container until its status_code becomes FINISHED, ERROR, or
 * EXPIRED. Used for video / reel containers, which need the Graph API
 * to download and transcode the source before they can be published.
 */
export async function waitForContainerReady(
  containerId: string,
  opts: { maxWaitMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const maxWait = opts.maxWaitMs ?? 5 * 60 * 1000;
  const interval = opts.intervalMs ?? 5_000;
  const started = Date.now();

  while (Date.now() - started < maxWait) {
    const status = await getContainerStatus(containerId);
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(
        `Instagram container ${containerId} ${status.status_code}: ${status.status ?? ''}`,
      );
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(
    `Timed out waiting for Instagram container ${containerId} to finish processing`,
  );
}

// -----------------------------------------------------------------
// Publish
// -----------------------------------------------------------------

export async function publishContainer(creationId: string): Promise<string> {
  const businessId = INSTAGRAM_BUSINESS_ID.value();
  const token = INSTAGRAM_ACCESS_TOKEN.value();

  const res = await graphCall<{ id: string }>(
    `/${businessId}/media_publish`,
    'POST',
    {
      creation_id: creationId,
      access_token: token,
    },
  );
  if (!res.id) throw new Error('Instagram did not return a published media id');
  return res.id;
}
