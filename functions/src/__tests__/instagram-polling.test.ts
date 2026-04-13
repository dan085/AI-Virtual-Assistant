import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Instagram container polling test.
 *
 * Exercises the private waitForContainer logic by driving the platform
 * end-to-end with a mocked global.fetch that simulates Meta's Graph
 * API responses: first IN_PROGRESS, then FINISHED.
 *
 * No secrets are required because we bypass the provider's real
 * handlers by constructing the platform directly with a canned
 * SocialAccount (Admin SDK is not touched).
 */

process.env.META_APP_ID = 'test-app-id';
process.env.META_APP_SECRET = 'test-app-secret';
process.env.SOCIAL_OAUTH_SIGNING_SECRET = 'test-secret-do-not-use-in-prod-42';

import { InstagramPlatform } from '../social/platforms/instagram.platform';
import type { SocialAccount } from '../social/platform.interface';

const ACCOUNT: SocialAccount = {
  platform: 'instagram',
  accountId: 'ig-business-id-123',
  accessToken: 'page-token-abc',
  handle: 'testbrand',
};

interface FetchCall {
  url: string;
  method?: string;
  body?: string;
}

function makeFetchMock(responses: Array<{ match: RegExp; json: any; status?: number }>) {
  const calls: FetchCall[] = [];
  const fn: typeof fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url, method: init?.method, body: init?.body });
    for (const r of responses) {
      if (r.match.test(url)) {
        return {
          ok: (r.status ?? 200) < 400,
          status: r.status ?? 200,
          json: async () => r.json,
          text: async () => JSON.stringify(r.json),
        } as any;
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return { fn, calls };
}

test('InstagramPlatform.publish (IMAGE) calls create + publish endpoints', async () => {
  const { fn, calls } = makeFetchMock([
    { match: /\/media$/, json: { id: 'container-1' } },
    { match: /\/media_publish$/, json: { id: 'ig-media-9' } },
  ]);
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    const platform = new InstagramPlatform();
    const res = await platform.publish(ACCOUNT, {
      mediaType: 'IMAGE',
      imageUrl: 'https://example.com/a.jpg',
      caption: 'hi',
    });
    assert.equal(res.remoteId, 'ig-media-9');
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes('/ig-business-id-123/media'));
    assert.ok(calls[1].url.includes('/ig-business-id-123/media_publish'));
    assert.ok(calls[1].body?.includes('creation_id=container-1'));
  } finally {
    global.fetch = realFetch;
  }
});

test('InstagramPlatform.publish (REEL_OR_SHORT) polls container until FINISHED', async () => {
  // First status call → IN_PROGRESS, second → FINISHED.
  let statusCalls = 0;
  const fn: typeof fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    // Create container
    if (/\/media$/.test(url) && init?.method === 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'video-container-42' }),
        text: async () => '',
      } as any;
    }
    // Status polling (GET on /{container-id}?fields=status_code,...)
    if (url.includes('/video-container-42?fields=status_code')) {
      statusCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status_code: statusCalls === 1 ? 'IN_PROGRESS' : 'FINISHED',
        }),
        text: async () => '',
      } as any;
    }
    // Publish
    if (/\/media_publish$/.test(url)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'ig-reel-99' }),
        text: async () => '',
      } as any;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    const platform = new InstagramPlatform() as any;
    // Monkey-patch waitForContainer's interval to be fast.
    const origWait = platform.waitForContainer.bind(platform);
    platform.waitForContainer = (acc: any, id: string) =>
      origWait(acc, id, { intervalMs: 1, maxWaitMs: 1000 });

    const res = await platform.publish(ACCOUNT, {
      mediaType: 'REEL_OR_SHORT',
      videoUrl: 'https://example.com/clip.mp4',
      caption: 'new reel',
    });
    assert.equal(res.remoteId, 'ig-reel-99');
    assert.ok(statusCalls >= 2, 'waitForContainer should have polled at least twice');
  } finally {
    global.fetch = realFetch;
  }
});

test('InstagramPlatform.publish (CAROUSEL) creates children then parent', async () => {
  const created: string[] = [];
  let childIdx = 0;
  const fn: typeof fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\/media$/.test(url) && init?.method === 'POST') {
      const body = String(init.body);
      if (body.includes('is_carousel_item=true')) {
        childIdx++;
        const id = `child-${childIdx}`;
        created.push(id);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id }),
          text: async () => '',
        } as any;
      }
      if (body.includes('media_type=CAROUSEL')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'carousel-parent' }),
          text: async () => '',
        } as any;
      }
    }
    if (/\/media_publish$/.test(url)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'ig-carousel-77' }),
        text: async () => '',
      } as any;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    const platform = new InstagramPlatform();
    const res = await platform.publish(ACCOUNT, {
      mediaType: 'CAROUSEL',
      caption: 'swipe →',
      children: [
        { imageUrl: 'https://example.com/1.jpg' },
        { imageUrl: 'https://example.com/2.jpg' },
        { imageUrl: 'https://example.com/3.jpg' },
      ],
    });
    assert.equal(res.remoteId, 'ig-carousel-77');
    assert.equal(created.length, 3);
  } finally {
    global.fetch = realFetch;
  }
});

test('InstagramPlatform.publish rejects unsupported media type', async () => {
  const platform = new InstagramPlatform();
  await assert.rejects(
    () =>
      platform.publish(ACCOUNT, {
        mediaType: 'TEXT' as any,
      }),
    /Unsupported Instagram mediaType/,
  );
});
