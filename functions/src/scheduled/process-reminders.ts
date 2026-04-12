import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * Scheduled job — runs every minute and delivers due reminders.
 *
 * Uses a Firestore collection-group query to find any
 * `users/{uid}/reminders/{reminderId}` document with
 *   status == 'pending' && remindAt <= now
 *
 * Each due reminder is:
 *   1. Moved to `status: 'delivered'` with a deliveredAt timestamp.
 *   2. Mirrored into a `users/{uid}/notifications` document so the
 *      frontend can surface it in the bell icon.
 *
 * Hooking this up to FCM / email / SMS is intentionally out of scope
 * for the scaffold — just swap the `mirrorAsNotification` call below.
 */
export const processDueReminders = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const now = Timestamp.now();
    const snap = await db()
      .collectionGroup('reminders')
      .where('status', '==', 'pending')
      .where('remindAt', '<=', now)
      .limit(200)
      .get();

    if (snap.empty) return;

    const batch = db().batch();
    let count = 0;

    for (const doc of snap.docs) {
      const reminderRef = doc.ref;
      const data = doc.data();

      // reminderRef.path is users/{uid}/reminders/{id} — pull the uid out.
      const parts = reminderRef.path.split('/');
      const uid = parts[1];
      if (!uid) continue;

      batch.update(reminderRef, {
        status: 'delivered',
        deliveredAt: FieldValue.serverTimestamp(),
      });

      const notifRef = db()
        .collection('users').doc(uid)
        .collection('notifications').doc();
      batch.set(notifRef, {
        kind: 'reminder',
        reminderId: doc.id,
        title: data.title ?? 'Reminder',
        body: data.notes ?? '',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      count++;
    }

    await batch.commit();
    // eslint-disable-next-line no-console
    console.log(`[process-reminders] delivered ${count} reminders`);
  },
);
