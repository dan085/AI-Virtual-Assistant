import { z } from 'zod';
import type { Genkit } from 'genkit';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../../lib/admin';
import type { ToolContext } from './context';

/**
 * Skill: create a reminder for the user at a specific ISO timestamp.
 * A scheduled Cloud Function (out of scope for this scaffold) can later
 * read `users/{uid}/reminders` where `status == "pending"` and
 * `remindAt <= now` to deliver notifications.
 */
export function defineReminderTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'createReminder',
      description:
        'Creates a reminder for the user at a specific time. Use this when the user says "remind me to…" or "set a reminder for…". Always confirm the reminder to the user in your reply.',
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe('Short title of the reminder.'),
        notes: z.string().max(1000).optional(),
        remindAtIso: z
          .string()
          .describe('When to trigger the reminder, as an ISO-8601 datetime string (e.g. "2026-04-15T14:30:00-04:00").'),
      }),
      outputSchema: z.object({
        reminderId: z.string(),
        remindAt: z.string(),
      }),
    },
    async ({ title, notes, remindAtIso }) => {
      const remindAt = new Date(remindAtIso);
      if (Number.isNaN(remindAt.getTime())) {
        throw new Error(`Invalid ISO date: ${remindAtIso}`);
      }

      const docRef = db()
        .collection('users').doc(ctx.uid)
        .collection('reminders').doc();

      await docRef.set({
        title,
        notes: notes ?? '',
        remindAt: Timestamp.fromDate(remindAt),
        status: 'pending',
        sourceConversationId: ctx.conversationId,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        reminderId: docRef.id,
        remindAt: remindAt.toISOString(),
      };
    },
  );
}
