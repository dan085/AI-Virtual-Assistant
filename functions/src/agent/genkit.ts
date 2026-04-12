import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';
import { defineSecret } from 'firebase-functions/params';

/**
 * Gemini API key is stored as a Firebase secret. Set it with:
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * It is NEVER read from source control or .env files in production.
 */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/**
 * Single Genkit instance reused across invocations. Genkit is configured
 * lazily so the secret is resolved at call time (required for v2 secrets).
 */
let aiInstance: ReturnType<typeof genkit> | null = null;

export function ai() {
  if (!aiInstance) {
    aiInstance = genkit({
      plugins: [
        googleAI({ apiKey: GEMINI_API_KEY.value() }),
      ],
      model: gemini15Flash,
    });
  }
  return aiInstance;
}
