import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { requireAuth, wrapError } from '../lib/errors';
import { SKILL_IDS } from '../agent/tools';

/**
 * Admin API to edit agents in the Firestore catalog.
 *
 * Access control: requires the caller to have a custom claim
 * `admin === true` on their Firebase Auth user. Set it with:
 *   await admin.auth().setCustomUserClaims(uid, { admin: true });
 *
 * Writes are restricted to the published display fields + prompt +
 * skills array. Unknown skill ids are rejected.
 */

function requireAdmin(auth: { token?: any; uid?: string } | undefined): string {
  const uid = requireAuth(auth);
  const isAdmin = auth?.token?.admin === true;
  if (!isAdmin) {
    throw new HttpsError('permission-denied', 'Admin role required');
  }
  return uid;
}

const UpdateAgentSchema = z.object({
  id: z.string().min(1).max(64),
  displayName: z.string().min(1).max(80).optional(),
  tagline: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().max(8000).optional(),
  skills: z.array(z.string()).max(20).optional(),
  published: z.boolean().optional(),
});

export const adminUpdateAgent = onCall(
  { timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    requireAdmin(request.auth);
    const parsed = UpdateAgentSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.message);
    }
    const { id, skills, ...rest } = parsed.data;

    if (skills) {
      const valid = new Set<string>(SKILL_IDS);
      const bad = skills.filter((s) => !valid.has(s));
      if (bad.length) {
        throw new HttpsError(
          'invalid-argument',
          `Unknown skills: ${bad.join(', ')}`,
        );
      }
    }

    try {
      await db().collection('agents').doc(id).set(
        {
          ...rest,
          ...(skills ? { skills } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { ok: true, id };
    } catch (err) {
      wrapError(err, 'Failed to update agent');
    }
  },
);

export const adminListAllAgents = onCall(
  { timeoutSeconds: 20, memory: '256MiB' },
  async (request) => {
    requireAdmin(request.auth);
    const snap = await db().collection('agents').get();
    return {
      agents: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    };
  },
);
