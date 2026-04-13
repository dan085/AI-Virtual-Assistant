/**
 * Tests for the video generator providers.
 *
 * Uses the node:test runner. Only the deterministic mock provider is
 * unit-tested — the real providers hit external APIs and are better
 * exercised with integration tests against their respective sandboxes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { MockVideoProvider } from '../video/providers/mock.provider';
import {
  getVideoProvider,
  listProviders,
  pickAvailableProvider,
} from '../video/generator.registry';

test('MockVideoProvider reports as configured', () => {
  const p = new MockVideoProvider();
  assert.equal(p.isConfigured(), true);
  assert.equal(p.id, 'mock');
});

test('MockVideoProvider submit → queued then progresses then succeeds', async () => {
  const p = new MockVideoProvider();
  const job = await p.submit({
    prompt: 'a cat doing taxes',
    aspectRatio: '9:16',
    durationSeconds: 6,
  });
  assert.equal(job.status, 'queued');
  assert.ok(job.providerJobId.startsWith('mock_'));

  // Immediately after submit → still queued.
  const s1 = await p.getStatus(job.providerJobId);
  assert.equal(s1.status, 'queued');

  // Fast-forward the mock's perceived time by monkey-patching Date.now.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 9_000; // > 8s threshold
    const s2 = await p.getStatus(job.providerJobId);
    assert.equal(s2.status, 'succeeded');
    assert.ok(s2.videoUrl?.startsWith('https://'));
  } finally {
    Date.now = realNow;
  }
});

test('MockVideoProvider getStatus of unknown id fails gracefully', async () => {
  const p = new MockVideoProvider();
  const res = await p.getStatus('does-not-exist');
  assert.equal(res.status, 'failed');
  assert.ok(res.errorMessage);
});

test('listProviders returns all known providers with configured flag', () => {
  const list = listProviders();
  const ids = list.map((p) => p.id).sort();
  assert.deepEqual(ids, ['mock', 'runway', 'seedance', 'veo']);
  // Mock is always configured; the real ones depend on secrets.
  assert.equal(list.find((p) => p.id === 'mock')?.configured, true);
});

test('pickAvailableProvider falls back to mock when real providers are not configured', () => {
  const p = pickAvailableProvider();
  // In this test environment no secrets are set, so the fallback kicks in.
  assert.equal(p.id, 'mock');
});

test('getVideoProvider throws on unknown id', () => {
  assert.throws(() => getVideoProvider('nope'), /Unknown video provider/);
});
