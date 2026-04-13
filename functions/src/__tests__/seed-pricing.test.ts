import test from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG } from '../seed/seed-pricing';

test('Pricing catalog is non-empty', () => {
  assert.ok(CATALOG.length > 0);
});

test('Every entry has a valid price range and matching id', () => {
  const families = new Set(['iphone', 'ipad', 'mac', 'apple_watch', 'airpods']);
  for (const entry of CATALOG) {
    assert.ok(
      families.has(entry.deviceFamily),
      `Unknown family: ${entry.deviceFamily}`,
    );
    assert.equal(typeof entry.minPrice, 'number');
    assert.equal(typeof entry.maxPrice, 'number');
    assert.ok(entry.minPrice >= 0, `${entry.id}: min < 0`);
    assert.ok(entry.maxPrice >= entry.minPrice, `${entry.id}: max < min`);
    assert.equal(entry.currency.length, 3);
    assert.match(entry.id, /^[a-z_]+__[a-z_]+$/);
    assert.ok(
      entry.id.startsWith(`${entry.deviceFamily}__`),
      `Id prefix mismatch for ${entry.id}`,
    );
  }
});

test('Catalog includes key iPhone repairs', () => {
  const ids = new Set(CATALOG.map((e) => e.id));
  assert.ok(ids.has('iphone__screen_replacement'));
  assert.ok(ids.has('iphone__battery_replacement'));
  assert.ok(ids.has('iphone__liquid_damage'));
});

test('No duplicate document ids', () => {
  const ids = CATALOG.map((e) => e.id);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size, 'Duplicate pricing ids detected');
});

test('Every entry has a non-empty notes field or is purely a range', () => {
  for (const entry of CATALOG) {
    if (entry.notes !== undefined) {
      assert.ok(entry.notes.length > 0, `${entry.id}: empty notes`);
    }
  }
});
