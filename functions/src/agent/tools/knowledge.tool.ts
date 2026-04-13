import { z } from 'zod';
import type { Genkit } from 'genkit';
import { db } from '../../lib/admin';
import type { ToolContext } from './context';

/**
 * Skill: search the user's personal knowledge base stored in
 * `users/{uid}/knowledge/{docId}`. Each document has at least
 * { title: string, content: string, tags?: string[] }.
 *
 * This implementation is a simple keyword scan (no embeddings). It's a
 * solid starting point — swap it for Vertex AI Vector Search or pgvector
 * once you have real content volume.
 */
export function defineKnowledgeSearchTool(ai: Genkit, ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'searchKnowledgeBase',
      description:
        "Searches the user's personal knowledge base for documents relevant to a query. Use this BEFORE answering any factual question where the user may have provided their own context, preferences, or domain information.",
      inputSchema: z.object({
        query: z.string().min(1).max(300),
        limit: z.number().int().min(1).max(10).default(5),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            snippet: z.string(),
            score: z.number(),
          }),
        ),
      }),
    },
    async ({ query, limit }) => {
      const snap = await db()
        .collection('users').doc(ctx.uid)
        .collection('knowledge')
        .limit(200)
        .get();

      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

      const scored = snap.docs
        .map((doc) => {
          const data = doc.data();
          const title = String(data.title ?? '');
          const content = String(data.content ?? '');
          const hay = `${title}\n${content}`.toLowerCase();
          const score = terms.reduce(
            (acc, term) => acc + (hay.split(term).length - 1),
            0,
          );
          const idx = hay.indexOf(terms[0] ?? '');
          const snippet =
            idx >= 0
              ? content.slice(Math.max(0, idx - 40), idx + 160)
              : content.slice(0, 160);
          return { id: doc.id, title, snippet, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return { results: scored };
    },
  );
}
