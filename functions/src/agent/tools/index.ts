import type { Genkit } from 'genkit';
import type { ToolContext } from './context';
import { defineTimeTool } from './time.tool';
import { defineInstagramDraftTool } from './instagram-draft.tool';
import { defineReminderTool } from './reminder.tool';
import { defineKnowledgeSearchTool } from './knowledge.tool';
import { defineWebSearchTool } from './web-search.tool';
import { defineServiceTicketTool } from './service-ticket.tool';
import { defineDevicePricingTool } from './device-pricing.tool';
import {
  defineGenerateVideoTool,
  defineCheckVideoStatusTool,
} from './generate-video.tool';
import { defineGenerateImageTool } from './generate-image.tool';
import { definePlanContentTool } from './plan-content.tool';
import { defineSchedulePostTool } from './schedule-post.tool';

type GenkitTool = ReturnType<Genkit['defineTool']>;

export type { ToolContext } from './context';
export {
  GOOGLE_SEARCH_API_KEY,
  GOOGLE_SEARCH_CX,
} from './web-search.tool';

export const SKILL_IDS = [
  'getCurrentTime',
  'createInstagramDraft',
  'createReminder',
  'searchKnowledgeBase',
  'searchWeb',
  'createServiceTicket',
  'lookupDevicePricing',
  'generateAiVideo',
  'checkVideoGenerationStatus',
  'generateAiImage',
  'planStoryContent',
  'schedulePost',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDescriptor {
  id: SkillId;
  label: string;
  description: string;
  category: 'core' | 'content' | 'business' | 'research';
}

export const SKILL_CATALOG: Record<SkillId, SkillDescriptor> = {
  getCurrentTime: {
    id: 'getCurrentTime',
    label: 'Time & timezone',
    description: 'Knows the current date/time in any IANA timezone.',
    category: 'core',
  },
  createInstagramDraft: {
    id: 'createInstagramDraft',
    label: 'Instagram drafting',
    description:
      'Drafts Instagram posts, Reels, Stories, and carousels (photos and videos). Publishing still requires a human click.',
    category: 'content',
  },
  createReminder: {
    id: 'createReminder',
    label: 'Reminders',
    description: 'Schedules reminders at a specific time.',
    category: 'core',
  },
  searchKnowledgeBase: {
    id: 'searchKnowledgeBase',
    label: 'Knowledge base',
    description: "Searches the user's personal documents for context.",
    category: 'research',
  },
  searchWeb: {
    id: 'searchWeb',
    label: 'Web search',
    description: 'Queries the public web for fresh information.',
    category: 'research',
  },
  createServiceTicket: {
    id: 'createServiceTicket',
    label: 'Service tickets',
    description: 'Creates a formal repair ticket (DrPineapple workflow).',
    category: 'business',
  },
  lookupDevicePricing: {
    id: 'lookupDevicePricing',
    label: 'Repair pricing',
    description:
      'Looks up reference price ranges for iOS device repairs from the catalog.',
    category: 'business',
  },
  generateAiVideo: {
    id: 'generateAiVideo',
    label: 'AI video generation',
    description:
      'Generates short video clips with Seedance, Google Veo, or Runway for Stories and Reels.',
    category: 'content',
  },
  checkVideoGenerationStatus: {
    id: 'checkVideoGenerationStatus',
    label: 'Check video job',
    description: 'Polls an ongoing AI video generation job.',
    category: 'content',
  },
  generateAiImage: {
    id: 'generateAiImage',
    label: 'AI image generation',
    description:
      'Generates still images with Google Imagen 3, DALL-E 3, or Replicate Flux for posts and Stories.',
    category: 'content',
  },
  planStoryContent: {
    id: 'planStoryContent',
    label: 'Content planner',
    description:
      'Uses a secondary LLM call to decide whether a Story should be an image or a video, drafts prompts, caption, and hashtags.',
    category: 'content',
  },
  schedulePost: {
    id: 'schedulePost',
    label: 'Schedule post',
    description:
      'Schedules a multi-platform post (Instagram / Facebook / Twitter / TikTok) for a future time.',
    category: 'content',
  },
};

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
  if (allow.has('createServiceTicket')) tools.push(defineServiceTicketTool(ai, ctx));
  if (allow.has('lookupDevicePricing')) tools.push(defineDevicePricingTool(ai, ctx));
  if (allow.has('generateAiVideo')) tools.push(defineGenerateVideoTool(ai, ctx));
  if (allow.has('checkVideoGenerationStatus')) tools.push(defineCheckVideoStatusTool(ai, ctx));
  if (allow.has('generateAiImage')) tools.push(defineGenerateImageTool(ai, ctx));
  if (allow.has('planStoryContent')) tools.push(definePlanContentTool(ai, ctx));
  if (allow.has('schedulePost')) tools.push(defineSchedulePostTool(ai, ctx));

  return tools;
}
