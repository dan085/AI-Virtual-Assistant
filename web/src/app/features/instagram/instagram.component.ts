import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, PublishRequest } from '../../core/api.service';

type MediaType = 'IMAGE' | 'VIDEO' | 'REELS' | 'STORIES' | 'CAROUSEL';

@Component({
  selector: 'app-instagram',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Publish to Instagram</h1>
    <p class="dim">
      Supports feed photos, feed videos, Reels, Stories, and carousels.
      Media URLs must be publicly reachable (Firebase Storage download URLs work).
    </p>

    <div class="tabs">
      @for (opt of options; track opt.id) {
        <button
          type="button"
          [class.active]="mediaType() === opt.id"
          (click)="setType(opt.id)"
        >
          {{ opt.label }}
        </button>
      }
    </div>

    <div class="layout">
      <form class="card" (submit)="onSubmit($event)">
        @if (needsImageUrl()) {
          <label>
            <span>Image URL</span>
            <input type="url" [(ngModel)]="imageUrl" name="imageUrl" placeholder="https://…/photo.jpg" required />
          </label>
        }

        @if (needsVideoUrl()) {
          <label>
            <span>Video URL</span>
            <input type="url" [(ngModel)]="videoUrl" name="videoUrl" placeholder="https://…/clip.mp4" required />
          </label>
          <label>
            <span>Cover URL (optional)</span>
            <input type="url" [(ngModel)]="coverUrl" name="coverUrl" placeholder="https://…/cover.jpg" />
          </label>
        }

        @if (mediaType() === 'REELS') {
          <label class="checkbox">
            <input type="checkbox" [(ngModel)]="shareToFeed" name="shareToFeed" />
            <span>Also share to feed grid</span>
          </label>
        }

        @if (mediaType() !== 'STORIES') {
          <label>
            <span>Caption</span>
            <textarea
              rows="5"
              maxlength="2200"
              placeholder="Your caption… #hashtags"
              [(ngModel)]="caption"
              name="caption"
            ></textarea>
            <small class="dim">{{ caption().length }} / 2200</small>
          </label>
        } @else {
          <p class="dim">Stories don't use captions. They disappear after 24h.</p>
        }

        <button class="primary" type="submit" [disabled]="!canPublish() || publishing()">
          @if (publishing()) { Publishing… } @else { Publish now }
        </button>
        @if (error()) { <div class="error">{{ error() }}</div> }
        @if (success()) { <div class="success">Published {{ mediaType() }}! Media id: {{ success() }}</div> }
      </form>

      <div class="card preview">
        <div class="preview-header">Preview — {{ mediaType() }}</div>
        @if (needsVideoUrl() && videoUrl()) {
          <video [src]="videoUrl()" controls muted></video>
        } @else if (needsImageUrl() && imageUrl()) {
          <img [src]="imageUrl()" alt="preview" (error)="imageError.set(true)" (load)="imageError.set(false)" />
          @if (imageError()) { <div class="error">Could not load image — URL must be public.</div> }
        } @else {
          <div class="placeholder">{{ mediaType() === 'VIDEO' || mediaType() === 'REELS' || (mediaType() === 'STORIES' && videoUrl()) ? 'Video' : 'Image' }} preview will appear here</div>
        }
        @if (mediaType() !== 'STORIES') {
          <div class="caption">{{ caption() || 'Your caption will appear here' }}</div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      .dim { color: var(--text-dim); }
      .tabs {
        display: flex;
        gap: 0.35rem;
        margin: 1rem 0;
        flex-wrap: wrap;
      }
      .tabs button {
        background: var(--panel);
        color: var(--text-dim);
      }
      .tabs button.active {
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        color: white;
        border-color: transparent;
      }
      .layout {
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 1.5rem;
      }
      @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
      form label {
        display: block;
        margin-bottom: 1rem;
      }
      form label span {
        display: block;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
        margin-bottom: 0.35rem;
      }
      form label.checkbox {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      form label.checkbox span {
        font-size: 0.9rem;
        text-transform: none;
        letter-spacing: 0;
        margin: 0;
        color: var(--text);
      }
      textarea { resize: vertical; }
      .error { color: var(--danger); margin-top: 0.75rem; font-size: 0.9rem; }
      .success { color: var(--success); margin-top: 0.75rem; font-size: 0.9rem; }
      .preview { display: flex; flex-direction: column; gap: 0.75rem; }
      .preview-header {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
      }
      .preview img, .preview video {
        width: 100%;
        border-radius: 8px;
        aspect-ratio: 9/16;
        object-fit: cover;
        background: var(--panel-2);
      }
      .placeholder {
        aspect-ratio: 9/16;
        border: 2px dashed var(--border);
        border-radius: 8px;
        display: grid;
        place-items: center;
        color: var(--text-dim);
      }
      .caption {
        white-space: pre-wrap;
        color: var(--text-dim);
        font-size: 0.9rem;
      }
    `,
  ],
})
export class InstagramComponent {
  private readonly api = inject(ApiService);

  protected readonly options = [
    { id: 'IMAGE' as const, label: 'Photo' },
    { id: 'REELS' as const, label: 'Reel' },
    { id: 'STORIES' as const, label: 'Story' },
    { id: 'VIDEO' as const, label: 'Feed video' },
    { id: 'CAROUSEL' as const, label: 'Carousel' },
  ];

  protected readonly mediaType = signal<MediaType>('IMAGE');
  protected readonly imageUrl = signal<string>('');
  protected readonly videoUrl = signal<string>('');
  protected readonly coverUrl = signal<string>('');
  protected readonly caption = signal<string>('');
  protected readonly shareToFeed = signal<boolean>(true);
  protected readonly publishing = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly imageError = signal<boolean>(false);

  protected readonly needsImageUrl = computed(() => {
    const t = this.mediaType();
    if (t === 'IMAGE') return true;
    if (t === 'STORIES' && !this.videoUrl().trim()) return true;
    return false;
  });

  protected readonly needsVideoUrl = computed(() => {
    const t = this.mediaType();
    return t === 'VIDEO' || t === 'REELS' || (t === 'STORIES' && !this.imageUrl().trim());
  });

  protected readonly canPublish = computed(() => {
    const t = this.mediaType();
    if (t === 'IMAGE') return this.imageUrl().trim().startsWith('http');
    if (t === 'VIDEO' || t === 'REELS') return this.videoUrl().trim().startsWith('http');
    if (t === 'STORIES') {
      return this.imageUrl().trim().startsWith('http') || this.videoUrl().trim().startsWith('http');
    }
    if (t === 'CAROUSEL') return false; // carousel editing is out of scope for this basic UI
    return false;
  });

  protected setType(t: MediaType): void {
    this.mediaType.set(t);
    this.success.set(null);
    this.error.set(null);
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canPublish() || this.publishing()) return;

    this.error.set(null);
    this.success.set(null);
    this.publishing.set(true);

    const req: PublishRequest = {
      mediaType: this.mediaType(),
      caption: this.caption().trim() || undefined,
      imageUrl: this.imageUrl().trim() || undefined,
      videoUrl: this.videoUrl().trim() || undefined,
      coverUrl: this.coverUrl().trim() || undefined,
      shareToFeed: this.mediaType() === 'REELS' ? this.shareToFeed() : undefined,
    };

    try {
      const res = await this.api.publishToInstagram(req);
      this.success.set(res.mediaId);
      this.imageUrl.set('');
      this.videoUrl.set('');
      this.coverUrl.set('');
      this.caption.set('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      this.publishing.set(false);
    }
  }
}
