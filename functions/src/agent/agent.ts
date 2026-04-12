import { z } from 'zod';
import { ai } from './genkit';
import { db } from '../lib/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const ChatRequestSchema = z.object({
  conversationId: z.string().min(1).max(128),
  message: z.string().min(1).max(4000),
  agentId: z.string().min(1).max(64).default('default'),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export interface ChatResponse {
  conversationId: string;
  reply: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

interface AgentConfig {
  systemPrompt: string;
  displayName: string;
}

const DEFAULT_AGENT: AgentConfig = {
  displayName: 'Emma',
  systemPrompt: [
    'You are Emma, a helpful, friendly virtual assistant.',
    'Answer concisely. When the user asks in Spanish, reply in Spanish.',
    'When the user asks in English, reply in English.',
    'If you are asked to publish to Instagram, explain that the user must',
    'use the "Publish to Instagram" feature in the UI.',
  ].join(' '),
};

async function loadAgentConfig(agentId: string): Promise<AgentConfig> {
  if (agentId === 'default') return DEFAULT_AGENT;
  const snap = await db().collection('agents').doc(agentId).get();
  if (!snap.exists) return DEFAULT_AGENT;
  const data = snap.data() ?? {};
  return {
    displayName: (data.displayName as string) ?? DEFAULT_AGENT.displayName,
    systemPrompt: (data.systemPrompt as string) ?? DEFAULT_AGENT.systemPrompt,
  };
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
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const convRef = db()
    .collection('users').doc(userId)
    .collection('conversations').doc(conversationId);

  await convRef.set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      lastMessagePreview: content.slice(0, 200),
    },
    { merge: true },
  );

  await convRef.collection('messages').add({
    role,
    content,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function runAgent(
  userId: string,
  req: ChatRequest,
): Promise<ChatResponse> {
  const agentConfig = await loadAgentConfig(req.agentId);
  const history = await loadHistory(userId, req.conversationId);

  await persistMessage(userId, req.conversationId, 'user', req.message);

  const response = await ai().generate({
    system: agentConfig.systemPrompt,
    messages: [
      ...history.map((m) => ({
        role: m.role,
        content: [{ text: m.content }],
      })),
      { role: 'user', content: [{ text: req.message }] },
    ],
  });

  const reply = response.text ?? '';
  await persistMessage(userId, req.conversationId, 'assistant', reply);

  return {
    conversationId: req.conversationId,
    reply,
    usage: response.usage
      ? {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        }
      : undefined,
  };
}
