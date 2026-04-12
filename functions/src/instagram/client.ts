import { defineSecret } from 'firebase-functions/params';

/**
 * Instagram Graph API credentials. Set them as Firebase secrets:
 *   firebase functions:secrets:set INSTAGRAM_ACCESS_TOKEN
 *   firebase functions:secrets:set INSTAGRAM_BUSINESS_ID
 *
 * The access token must be a long-lived token for a Facebook user that
 * administers a Page connected to the Instagram Business account.
 */
export const INSTAGRAM_ACCESS_TOKEN = defineSecret('INSTAGRAM_ACCESS_TOKEN');
export const INSTAGRAM_BUSINESS_ID = defineSecret('INSTAGRAM_BUSINESS_ID');

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

interface CreateMediaContainerParams {
  imageUrl: string;
  caption?: string;
}

interface GraphResponse<T = any> {
  id?: string;
  error?: { message: string; type: string; code: number };
  data?: T;
}

async function graphCall<T = any>(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, string>,
): Promise<GraphResponse<T>> {
  const url = `${GRAPH_BASE}${path}`;
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    init.body = new URLSearchParams(body).toString();
  }
  const res = await fetch(url, init);
  const json = (await res.json()) as GraphResponse<T>;
  if (!res.ok || json.error) {
    throw new Error(
      `Instagram Graph API error: ${json.error?.message ?? res.statusText}`,
    );
  }
  return json;
}

/**
 * Step 1: upload a media container referencing the image URL.
 * The image must be publicly reachable (e.g. Firebase Storage signed URL).
 */
export async function createMediaContainer(
  params: CreateMediaContainerParams,
): Promise<string> {
  const businessId = INSTAGRAM_BUSINESS_ID.value();
  const token = INSTAGRAM_ACCESS_TOKEN.value();

  const body: Record<string, string> = {
    image_url: params.imageUrl,
    access_token: token,
  };
  if (params.caption) body.caption = params.caption;

  const res = await graphCall<{ id: string }>(
    `/${businessId}/media`,
    'POST',
    body,
  );
  if (!res.id) throw new Error('Instagram did not return a media container id');
  return res.id;
}

/**
 * Step 2: publish the previously created container.
 */
export async function publishMediaContainer(
  creationId: string,
): Promise<string> {
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

/**
 * Convenience: create + publish in one step.
 */
export async function publishImage(
  imageUrl: string,
  caption?: string,
): Promise<{ creationId: string; mediaId: string }> {
  const creationId = await createMediaContainer({ imageUrl, caption });
  const mediaId = await publishMediaContainer(creationId);
  return { creationId, mediaId };
}
