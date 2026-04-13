import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_ID,
  getBuiltinAgent,
} from '../agent/registry';
import { SKILL_CATALOG, SKILL_IDS } from '../agent/tools';

test('BUILTIN_AGENTS includes the core personas', () => {
  const ids = Object.keys(BUILTIN_AGENTS).sort();
  assert.ok(ids.includes('default'));
  assert.ok(ids.includes('dr-pineapple'));
  assert.ok(ids.includes('social-manager'));
  assert.ok(ids.includes('scheduler'));
});

test('getBuiltinAgent returns default when id is unknown', () => {
  const a = getBuiltinAgent('does-not-exist');
  assert.equal(a.id, DEFAULT_AGENT_ID);
});

test('every agent only references known skills', () => {
  const known = new Set<string>(SKILL_IDS);
  for (const [id, agent] of Object.entries(BUILTIN_AGENTS)) {
    for (const skill of agent.skills) {
      assert.ok(
        known.has(skill),
        `Agent "${id}" references unknown skill "${skill}"`,
      );
    }
  }
});

test('Dr. Pineapple has the business-critical skills', () => {
  const a = BUILTIN_AGENTS['dr-pineapple'];
  assert.ok(a.skills.includes('createServiceTicket'));
  assert.ok(a.skills.includes('lookupDevicePricing'));
  assert.ok(a.skills.includes('createReminder'));
});

test('Dr. Pineapple does NOT have Instagram publishing skills', () => {
  const a = BUILTIN_AGENTS['dr-pineapple'];
  assert.equal(
    a.skills.includes('createInstagramDraft'),
    false,
    'Dr. Pineapple is a service-tech agent, not a social media one',
  );
});

test('Nina (social-manager) has the content generation skills', () => {
  const a = BUILTIN_AGENTS['social-manager'];
  assert.ok(a.skills.includes('generateAiVideo'));
  assert.ok(a.skills.includes('generateAiImage'));
  assert.ok(a.skills.includes('planStoryContent'));
  assert.ok(a.skills.includes('createInstagramDraft'));
});

test('SKILL_CATALOG covers every declared skill id', () => {
  for (const id of SKILL_IDS) {
    assert.ok(SKILL_CATALOG[id], `Missing catalog entry for ${id}`);
    assert.equal(SKILL_CATALOG[id].id, id);
  }
});
