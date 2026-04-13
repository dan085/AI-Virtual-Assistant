import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Storage,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from '@angular/fire/storage';
import {
  Firestore,
  addDoc,
  collection,
  serverTimestamp,
} from '@angular/fire/firestore';
import {
  MediaAssetDoc,
  UserDataService,
  formatTimestamp,
} from '../../core/user-data.service';

interface UploadProgress {
  filename: string;
  percent: number;
  error?: string;
}

@Component({
  selector: 'app-media-library',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Media library</h1>
    <p class="dim">
      Upload images and videos here to get public URLs ready for the
      Instagram publisher and the AI agents. Uploads go to Firebase
      Storage at <code>users/{{ '{' }}uid{{ '}' }}/media/</code>.
    </p>

    <div
      class="dropzone"
      [class.drag]="isDragging()"
      (click)="fileInput.click()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <input
        #fileInput
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        (change)="onFiles($any($event.target).files)"
      />
      <div class="hint">
        <strong>Drop files here</strong> or click to browse.
        <div class="dim">Images and videos up to ~100 MB each.</div>
      </div>
    </div>

    @if (inProgress().length) {
      <div class="progress">
        @for (p of inProgress(); track p.filename) {
          <div class="row">
            <div class="filename">{{ p.filename }}</div>
            <div class="bar"><span [style.width.%]="p.percent"></span></div>
            <div class="pct">{{ p.percent }}%</div>
            @if (p.error) { <div class="error">{{ p.error }}</div> }
          </div>
        }
      </div>
    }

    @if (assets() === undefined) {
      <div class="dim">Loading…</div>
    } @else {
      <div class="grid">
        @for (a of assets(); track a.id) {
          <div class="asset">
            @if (a.kind === 'image') {
              <img [src]="a.downloadUrl" [alt]="a.filename" />
            } @else {
              <video [src]="a.downloadUrl" controls muted></video>
            }
            <div class="meta">
              <div class="filename">{{ a.filename }}</div>
              <div class="dim">
                {{ a.kind }} · {{ formatSize(a.sizeBytes) }} · {{ ts(a.createdAt) }}
              </div>
              <button type="button" (click)="copyUrl(a)">
                @if (copied() === a.id) { Copied! } @else { Copy URL }
              </button>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      .dim { color: var(--text-dim); }
      code { background: var(--panel-2); padding: 0 0.25rem; border-radius: 3px; }
      .dropzone {
        border: 2px dashed var(--border);
        border-radius: 12px;
        padding: 2rem;
        text-align: center;
        cursor: pointer;
        margin: 1rem 0;
        transition: border-color 0.15s, background 0.15s;
      }
      .dropzone:hover, .dropzone.drag {
        border-color: var(--accent);
        background: rgba(99, 102, 241, 0.05);
      }
      .hint strong { display: block; margin-bottom: 0.25rem; }
      .progress {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
      }
      .progress .row {
        display: grid;
        grid-template-columns: 1fr 200px 50px;
        gap: 0.75rem;
        align-items: center;
        font-size: 0.85rem;
      }
      .progress .bar {
        height: 6px;
        background: var(--panel-2);
        border-radius: 999px;
        overflow: hidden;
      }
      .progress .bar span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
        transition: width 0.2s;
      }
      .progress .error { grid-column: 1 / -1; color: var(--danger); font-size: 0.8rem; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 1rem;
      }
      .asset {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .asset img, .asset video {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        background: var(--panel-2);
      }
      .meta {
        padding: 0.75rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .filename { font-weight: 500; word-break: break-all; font-size: 0.85rem; }
    `,
  ],
})
export class MediaLibraryComponent {
  private readonly storage = inject(Storage);
  private readonly fs = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly data = inject(UserDataService);

  protected readonly assets = this.data.mediaAssets();
  protected readonly inProgress = signal<UploadProgress[]>([]);
  protected readonly isDragging = signal<boolean>(false);
  protected readonly copied = signal<string | null>(null);
  protected readonly ts = formatTimestamp;

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files) await this.handleFiles(files);
  }

  protected async onFiles(files: FileList | null): Promise<void> {
    if (!files) return;
    await this.handleFiles(files);
  }

  private async handleFiles(files: FileList): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) continue;
      void this.uploadOne(uid, file);
    }
  }

  private async uploadOne(uid: string, file: File): Promise<void> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `users/${uid}/media/${Date.now()}_${safeName}`;
    const ref = storageRef(this.storage, path);

    this.inProgress.update((list) => [
      ...list,
      { filename: file.name, percent: 0 },
    ]);

    const task = uploadBytesResumable(ref, file, { contentType: file.type });

    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        this.inProgress.update((list) =>
          list.map((p) =>
            p.filename === file.name ? { ...p, percent: pct } : p,
          ),
        );
      },
      (err) => {
        this.inProgress.update((list) =>
          list.map((p) =>
            p.filename === file.name ? { ...p, error: err.message } : p,
          ),
        );
      },
      async () => {
        const downloadUrl = await getDownloadURL(ref);
        await addDoc(
          collection(this.fs, `users/${uid}/mediaAssets`),
          {
            kind: file.type.startsWith('video/') ? 'video' : 'image',
            downloadUrl,
            storagePath: path,
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            createdAt: serverTimestamp(),
          },
        );
        this.inProgress.update((list) =>
          list.filter((p) => p.filename !== file.name),
        );
      },
    );
  }

  protected formatSize(bytes?: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  protected async copyUrl(asset: MediaAssetDoc): Promise<void> {
    try {
      await navigator.clipboard.writeText(asset.downloadUrl);
      this.copied.set(asset.id);
      setTimeout(() => {
        if (this.copied() === asset.id) this.copied.set(null);
      }, 1500);
    } catch {
      // ignore
    }
  }
}
