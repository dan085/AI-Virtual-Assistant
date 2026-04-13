import test from 'node:test';
import assert from 'node:assert/strict';

import { MockImageProvider } from '../image/providers/mock.provider';
import {
  listImageProviders,
  pickAvailableImageProvider,
  getImageProvider,
} from '../image/generator.registry';

test('MockImageProvider is deterministic on prompt', async () => {
  const p = new MockImageProvider();
  const a = await p.generate({ prompt: 'a sunset over Valparaíso', aspectRatio: '1:1' });
  const b = await p.generate({ prompt: 'a sunset over Valparaíso', aspectRatio: '1:1' });
  assert.equal(a.url, b.url, 'Same prompt should produce same URL');
});

test('MockImageProvider respects aspect ratio dimensions', async () => {
  const p = new MockImageProvider();
  const square = await p.generate({ prompt: 'x', aspectRatio: '1:1' });
  const vertical = await p.generate({ prompt: 'x', aspectRatio: '9:16' });
  const horizontal = await p.generate({ prompt: 'x', aspectRatio: '16:9' });
  assert.match(square.url, /\/1024\/1024$/);
  assert.match(vertical.url, /\/720\/1280$/);
  assert.match(horizontal.url, /\/1280\/720$/);
});

test('listImageProviders enumerates all providers', () => {
  const list = listImageProviders();
  const ids = list.map((p) => p.id).sort();
  assert.deepEqual(ids, ['dalle', 'imagen', 'mock', 'replicate']);
});

test('pickAvailableImageProvider falls back to mock', () => {
  const p = pickAvailableImageProvider();
  assert.equal(p.id, 'mock');
});

test('getImageProvider throws on unknown id', () => {
  assert.throws(() => getImageProvider('nope'), /Unknown image provider/);
});
