import { z } from 'zod';
import type { Genkit } from 'genkit';
import { defineSecret } from 'firebase-functions/params';
import type { ToolContext } from './context';

/**
 * Skill: search the public web via Google Custom Search JSON API.
 *
 * Secrets required (optional — the tool will no-op gracefully if unset):
 *   firebase functions:secrets:set GOOGLE_SEARCH_API_KEY
 *   firebase functions:secrets:set GOOGLE_SEARCH_CX
 *
 * You can also swap this for Tavily, Serper, Brave Search, Bing, etc.
 * by editing the fetch call below.
 */
export const GOOGLE_SEARCH_API_KEY = defineSecret('GOOGLE_SEARCH_API_KEY');
export const GOOGLE_SEARCH_CX = defineSecret('GOOGLE_SEARCH_CX');

export function defineWebSearchTool(ai: Genkit, _ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'searchWeb',
      description:
        'Searches the public web for up-to-date information. Use sparingly — only for questions that require current events, recent prices, or facts your internal knowledge cannot provide.',
      inputSchema: z.object({
        query: z.string().min(1).max(256),
        numResults: z.number().int().min(1).max(10).default(5),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
          }),
        ),
        note: z.string().optional(),
      }),
    },
    async ({ query, numResults }) => {
      let apiKey: string | undefined;
      let cx: string | undefined;
      try {
        apiKey = GOOGLE_SEARCH_API_KEY.value();
        cx = GOOGLE_SEARCH_CX.value();
      } catch {
        // Secret not declared for this function — fall through.
      }

      if (!apiKey || !cx) {
        return {
          results: [],
          note: 'Web search is not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX via `firebase functions:secrets:set`.',
        };
      }

      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('cx', cx);
      url.searchParams.set('q', query);
      url.searchParams.set('num', String(numResults));

      const res = await fetch(url);
      if (!res.ok) {
        return {
          results: [],
          note: `Web search failed: ${res.status} ${res.statusText}`,
        };
      }
      const data = (await res.json()) as {
        items?: Array<{ title: string; link: string; snippet: string }>;
      };

      return {
        results: (data.items ?? []).map((item) => ({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
        })),
      };
    },
  );
}
