import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UserDataService, VideoJobDoc, formatTimestamp } from '../../core/user-data.service';

@Component({
  selector: 'app-videos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>AI video jobs</h1>
    <p class="dim">
      Video generation jobs submitted by the agent or directly by you.
      Live-updating from Firestore.
    </p>

    @if (jobs() === undefined) {
      <div class="dim">Loading…</div>
    } @else if ((jobs() ?? []).length === 0) {
      <div class="empty">
        No jobs yet. Ask Nina to "make me a 6-second vertical video of …" to start one.
      </div>
    } @else {
      <div class="grid">
        @for (j of jobs(); track j.id) {
          <div class="card" [class]="'status-' + j.status">
            <div class="media">
              @if (j.status === 'succeeded' && j.videoUrl) {
                <video [src]="j.videoUrl" controls muted [poster]="j.thumbnailUrl ?? ''"></video>
              } @else if (j.status === 'failed') {
                <div class="placeholder error">Failed</div>
              } @else {
                <div class="placeholder">
                  <div class="spinner"></div>
                  <div class="pct">{{ j.progress ?? 0 }}%</div>
                </div>
              }
            </div>
            <div class="body">
              <div class="header">
                <span class="status">{{ j.status }}</span>
                <span class="provider dim">{{ j.providerId }}</span>
              </div>
              <div class="prompt">{{ j.prompt }}</div>
              <div class="meta dim">
                {{ j.aspectRatio }} · {{ j.durationSeconds }}s ·
                {{ ts(j.createdAt) }}
              </div>
              @if (j.errorMessage) {
                <div class="error-msg">{{ j.errorMessage }}</div>
              }
              @if (j.status === 'succeeded' && j.videoUrl) {
                <a [href]="j.videoUrl" target="_blank" rel="noopener">Open video ↗</a>
              }
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
      .empty { color: var(--text-dim); margin-top: 2rem; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      .card.status-failed { border-color: var(--danger); }
      .card.status-succeeded { border-color: var(--success); }
      .card {
        padding: 0;
        overflow: hidden;
      }
      .media { background: var(--panel-2); }
      .media video {
        width: 100%;
        aspect-ratio: 9/16;
        object-fit: cover;
        display: block;
      }
      .placeholder {
        aspect-ratio: 9/16;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        color: var(--text-dim);
      }
      .placeholder.error { color: var(--danger); font-weight: 600; }
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .pct { font-size: 0.85rem; }
      .body { padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
      .header { display: flex; justify-content: space-between; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
      .status { color: var(--accent); }
      .status-failed .status { color: var(--danger); }
      .status-succeeded .status { color: var(--success); }
      .prompt { font-size: 0.85rem; }
      .meta { font-size: 0.7rem; }
      .error-msg { color: var(--danger); font-size: 0.8rem; }
    `,
  ],
})
export class VideosComponent {
  private readonly data = inject(UserDataService);
  protected readonly jobs = this.data.videoJobs();
  protected readonly ts = formatTimestamp;
}
