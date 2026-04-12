import { z } from 'zod';
import type { Genkit } from 'genkit';
import type { ToolContext } from './context';

/**
 * Skill: get the current date/time in a requested IANA timezone.
 * Useful for scheduling, greetings, and any time-aware answer.
 */
export function defineTimeTool(ai: Genkit, _ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'getCurrentTime',
      description:
        'Returns the current date and time. Optionally formatted for a specific IANA timezone (e.g. "America/Santiago", "Europe/Madrid"). Use this whenever you need to know "now".',
      inputSchema: z.object({
        timezone: z
          .string()
          .optional()
          .describe('IANA timezone name. Defaults to UTC.'),
      }),
      outputSchema: z.object({
        iso: z.string(),
        formatted: z.string(),
        timezone: z.string(),
        unix: z.number(),
      }),
    },
    async ({ timezone }) => {
      const now = new Date();
      const tz = timezone || 'UTC';
      let formatted: string;
      try {
        formatted = new Intl.DateTimeFormat('en-US', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone: tz,
        }).format(now);
      } catch {
        formatted = now.toUTCString();
      }
      return {
        iso: now.toISOString(),
        formatted,
        timezone: tz,
        unix: Math.floor(now.getTime() / 1000),
      };
    },
  );
}
