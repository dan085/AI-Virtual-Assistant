import { z } from 'zod';
import type { Genkit } from 'genkit';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../lib/admin';
import type { ToolContext } from './context';

/**
 * Skill: create a formal service ticket for a Dr. Pineapple repair case.
 *
 * Tickets are the system of record for a repair job. The agent collects
 * the structured data during the conversation and then calls this tool
 * exactly once to persist the ticket. A short human-friendly id
 * (DP-XXXXXX) is generated for the customer.
 *
 * IMPORTANT: this tool does NOT ask for credentials or payment info.
 * The agent prompt enforces that rule — this skill simply refuses to
 * store any field it doesn't know about.
 */
export function defineServiceTicketTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'createServiceTicket',
      description:
        'Creates a formal service ticket for a repair case. Call this ONCE after you have gathered: device family, model, symptoms, and contact preference. Returns a human-friendly ticket code (DP-XXXXXX) that you MUST share with the customer so they can reference it. Never call this tool before collecting the required fields.',
      inputSchema: z.object({
        deviceFamily: z
          .enum(['iphone', 'ipad', 'mac', 'apple_watch', 'airpods', 'other'])
          .describe('Broad device category.'),
        deviceModel: z
          .string()
          .min(2)
          .max(80)
          .describe('Exact model the customer reports, e.g. "iPhone 13 Pro", "MacBook Air M2 13\\"".'),
        osVersion: z
          .string()
          .max(40)
          .optional()
          .describe('iOS / iPadOS / macOS / watchOS version if known.'),
        symptoms: z
          .string()
          .min(5)
          .max(2000)
          .describe('Customer description of what is wrong.'),
        suspectedIssue: z
          .string()
          .max(400)
          .optional()
          .describe('Agent hypothesis (e.g. "battery degradation", "cracked screen", "liquid damage").'),
        liquidDamage: z
          .boolean()
          .default(false)
          .describe('True if the customer reports any contact with liquid.'),
        physicalDamage: z
          .boolean()
          .default(false)
          .describe('True if the customer reports a drop / crack / dent.'),
        preferredContactMethod: z
          .enum(['phone', 'whatsapp', 'email', 'in_person'])
          .describe('How the customer wants the shop to reach them.'),
        preferredContactValue: z
          .string()
          .max(200)
          .optional()
          .describe('Optional phone / email — only if the customer volunteered it. Never ask for passwords.'),
        urgency: z
          .enum(['low', 'normal', 'high'])
          .default('normal'),
      }),
      outputSchema: z.object({
        ticketId: z.string(),
        ticketCode: z.string(),
        status: z.literal('open'),
        nextSteps: z.string(),
      }),
    },
    async (input) => {
      const ticketCode = generateTicketCode();
      const docRef = db()
        .collection('users').doc(ctx.uid)
        .collection('tickets').doc();

      await docRef.set({
        ticketCode,
        status: 'open',
        source: 'agent',
        sourceConversationId: ctx.conversationId,
        device: {
          family: input.deviceFamily,
          model: input.deviceModel,
          osVersion: input.osVersion ?? null,
        },
        issue: {
          symptoms: input.symptoms,
          suspected: input.suspectedIssue ?? null,
          liquidDamage: input.liquidDamage,
          physicalDamage: input.physicalDamage,
        },
        contact: {
          method: input.preferredContactMethod,
          value: input.preferredContactValue ?? null,
        },
        urgency: input.urgency,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const nextSteps = input.liquidDamage
        ? 'Do NOT charge or power on the device. Bring it to the shop as soon as possible for a free diagnosis.'
        : 'Bring the device to the shop (or schedule a pickup) for a free diagnosis. We will quote the repair before doing any work.';

      return {
        ticketId: docRef.id,
        ticketCode,
        status: 'open' as const,
        nextSteps,
      };
    },
  );
}

function generateTicketCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `DP-${suffix}`;
}
