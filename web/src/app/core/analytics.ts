import {
  TicketDoc,
  VideoJobDoc,
  InstagramPostDoc,
  MediaAssetDoc,
  ScheduledPostDoc,
} from './user-data.service';

/**
 * Pure reducer functions that turn raw Firestore arrays into analytics
 * summaries. Kept as plain functions so they're trivial to unit-test
 * and to plug into Angular signals.
 */

export interface CountByKey {
  key: string;
  count: number;
}

export interface AnalyticsSummary {
  total: number;
  byStatus: CountByKey[];
  byCategory: CountByKey[];
}

// ---------- Tickets ----------

export interface TicketAnalytics {
  total: number;
  byStatus: CountByKey[];
  byFamily: CountByKey[];
  byUrgency: CountByKey[];
  liquidDamageCount: number;
  physicalDamageCount: number;
}

export function analyzeTickets(tickets: TicketDoc[] | undefined | null): TicketAnalytics {
  const list = tickets ?? [];
  return {
    total: list.length,
    byStatus: countBy(list, (t) => t.status ?? 'open'),
    byFamily: countBy(list, (t) => t.device?.family ?? 'other'),
    byUrgency: countBy(list, (t) => t.urgency ?? 'normal'),
    liquidDamageCount: list.filter((t) => t.issue?.liquidDamage).length,
    physicalDamageCount: list.filter((t) => t.issue?.physicalDamage).length,
  };
}

// ---------- Video jobs ----------

export interface VideoAnalytics {
  total: number;
  byStatus: CountByKey[];
  byProvider: CountByKey[];
  successRate: number;
  avgProgress: number;
}

export function analyzeVideos(jobs: VideoJobDoc[] | undefined | null): VideoAnalytics {
  const list = jobs ?? [];
  const terminal = list.filter(
    (j) => j.status === 'succeeded' || j.status === 'failed',
  );
  const succeeded = list.filter((j) => j.status === 'succeeded').length;
  return {
    total: list.length,
    byStatus: countBy(list, (j) => j.status),
    byProvider: countBy(list, (j) => j.providerId),
    successRate: terminal.length > 0 ? succeeded / terminal.length : 0,
    avgProgress:
      list.length > 0
        ? list.reduce((acc, j) => acc + (j.progress ?? 0), 0) / list.length
        : 0,
  };
}

// ---------- Scheduled / published posts ----------

export interface PostAnalytics {
  totalScheduled: number;
  totalPublished: number;
  byPlatform: CountByKey[];
  byStatus: CountByKey[];
  successfulPublishes: number;
  failedPublishes: number;
}

export function analyzePosts(
  scheduled: ScheduledPostDoc[] | undefined | null,
  instagramPosts: InstagramPostDoc[] | undefined | null,
): PostAnalytics {
  const sList = scheduled ?? [];
  const iList = instagramPosts ?? [];

  const platformCounts = new Map<string, number>();
  let successfulPublishes = 0;
  let failedPublishes = 0;

  for (const s of sList) {
    for (const platform of s.platforms ?? []) {
      platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
    }
    if (s.results) {
      for (const r of Object.values(s.results)) {
        if (r.status === 'ok') successfulPublishes++;
        else if (r.status === 'failed') failedPublishes++;
      }
    }
  }
  for (const p of iList) {
    if (p.status === 'published') {
      platformCounts.set(
        'instagram',
        (platformCounts.get('instagram') ?? 0) + 1,
      );
      successfulPublishes++;
    }
  }

  return {
    totalScheduled: sList.length,
    totalPublished:
      iList.filter((p) => p.status === 'published').length +
      sList.filter(
        (s) => s.status === 'published' || s.status === 'partially_published',
      ).length,
    byPlatform: Array.from(platformCounts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    byStatus: countBy(sList, (s) => s.status),
    successfulPublishes,
    failedPublishes,
  };
}

// ---------- Media library ----------

export interface MediaAnalytics {
  total: number;
  totalBytes: number;
  byKind: CountByKey[];
}

export function analyzeMedia(assets: MediaAssetDoc[] | undefined | null): MediaAnalytics {
  const list = assets ?? [];
  return {
    total: list.length,
    totalBytes: list.reduce((acc, a) => acc + (a.sizeBytes ?? 0), 0),
    byKind: countBy(list, (a) => a.kind),
  };
}

// ---------- Utilities ----------

function countBy<T>(list: T[], keyFn: (item: T) => string): CountByKey[] {
  const map = new Map<string, number>();
  for (const item of list) {
    const k = keyFn(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
