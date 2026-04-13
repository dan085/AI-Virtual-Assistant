import { z } from 'zod';
import type { Genkit } from 'genkit';
import { db } from '../../lib/admin';
import type { ToolContext } from './context';

/**
 * Skill: look up the reference price range for a Dr. Pineapple repair.
 *
 * Data source: the public `servicePricing/{pricingId}` collection, seeded
 * with one document per (deviceFamily, repairType) pair. The agent MUST
 * quote the returned range verbatim and always add the disclaimer that
 * the final price depends on in-shop diagnosis.
 */
export function defineDevicePricingTool(ai: Genkit, _ctx: ToolContext) {
  return ai.defineTool(
    {
      name: 'lookupDevicePricing',
      description:
        'Looks up the reference price range for a given device family and repair type (e.g. "iphone" + "screen_replacement"). Returns a min/max CLP range. Use this whenever the customer asks "how much does X cost?" and always add the disclaimer that the final price is subject to in-shop diagnosis. Never invent prices.',
      inputSchema: z.object({
        deviceFamily: z.enum([
          'iphone',
          'ipad',
          'mac',
          'apple_watch',
          'airpods',
          'other',
        ]),
        repairType: z
          .enum([
            'screen_replacement',
            'battery_replacement',
            'charging_port',
            'camera',
            'speaker',
            'microphone',
            'logic_board',
            'liquid_damage',
            'data_recovery',
            'software_diagnostic',
            'other',
          ])
          .describe('Normalized repair category.'),
        modelHint: z
          .string()
          .max(80)
          .optional()
          .describe('Optional exact model for a more specific quote (e.g. "iPhone 13 Pro").'),
      }),
      outputSchema: z.object({
        found: z.boolean(),
        currency: z.string(),
        minPrice: z.number().nullable(),
        maxPrice: z.number().nullable(),
        notes: z.string().nullable(),
        disclaimer: z.string(),
      }),
    },
    async ({ deviceFamily, repairType, modelHint }) => {
      const disclaimer =
        'Reference range only. The final price depends on the in-shop diagnosis (free). Quote is valid for standard OEM-equivalent parts.';

      // Try a device-specific document first, then fall back to family-wide.
      const candidates: string[] = [];
      if (modelHint) {
        candidates.push(`${deviceFamily}__${slug(modelHint)}__${repairType}`);
      }
      candidates.push(`${deviceFamily}__${repairType}`);

      for (const id of candidates) {
        const snap = await db().collection('servicePricing').doc(id).get();
        if (snap.exists) {
          const d = snap.data() ?? {};
          return {
            found: true,
            currency: String(d.currency ?? 'CLP'),
            minPrice: typeof d.minPrice === 'number' ? d.minPrice : null,
            maxPrice: typeof d.maxPrice === 'number' ? d.maxPrice : null,
            notes: (d.notes as string) ?? null,
            disclaimer,
          };
        }
      }

      return {
        found: false,
        currency: 'CLP',
        minPrice: null,
        maxPrice: null,
        notes: 'No reference range found for that combination. Offer a free in-shop diagnosis instead.',
        disclaimer,
      };
    },
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
