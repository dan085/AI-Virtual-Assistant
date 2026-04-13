/**
 * Pure unit tests for the analytics reducers. Runs via `node --test`
 * over the compiled TS (if the web project adopts a test runner) or
 * can be lifted into Jasmine/Karma. Kept framework-agnostic by using
 * plain assertions.
 *
 * NOTE: these live next to the reducer so the test-build machinery
 * can pick them up; the Angular CLI ignores .spec.ts from the build.
 */

import {
  analyzeTickets,
  analyzeVideos,
  analyzePosts,
  analyzeMedia,
  formatBytes,
} from './analytics';
import type {
  TicketDoc,
  VideoJobDoc,
  InstagramPostDoc,
  MediaAssetDoc,
  ScheduledPostDoc,
} from './user-data.service';

function assertEqual<T>(a: T, b: T, msg: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

export function runAnalyticsTests(): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  const run = (name: string, fn: () => void) => {
    try {
      fn();
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`  ✗ ${name}: ${err}`);
      failed++;
    }
  };

  run('analyzeTickets handles empty input', () => {
    const r = analyzeTickets([]);
    assertEqual(r.total, 0, 'total');
    assertEqual(r.byStatus, [], 'byStatus');
    assertEqual(r.liquidDamageCount, 0, 'liquid');
  });

  run('analyzeTickets counts families and flags', () => {
    const tickets: TicketDoc[] = [
      { id: '1', ticketCode: 'DP-A', status: 'open', device: { family: 'iphone' }, issue: { liquidDamage: true } },
      { id: '2', ticketCode: 'DP-B', status: 'open', device: { family: 'iphone' }, issue: { physicalDamage: true } },
      { id: '3', ticketCode: 'DP-C', status: 'closed', device: { family: 'mac' }, issue: {} },
    ];
    const r = analyzeTickets(tickets);
    assertEqual(r.total, 3, 'total');
    assertEqual(r.liquidDamageCount, 1, 'liquid');
    assertEqual(r.physicalDamageCount, 1, 'physical');
    // byFamily: iphone=2, mac=1
    assertEqual(r.byFamily[0].key, 'iphone', 'top family');
    assertEqual(r.byFamily[0].count, 2, 'iphone count');
  });

  run('analyzeVideos computes success rate', () => {
    const jobs: VideoJobDoc[] = [
      { id: '1', providerId: 'mock', status: 'succeeded' },
      { id: '2', providerId: 'mock', status: 'succeeded' },
      { id: '3', providerId: 'mock', status: 'failed' },
      { id: '4', providerId: 'seedance', status: 'running' },
    ];
    const r = analyzeVideos(jobs);
    assertEqual(r.total, 4, 'total');
    assertEqual(r.successRate, 2 / 3, 'success rate');
    assertEqual(r.byProvider.length, 2, 'provider count');
  });

  run('analyzePosts sums successful + failed platform results', () => {
    const scheduled: ScheduledPostDoc[] = [
      {
        id: '1',
        platforms: ['instagram', 'twitter'],
        mediaType: 'IMAGE',
        status: 'published',
        results: {
          instagram: { status: 'ok', remoteId: 'x' },
          twitter: { status: 'ok', remoteId: 'y' },
        },
      },
      {
        id: '2',
        platforms: ['tiktok'],
        mediaType: 'REEL_OR_SHORT',
        status: 'partially_published',
        results: { tiktok: { status: 'failed', error: 'api down' } },
      },
    ];
    const r = analyzePosts(scheduled, []);
    assertEqual(r.totalScheduled, 2, 'totalScheduled');
    assertEqual(r.successfulPublishes, 2, 'successful');
    assertEqual(r.failedPublishes, 1, 'failed');
    // byPlatform: instagram=1, twitter=1, tiktok=1
    assertEqual(r.byPlatform.length, 3, 'platforms');
  });

  run('analyzeMedia computes totals and kind split', () => {
    const assets: MediaAssetDoc[] = [
      { id: '1', kind: 'image', downloadUrl: '', storagePath: '', sizeBytes: 1024 },
      { id: '2', kind: 'image', downloadUrl: '', storagePath: '', sizeBytes: 2048 },
      { id: '3', kind: 'video', downloadUrl: '', storagePath: '', sizeBytes: 10_000_000 },
    ];
    const r = analyzeMedia(assets);
    assertEqual(r.total, 3, 'total');
    assertEqual(r.totalBytes, 10_003_072, 'totalBytes');
    assertEqual(r.byKind.find((k) => k.key === 'image')?.count ?? 0, 2, 'images');
  });

  run('formatBytes formats ranges', () => {
    assertEqual(formatBytes(0), '0 B', '0');
    assertEqual(formatBytes(512), '512 B', '512');
    assertEqual(formatBytes(2048), '2.0 KB', '2KB');
    assertEqual(formatBytes(5 * 1024 * 1024), '5.0 MB', '5MB');
  });

  return { passed, failed };
}

// Run if executed directly (node --test won't discover this since it's
// inside the web/ project; we export the runner so it can be called
// from a Node test harness if desired).
if (typeof require !== 'undefined' && require.main === module) {
  const { passed, failed } = runAnalyticsTests();
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
