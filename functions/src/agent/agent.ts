import { z } from 'zod';
import { ai } from './genkit';
import { db } from '../lib/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { buildTools } from './tools';
import type { ToolContext } from './tools';
import {
  AgentDefinition,
  BUILTIN_AGENTS,
  DEFAULT_AGENT_ID,
  getBuiltinAgent,
} from './registry';
import type { SkillId } from './tools';

export const ChatRequestSchema = z.object({
  conversationId: z.string().min(1).max(128),
  message: z.string().min(1).max(4000),
  agentId: z.string().min(1).max(64).default(DEFAULT_AGENT_ID),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ChatResponse {
  conversationId: string;
  reply: string;
  agentId: string;
  agentDisplayName: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolCalls?: Array<{ name: string; input: unknown }>;
}

/**
 * Load an agent definition. Tries Firestore first (for runtime
 * customization), falls back to the in-code BUILTIN_AGENTS registry.
 */
async function loadAgent(agentId: string): Promise<AgentDefinition> {
  try {
    const snap = await db().collection('agents').doc(agentId).get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      // Merge Firestore overrides on top of the builtin default so missing
      // fields fall through to sane values.
      const base = getBuiltinAgent(agentId);
      return {
        ...base,
        displayName: (data.displayName as string) ?? base.displayName,
        tagline: (data.tagline as string) ?? base.tagline,
        description: (data.description as string) ?? base.description,
        systemPrompt: (data.systemPrompt as string) ?? base.systemPrompt,
        skills: (data.skills as SkillId[]) ?? base.skills,
        defaultLocale: (data.defaultLocale as 'es' | 'en') ?? base.defaultLocale,
        published: (data.published as boolean) ?? base.published,
      };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[agent] Firestore load failed, using builtin', err);
  }
  return getBuiltinAgent(agentId);
}

async function loadHistory(
  userId: string,
  conversationId: string,
): Promise<Array<{ role: 'user' | 'model'; content: string }>> {
  const snap = await db()
    .collection('users').doc(userId)
    .collection('conversations').doc(conversationId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limit(40)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      role: data.role === 'assistant' ? 'model' : 'user',
      content: String(data.content ?? ''),
    };
  });
}

async function persistMessage(
  userId: string,
  conversationId: string,
  agentId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: Array<{ name: string; input: unknown }>,
): Promise<void> {
  const convRef = db()
    .collection('users').doc(userId)
    .collection('conversations').doc(conversationId);

  await convRef.set(
    {
      agentId,
      updatedAt: FieldValue.serverTimestamp(),
      lastMessagePreview: content.slice(0, 200),
    },
    { merge: true },
  );

  await convRef.collection('messages').add({
    role,
    content,
    agentId,
    toolCalls: toolCalls ?? [],
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function runAgent(
  userId: string,
  req: ChatRequest,
): Promise<ChatResponse> {
  const agentDef = await loadAgent(req.agentId);
  const history = await loadHistory(userId, req.conversationId);

  await persistMessage(
    userId,
    req.conversationId,
    agentDef.id,
    'user',
    req.message,
  );

  const toolContext: ToolContext = {
    uid: userId,
    conversationId: req.conversationId,
  };

  const tools = buildTools(ai(), toolContext, agentDef.skills);

  const response = await ai().generate({
    system: agentDef.systemPrompt,
    tools,
    messages: [
      ...history.map((m) => ({
        role: m.role,
        content: [{ text: m.content }],
      })),
      { role: 'user', content: [{ text: req.message }] },
    ],
  });

  const reply = response.text ?? '';

  // Best-effort extraction of tool calls for the audit trail.
  const toolCalls: Array<{ name: string; input: unknown }> = [];
  for (const msg of response.messages ?? []) {
    for (const part of msg.content ?? []) {
      if (part && typeof part === 'object' && 'toolRequest' in part) {
        const tr = (part as { toolRequest?: { name?: string; input?: unknown } })
          .toolRequest;
        if (tr?.name) {
          toolCalls.push({ name: tr.name, input: tr.input });
        }
      }
    }
  }

  await persistMessage(
    userId,
    req.conversationId,
    agentDef.id,
    'assistant',
    reply,
    toolCalls,
  );

  return {
    conversationId: req.conversationId,
    reply,
    agentId: agentDef.id,
    agentDisplayName: agentDef.displayName,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    usage: response.usage
      ? {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        }
      : undefined,
  };
}

/**
 * Public listing of available agents (merges builtin + Firestore,
 * hides unpublished). Used by the frontend agent picker.
 */
export async function listAgents(): Promise<
  Array<Pick<AgentDefinition, 'id' | 'displayName' | 'tagline' | 'description' | 'skills'>>
> {
  const out: Array<Pick<AgentDefinition, 'id' | 'displayName' | 'tagline' | 'description' | 'skills'>> = [];
  for (const def of Object.values(BUILTIN_AGENTS)) {
    if (!def.published) continue;
    out.push({
      id: def.id,
      displayName: def.displayName,
      tagline: def.tagline,
      description: def.description,
      skills: def.skills,
    });
  }
  return out;
}
