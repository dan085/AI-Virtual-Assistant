import { Injectable, Signal, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  orderBy,
  query,
  where,
  DocumentData,
  CollectionReference,
} from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, of, switchMap } from 'rxjs';

/**
 * Convenience: reactive Firestore streams scoped to the current user.
 * All methods return Signals (via toSignal) so templates can use @if /
 * @for directly without subscribing manually.
 */
@Injectable({ providedIn: 'root' })
export class UserDataService {
  private readonly fs = inject(Firestore);
  private readonly auth = inject(Auth);

  private readonly uid$: Observable<string | null> = authState(this.auth).pipe(
    switchMap((u) => of(u?.uid ?? null)),
  );

  /** Live listing of tickets for the current user, newest first. */
  tickets(): Signal<TicketDoc[] | undefined> {
    return toSignal(
      this.uid$.pipe(
        switchMap((uid) => {
          if (!uid) return of<TicketDoc[]>([]);
          const col = collection(
            this.fs,
            `users/${uid}/tickets`,
          ) as CollectionReference<DocumentData>;
          return collectionData(
            query(col, orderBy('createdAt', 'desc')),
            { idField: 'id' },
          ) as Observable<TicketDoc[]>;
        }),
      ),
      { initialValue: undefined },
    );
  }

  /** Live listing of video generation jobs, newest first. */
  videoJobs(): Signal<VideoJobDoc[] | undefined> {
    return toSignal(
      this.uid$.pipe(
        switchMap((uid) => {
          if (!uid) return of<VideoJobDoc[]>([]);
          const col = collection(
            this.fs,
            `users/${uid}/videoGenerations`,
          ) as CollectionReference<DocumentData>;
          return collectionData(
            query(col, orderBy('createdAt', 'desc')),
            { idField: 'id' },
          ) as Observable<VideoJobDoc[]>;
        }),
      ),
      { initialValue: undefined },
    );
  }

  /** Live listing of Instagram drafts + published posts. */
  instagramPosts(): Signal<InstagramPostDoc[] | undefined> {
    return toSignal(
      this.uid$.pipe(
        switchMap((uid) => {
          if (!uid) return of<InstagramPostDoc[]>([]);
          const col = collection(
            this.fs,
            `users/${uid}/instagramPosts`,
          ) as CollectionReference<DocumentData>;
          return collectionData(
            query(col, orderBy('createdAt', 'desc')),
            { idField: 'id' },
          ) as Observable<InstagramPostDoc[]>;
        }),
      ),
      { initialValue: undefined },
    );
  }

  /** Live listing of media library entries. */
  mediaAssets(): Signal<MediaAssetDoc[] | undefined> {
    return toSignal(
      this.uid$.pipe(
        switchMap((uid) => {
          if (!uid) return of<MediaAssetDoc[]>([]);
          const col = collection(
            this.fs,
            `users/${uid}/mediaAssets`,
          ) as CollectionReference<DocumentData>;
          return collectionData(
            query(col, orderBy('createdAt', 'desc')),
            { idField: 'id' },
          ) as Observable<MediaAssetDoc[]>;
        }),
      ),
      { initialValue: undefined },
    );
  }
}

// ---------- Document types ----------

export interface FirestoreTimestampLike {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
}

export interface TicketDoc {
  id: string;
  ticketCode: string;
  status: 'open' | 'in_progress' | 'closed';
  device?: { family?: string; model?: string; osVersion?: string };
  issue?: {
    symptoms?: string;
    suspected?: string;
    liquidDamage?: boolean;
    physicalDamage?: boolean;
  };
  contact?: { method?: string; value?: string };
  urgency?: 'low' | 'normal' | 'high';
  createdAt?: FirestoreTimestampLike;
}

export interface VideoJobDoc {
  id: string;
  providerId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  prompt?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  progress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  createdAt?: FirestoreTimestampLike;
}

export interface InstagramPostDoc {
  id: string;
  mediaType?: string;
  status?: 'draft' | 'published' | 'scheduled' | 'failed';
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaId?: string;
  createdAt?: FirestoreTimestampLike;
  publishedAt?: FirestoreTimestampLike;
}

export interface MediaAssetDoc {
  id: string;
  kind: 'image' | 'video';
  downloadUrl: string;
  storagePath: string;
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  createdAt?: FirestoreTimestampLike;
}

export function formatTimestamp(ts?: FirestoreTimestampLike): string {
  if (!ts) return '—';
  if (ts.toDate) return ts.toDate().toLocaleString();
  if (typeof ts.seconds === 'number') {
    return new Date(ts.seconds * 1000).toLocaleString();
  }
  return '—';
}
