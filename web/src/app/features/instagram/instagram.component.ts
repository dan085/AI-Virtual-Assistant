import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-instagram',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Publish to Instagram</h1>
    <p class="dim">
      Publishing uses the Instagram Graph API via Firebase Functions. The image
      URL must be publicly reachable (e.g. Firebase Storage download URL).
    </p>

    <div class="layout">
      <form class="card" (submit)="onSubmit($event)">
        <label>
          <span>Image URL</span>
          <input
            type="url"
            placeholder="https://…/photo.jpg"
            [(ngModel)]="imageUrl"
            name="imageUrl"
            required
          />
        </label>
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
        <button class="primary" type="submit" [disabled]="!canPublish() || publishing()">
          @if (publishing()) { Publishing… } @else { Publish now }
        </button>
        @if (error()) { <div class="error">{{ error() }}</div> }
        @if (success()) { <div class="success">Published! Media id: {{ success() }}</div> }
      </form>

      <div class="card preview">
        <div class="preview-header">Preview</div>
        @if (imageUrl()) {
          <img [src]="imageUrl()" alt="preview" (error)="imageError.set(true)" (load)="imageError.set(false)" />
          @if (imageError()) {
            <div class="error">Could not load image — make sure the URL is public.</div>
          }
        } @else {
          <div class="placeholder">Image preview will appear here</div>
        }
        <div class="caption">{{ caption() || 'Your caption will appear here' }}</div>
      </div>
    </div>
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      .dim { color: var(--text-dim); }
      .layout {
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 1.5rem;
        margin-top: 1rem;
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
      .preview img {
        width: 100%;
        border-radius: 8px;
        aspect-ratio: 1;
        object-fit: cover;
        background: var(--panel-2);
      }
      .placeholder {
        aspect-ratio: 1;
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

  protected readonly imageUrl = signal<string>('');
  protected readonly caption = signal<string>('');
  protected readonly publishing = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly imageError = signal<boolean>(false);

  protected readonly canPublish = computed(() => {
    const url = this.imageUrl().trim();
    return url.startsWith('http') && !this.imageError();
  });

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canPublish() || this.publishing()) return;

    this.error.set(null);
    this.success.set(null);
    this.publishing.set(true);

    try {
      const res = await this.api.publishToInstagram({
        imageUrl: this.imageUrl().trim(),
        caption: this.caption().trim() || undefined,
      });
      this.success.set(res.mediaId);
      this.imageUrl.set('');
      this.caption.set('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      this.publishing.set(false);
    }
  }
}
