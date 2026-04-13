/**
 * Seed the Firestore `agents` collection with the builtin agent
 * definitions so they can be edited at runtime from the console.
 *
 * Usage (from the repo root):
 *
 *   cd functions
 *   npm run build
 *   # Option A — against the emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *     node lib/seed/seed-agents.js
 *
 *   # Option B — against production (requires GOOGLE_APPLICATION_CREDENTIALS
 *   # pointing to a valid service account file OR gcloud auth):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *     GCLOUD_PROJECT=your-project-id \
 *     node lib/seed/seed-agents.js
 *
 * The script is idempotent — re-running it only overwrites fields that
 * exist in BUILTIN_AGENTS, leaving any extra Firestore fields alone.
 */

import { getAdminApp, db } from '../lib/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { BUILTIN_AGENTS } from '../agent/registry';

async function main() {
  getAdminApp();

  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    '(unknown)';
  // eslint-disable-next-line no-console
  console.log(`Seeding agents into project: ${projectId}`);

  const col = db().collection('agents');
  const batch = db().batch();
  let count = 0;

  for (const agent of Object.values(BUILTIN_AGENTS)) {
    const ref = col.doc(agent.id);
    batch.set(
      ref,
      {
        id: agent.id,
        displayName: agent.displayName,
        tagline: agent.tagline,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        skills: agent.skills,
        defaultLocale: agent.defaultLocale,
        published: agent.published,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    count++;
    // eslint-disable-next-line no-console
    console.log(`  • ${agent.id} (${agent.displayName}) — ${agent.skills.length} skills`);
  }

  await batch.commit();
  // eslint-disable-next-line no-console
  console.log(`\n✓ Seeded ${count} agents.`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
