/**
 * Seed the `servicePricing` collection with reference price ranges for
 * DrPineapple. Edit this file to match your real catalog, then run:
 *
 *   cd functions
 *   npm run seed:pricing
 *
 * Prices are in CLP (Chilean Pesos) but the `currency` field is stored
 * so you can mix currencies or switch later.
 *
 * Document id convention: `${deviceFamily}__${repairType}` for a
 * family-wide entry, or `${deviceFamily}__${slug(model)}__${repairType}`
 * for a model-specific entry. The skill tries the more specific id
 * first, then falls back to the family-wide one.
 */

import { getAdminApp, db } from '../lib/admin';
import { FieldValue } from 'firebase-admin/firestore';

export interface PricingEntry {
  id: string;
  deviceFamily: 'iphone' | 'ipad' | 'mac' | 'apple_watch' | 'airpods';
  repairType: string;
  model?: string;
  currency: string;
  minPrice: number;
  maxPrice: number;
  notes?: string;
}

export const CATALOG: PricingEntry[] = [
  // ---------- iPhone ----------
  {
    id: 'iphone__screen_replacement',
    deviceFamily: 'iphone',
    repairType: 'screen_replacement',
    currency: 'CLP',
    minPrice: 60_000,
    maxPrice: 280_000,
    notes: 'Depende del modelo (iPhone SE → iPhone 15 Pro Max).',
  },
  {
    id: 'iphone__battery_replacement',
    deviceFamily: 'iphone',
    repairType: 'battery_replacement',
    currency: 'CLP',
    minPrice: 35_000,
    maxPrice: 95_000,
    notes: 'Batería de calidad equivalente a OEM, 6 meses de garantía.',
  },
  {
    id: 'iphone__charging_port',
    deviceFamily: 'iphone',
    repairType: 'charging_port',
    currency: 'CLP',
    minPrice: 45_000,
    maxPrice: 120_000,
  },
  {
    id: 'iphone__liquid_damage',
    deviceFamily: 'iphone',
    repairType: 'liquid_damage',
    currency: 'CLP',
    minPrice: 50_000,
    maxPrice: 350_000,
    notes: 'Limpieza ultrasónica + diagnóstico. Componentes dañados se cotizan aparte.',
  },
  {
    id: 'iphone__camera',
    deviceFamily: 'iphone',
    repairType: 'camera',
    currency: 'CLP',
    minPrice: 55_000,
    maxPrice: 220_000,
  },
  {
    id: 'iphone__logic_board',
    deviceFamily: 'iphone',
    repairType: 'logic_board',
    currency: 'CLP',
    minPrice: 80_000,
    maxPrice: 450_000,
    notes: 'Reparación a nivel de microsoldadura. Diagnóstico previo obligatorio.',
  },
  {
    id: 'iphone__data_recovery',
    deviceFamily: 'iphone',
    repairType: 'data_recovery',
    currency: 'CLP',
    minPrice: 90_000,
    maxPrice: 400_000,
    notes: 'Solo si el cliente tiene su Apple ID y contraseña del equipo.',
  },

  // ---------- iPad ----------
  {
    id: 'ipad__screen_replacement',
    deviceFamily: 'ipad',
    repairType: 'screen_replacement',
    currency: 'CLP',
    minPrice: 90_000,
    maxPrice: 380_000,
  },
  {
    id: 'ipad__battery_replacement',
    deviceFamily: 'ipad',
    repairType: 'battery_replacement',
    currency: 'CLP',
    minPrice: 70_000,
    maxPrice: 180_000,
  },
  {
    id: 'ipad__charging_port',
    deviceFamily: 'ipad',
    repairType: 'charging_port',
    currency: 'CLP',
    minPrice: 60_000,
    maxPrice: 150_000,
  },

  // ---------- Mac ----------
  {
    id: 'mac__battery_replacement',
    deviceFamily: 'mac',
    repairType: 'battery_replacement',
    currency: 'CLP',
    minPrice: 95_000,
    maxPrice: 280_000,
  },
  {
    id: 'mac__screen_replacement',
    deviceFamily: 'mac',
    repairType: 'screen_replacement',
    currency: 'CLP',
    minPrice: 180_000,
    maxPrice: 750_000,
  },
  {
    id: 'mac__logic_board',
    deviceFamily: 'mac',
    repairType: 'logic_board',
    currency: 'CLP',
    minPrice: 150_000,
    maxPrice: 900_000,
  },
  {
    id: 'mac__liquid_damage',
    deviceFamily: 'mac',
    repairType: 'liquid_damage',
    currency: 'CLP',
    minPrice: 80_000,
    maxPrice: 500_000,
  },
  {
    id: 'mac__software_diagnostic',
    deviceFamily: 'mac',
    repairType: 'software_diagnostic',
    currency: 'CLP',
    minPrice: 0,
    maxPrice: 30_000,
    notes: 'Diagnóstico siempre gratuito. Solo se cobra si se realiza la reparación.',
  },

  // ---------- Apple Watch ----------
  {
    id: 'apple_watch__screen_replacement',
    deviceFamily: 'apple_watch',
    repairType: 'screen_replacement',
    currency: 'CLP',
    minPrice: 80_000,
    maxPrice: 220_000,
  },
  {
    id: 'apple_watch__battery_replacement',
    deviceFamily: 'apple_watch',
    repairType: 'battery_replacement',
    currency: 'CLP',
    minPrice: 50_000,
    maxPrice: 110_000,
  },

  // ---------- AirPods ----------
  {
    id: 'airpods__battery_replacement',
    deviceFamily: 'airpods',
    repairType: 'battery_replacement',
    currency: 'CLP',
    minPrice: 40_000,
    maxPrice: 90_000,
    notes: 'AirPods y AirPods Pro. No aplica a AirPods Max.',
  },
];

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _app = getAdminApp();

  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    '(unknown)';
  // eslint-disable-next-line no-console
  console.log(`Seeding servicePricing into project: ${projectId}`);

  const col = db().collection('servicePricing');
  const batch = db().batch();

  for (const entry of CATALOG) {
    batch.set(
      col.doc(entry.id),
      {
        ...entry,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    // eslint-disable-next-line no-console
    console.log(
      `  • ${entry.id.padEnd(40)} ${entry.currency} ${entry.minPrice.toLocaleString()} - ${entry.maxPrice.toLocaleString()}`,
    );
  }

  await batch.commit();
  // eslint-disable-next-line no-console
  console.log(`\n✓ Seeded ${CATALOG.length} pricing entries.`);
}

// Only run when invoked directly (node lib/seed/seed-pricing.js), not
// when imported as a module (e.g. by tests).
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exitCode = 1;
  });
}
