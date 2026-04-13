import { getStorage } from 'firebase-admin/storage';
import { FieldValue } from 'firebase-admin/firestore';
import { db, getAdminApp } from '../lib/admin';

/**
 * Storage ingest helper.
 *
 * Takes any input — an HTTP URL (image / video produced by the AI
 * providers), or a base64 data URL — and persists it to Firebase
 * Storage under `users/{uid}/media/ingested/{generatedName}`. Also
 * writes a Firestore doc in `users/{uid}/mediaAssets` so it shows up
 * in the media library and analytics immediately.
 *
 * The returned downloadUrl is public via a signed URL (default 7 days)
 * so it can be fed directly into Instagram / Facebook / TikTok / Twitter
 * publishers — they all need a publicly reachable URL.
 */

export interface IngestInput {
  uid: string;
  source: { kind: 'url'; url: string } | { kind: 'base64'; data: string; contentType: string };
  kind: 'image' | 'video';
  filename?: string;
}

export interface IngestResult {
  downloadUrl: string;
  storagePath: string;
  mediaAssetId: string;
  contentType: string;
  sizeBytes: number;
}

const DEFAULT_BUCKET_HINT =
  process.env.STORAGE_BUCKET ??
  process.env.FIREBASE_STORAGE_BUCKET ??
  undefined;

export async function ingestToStorage(input: IngestInput): Promise<IngestResult> {
  const app = getAdminApp();
  const bucket = DEFAULT_BUCKET_HINT
    ? getStorage(app).bucket(DEFAULT_BUCKET_HINT)
    : getStorage(app).bucket();

  const { bytes, contentType } = await resolveBytes(input.source);

  const base = input.filename
    ? input.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `${input.kind}_${Date.now().toString(36)}.${extensionFor(contentType)}`;
  const storagePath = `users/${input.uid}/media/ingested/${Date.now()}_${base}`;

  const file = bucket.file(storagePath);
  await file.save(bytes, { contentType, resumable: false });

  // Generate a signed download URL (7 days). If the caller later needs
  // something permanent, they can switch to a public ACL or a CDN.
  const [downloadUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  // Mirror into Firestore so the UI shows it immediately.
  const ref = db()
    .collection('users').doc(input.uid)
    .collection('mediaAssets').doc();
  await ref.set({
    kind: input.kind,
    downloadUrl,
    storagePath,
    filename: base,
    contentType,
    sizeBytes: bytes.length,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    downloadUrl,
    storagePath,
    mediaAssetId: ref.id,
    contentType,
    sizeBytes: bytes.length,
  };
}

// ---------- Helpers ----------

async function resolveBytes(
  source: IngestInput['source'],
): Promise<{ bytes: Buffer; contentType: string }> {
  if (source.kind === 'base64') {
    // Accepts either "data:mime;base64,xxxx" or a raw base64 string.
    const raw = source.data.includes(',')
      ? source.data.split(',')[1]
      : source.data;
    return {
      bytes: Buffer.from(raw, 'base64'),
      contentType: source.contentType,
    };
  }

  // URL — fetch the bytes. Also supports data: URLs for Imagen output.
  if (source.url.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(source.url);
    if (!match) throw new Error('Malformed data URL');
    return { bytes: Buffer.from(match[2], 'base64'), contentType: match[1] };
  }

  const res = await fetch(source.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${source.url}: ${res.status}`);
  }
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, contentType };
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  return map[contentType.toLowerCase()] ?? 'bin';
}
