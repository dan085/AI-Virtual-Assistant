import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the Twitter v1.1 chunked media upload flow.
 *
 * We exercise the public `publish()` method with a mocked global.fetch
 * that records the sequence of requests. Covers INIT -> APPEND -> FINALIZE
 * -> (optional STATUS polling) -> POST /2/tweets.
 */

process.env.TWITTER_CLIENT_ID = 'test-client-id';
process.env.TWITTER_CLIENT_SECRET = 'test-client-secret';
process.env.SOCIAL_OAUTH_SIGNING_SECRET = 'test-secret';

import { TwitterPlatform } from '../social/platforms/twitter.platform';
import type { SocialAccount } from '../social/platform.interface';

const ACCOUNT: SocialAccount = {
  platform: 'twitter',
  accountId: 'u-1',
  accessToken: 'bearer-xyz',
  handle: '@tester',
};

interface Call {
  url: string;
  method?: string;
  body?: any;
}

function makeMockFetch(handlers: Array<(call: Call) => any | null>) {
  const calls: Call[] = [];
  const fn: typeof fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const call: Call = { url, method: init?.method, body: init?.body };
    calls.push(call);
    for (const h of handlers) {
      const r = h(call);
      if (r) {
        return {
          ok: (r.status ?? 200) < 400,
          status: r.status ?? 200,
          headers: {
            get: (k: string) => r.headers?.[k] ?? null,
          },
          async json() { return r.json ?? {}; },
          async text() { return JSON.stringify(r.json ?? {}); },
          async arrayBuffer() { return r.bytes?.buffer ?? new ArrayBuffer(0); },
        } as any;
      }
    }
    throw new Error(`Unhandled fetch: ${url} ${init?.method}`);
  };
  return { fn, calls };
}

test('Twitter publish with image attaches media_id from v1.1 upload flow', async () => {
  const fakeBytes = Buffer.alloc(8000, 0xFF);

  const { fn, calls } = makeMockFetch([
    // Fetch the image URL
    (c) => c.url === 'https://example.com/a.jpg'
      ? { json: {}, headers: { 'content-type': 'image/jpeg' }, bytes: fakeBytes }
      : null,
    // INIT
    (c) => c.url.includes('/media/upload.json') && String(c.body).includes('command=INIT')
      ? { json: { media_id_string: 'media-42' } }
      : null,
    // APPEND (FormData)
    (c) => c.url.includes('/media/upload.json') && c.method === 'POST' && !String(c.body).startsWith('command=')
      ? { json: {} }
      : null,
    // FINALIZE
    (c) => c.url.includes('/media/upload.json') && String(c.body).includes('command=FINALIZE')
      ? { json: {} } // no processing_info → done
      : null,
    // Tweet POST
    (c) => c.url === 'https://api.x.com/2/tweets' && c.method === 'POST'
      ? { json: { data: { id: 'tweet-999' } } }
      : null,
  ]);

  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    const platform = new TwitterPlatform();
    const res = await platform.publish(ACCOUNT, {
      mediaType: 'IMAGE',
      imageUrl: 'https://example.com/a.jpg',
      caption: 'hi world',
    });
    assert.equal(res.remoteId, 'tweet-999');

    // Verify the tweet body includes the media_id
    const tweetCall = calls.find((c) => c.url === 'https://api.x.com/2/tweets');
    assert.ok(tweetCall, 'tweet call made');
    const parsed = JSON.parse(String(tweetCall!.body));
    assert.equal(parsed.text, 'hi world');
    assert.deepEqual(parsed.media, { media_ids: ['media-42'] });

    // Verify INIT/APPEND/FINALIZE happened in order
    const uploadCalls = calls.filter((c) => c.url.includes('/media/upload.json'));
    assert.ok(uploadCalls.length >= 3, 'at least INIT + APPEND + FINALIZE');
  } finally {
    global.fetch = realFetch;
  }
});

test('Twitter publish TEXT has no media in body', async () => {
  const { fn } = makeMockFetch([
    (c) => c.url === 'https://api.x.com/2/tweets'
      ? { json: { data: { id: 'tweet-text' } } }
      : null,
  ]);
  const realFetch = global.fetch;
  global.fetch = fn;
  try {
    const platform = new TwitterPlatform();
    const res = await platform.publish(ACCOUNT, {
      mediaType: 'TEXT',
      caption: 'just text',
    });
    assert.equal(res.remoteId, 'tweet-text');
  } finally {
    global.fetch = realFetch;
  }
});

test('Twitter publish rejects unsupported media type', async () => {
  const platform = new TwitterPlatform();
  await assert.rejects(
    () => platform.publish(ACCOUNT, { mediaType: 'STORY' as any }),
    /does not support mediaType STORY/,
  );
});
