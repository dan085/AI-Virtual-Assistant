import type { Genkit } from 'genkit';
import type { ToolContext } from './context';
import { defineTimeTool } from './time.tool';
import { defineInstagramDraftTool } from './instagram-draft.tool';
import { defineReminderTool } from './reminder.tool';
import { defineKnowledgeSearchTool } from './knowledge.tool';
import { defineWebSearchTool } from './web-search.tool';

type GenkitTool = ReturnType<Genkit['defineTool']>;

export type { ToolContext } from './context';
export {
  GOOGLE_SEARCH_API_KEY,
  GOOGLE_SEARCH_CX,
} from './web-search.tool';

/**
 * Canonical list of skill names. Agents reference these by string in their
 * configuration; the runtime maps them to Genkit tool actions on each call.
 */
export const SKILL_IDS = [
  'getCurrentTime',
  'createInstagramDraft',
  'createReminder',
  'searchKnowledgeBase',
  'searchWeb',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDescriptor {
  id: SkillId;
  label: string;
  description: string;
}

/** Human-readable catalog used by the UI and the seed script. */
export const SKILL_CATALOG: Record<SkillId, SkillDescriptor> = {
  getCurrentTime: {
    id: 'getCurrentTime',
    label: 'Time & timezone',
    description: 'Knows the current date/time in any IANA timezone.',
  },
  createInstagramDraft: {
    id: 'createInstagramDraft',
    label: 'Instagram drafting',
    description:
      'Can compose Instagram captions and save them as drafts. Publishing still requires a human click.',
  },
  createReminder: {
    id: 'createReminder',
    label: 'Reminders',
    description: 'Can schedule reminders for the user at a specific time.',
  },
  searchKnowledgeBase: {
    id: 'searchKnowledgeBase',
    label: 'Knowledge base',
    description: "Searches the user's personal documents for context.",
  },
  searchWeb: {
    id: 'searchWeb',
    label: 'Web search',
    description:
      'Queries the public web for fresh information (requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX).',
  },
};

/**
 * Build the Genkit tool actions for a given set of allowed skills and
 * per-request user context. Tools that the current agent is not allowed
 * to use are simply never instantiated.
 */
export function buildTools(
  ai: Genkit,
  ctx: ToolContext,
  allowed: readonly SkillId[],
): GenkitTool[] {
  const allow = new Set<SkillId>(allowed);
  const tools: GenkitTool[] = [];

  if (allow.has('getCurrentTime')) tools.push(defineTimeTool(ai, ctx));
  if (allow.has('createInstagramDraft')) tools.push(defineInstagramDraftTool(ai, ctx));
  if (allow.has('createReminder')) tools.push(defineReminderTool(ai, ctx));
  if (allow.has('searchKnowledgeBase')) tools.push(defineKnowledgeSearchTool(ai, ctx));
  if (allow.has('searchWeb')) tools.push(defineWebSearchTool(ai, ctx));

  return tools;
}
