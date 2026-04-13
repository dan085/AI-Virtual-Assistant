import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Smoke test for the ticket code generator + schema shape.
 *
 * We exercise the private generateTicketCode function by stubbing the
 * admin db and firing the tool. Keeps the test independent of the
 * Admin SDK.
 */

process.env.SOCIAL_OAUTH_SIGNING_SECRET = 'test-secret-do-not-use-in-prod-42';

const writes: Array<{ path: string; data: any }> = [];

function fakeRef(path: string): any {
  return {
    path,
    id: path.split('/').pop(),
    async set(data: any) {
      writes.push({ path, data });
    },
  };
}
function fakeCol(parent: string): any {
  let i = 0;
  return {
    doc: (id?: string) => fakeRef(`${parent}/${id ?? `auto_${++i}`}`),
  };
}
const fakeDb: any = {
  collection: (name: string) => ({
    doc: (uid: string) => ({
      collection: (subname: string) => fakeCol(`users/${uid}/${subname}`),
    }),
  }),
};

import * as adminModule from '../lib/admin';
(adminModule as any).db = () => fakeDb;

// Build a tiny genkit shim so the tool can be instantiated without real Genkit.
const fakeAi: any = {
  defineTool: (_spec: any, fn: any) => fn,
};

import { defineServiceTicketTool } from '../agent/tools/service-ticket.tool';

test('createServiceTicket tool writes a ticket with a DP-XXXXXX code', async () => {
  writes.length = 0;
  const tool = defineServiceTicketTool(fakeAi, {
    uid: 'user-abc',
    conversationId: 'conv-1',
  });
  const res = await tool({
    deviceFamily: 'iphone',
    deviceModel: 'iPhone 13 Pro',
    symptoms: 'Battery drains in 2 hours after iOS 17.5.1',
    preferredContactMethod: 'whatsapp',
    liquidDamage: false,
    physicalDamage: false,
    urgency: 'normal',
  });
  assert.match(res.ticketCode, /^DP-[A-Z2-9]{6}$/);
  assert.equal(res.status, 'open');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.device.model, 'iPhone 13 Pro');
});

test('createServiceTicket gives liquid damage urgent next steps', async () => {
  const tool = defineServiceTicketTool(fakeAi, { uid: 'u', conversationId: 'c' });
  const res = await tool({
    deviceFamily: 'iphone',
    deviceModel: 'iPhone 12',
    symptoms: 'Fell in the pool',
    preferredContactMethod: 'phone',
    liquidDamage: true,
    physicalDamage: false,
    urgency: 'high',
  });
  assert.match(res.nextSteps, /NOT charge/);
});

test('createServiceTicket generates unique codes across invocations', async () => {
  const tool = defineServiceTicketTool(fakeAi, { uid: 'u', conversationId: 'c' });
  const codes = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const res = await tool({
      deviceFamily: 'ipad',
      deviceModel: 'iPad Air',
      symptoms: 'x',
      preferredContactMethod: 'email',
      liquidDamage: false,
      physicalDamage: false,
      urgency: 'low',
    });
    codes.add(res.ticketCode);
  }
  // Birthday paradox on ~30 samples from 32^6 space — collisions
  // essentially impossible.
  assert.equal(codes.size, 30);
});
