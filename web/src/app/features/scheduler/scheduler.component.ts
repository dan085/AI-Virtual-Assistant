import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, SocialPlatformId } from '../../core/api.service';
import {
  ScheduledPostDoc,
  UserDataService,
  formatTimestamp,
} from '../../core/user-data.service';

type MediaType = 'IMAGE' | 'VIDEO' | 'REEL_OR_SHORT' | 'STORY' | 'TEXT';

@Component({
  selector: 'app-scheduler',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Scheduled posts</h1>
    <p class="dim">
      Queue posts for automatic multi-platform publishing. The scheduler
      runs every minute and publishes due posts via your connected
      accounts.
    </p>

    <details open class="card">
      <summary><h3>New scheduled post</h3></summary>
      <form (submit)="onSubmit($event)">
        <div class="row">
          <label class="full">
            <span>Platforms</span>
            <div class="platforms">
              @for (p of platformOptions; track p.id) {
                <label class="check">
                  <input
                    type="checkbox"
                    [checked]="selectedPlatforms().includes(p.id)"
                    (change)="togglePlatform(p.id)"
                  />
                  <span>{{ p.label }}</span>
                </label>
              }
            </div>
          </label>
        </div>

        <div class="row">
          <label>
            <span>Media type</span>
            <select [(ngModel)]="mediaType" name="mediaType">
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
              <option value="REEL_OR_SHORT">Reel / Short</option>
              <option value="STORY">Story</option>
              <option value="TEXT">Text (Twitter only)</option>
            </select>
          </label>

          <label>
            <span>Scheduled at</span>
            <input type="datetime-local" [(ngModel)]="scheduledAt" name="scheduledAt" required />
          </label>
        </div>

        @if (mediaType() !== 'TEXT') {
          <div class="row">
            <label class="full">
              <span>Image URL</span>
              <input type="url" [(ngModel)]="imageUrl" name="imageUrl" placeholder="https://…/photo.jpg" />
            </label>
          </div>
          <div class="row">
            <label class="full">
              <span>Video URL</span>
              <input type="url" [(ngModel)]="videoUrl" name="videoUrl" placeholder="https://…/clip.mp4" />
            </label>
          </div>
        }

        <div class="row">
          <label class="full">
            <span>Caption</span>
            <textarea rows="4" maxlength="2200" [(ngModel)]="caption" name="caption"></textarea>
          </label>
        </div>

        <button class="primary" type="submit" [disabled]="!canSubmit() || submitting()">
          @if (submitting()) { Scheduling… } @else { Schedule }
        </button>
        @if (error()) { <div class="error">{{ error() }}</div> }
        @if (success()) { <div class="success">Scheduled! id: {{ success() }}</div> }
      </form>
    </details>

    @if (posts() === undefined) {
      <div class="dim">Loading…</div>
    } @else if ((posts() ?? []).length === 0) {
      <div class="empty">No scheduled posts yet.</div>
    } @else {
      <table class="posts">
        <thead>
          <tr>
            <th>When</th>
            <th>Platforms</th>
            <th>Type</th>
            <th>Caption</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (p of posts(); track p.id) {
            <tr>
              <td>{{ ts(p.scheduledAt) }}</td>
              <td>
                <div class="chips">
                  @for (pl of p.platforms; track pl) { <span class="chip">{{ pl }}</span> }
                </div>
              </td>
              <td>{{ p.mediaType }}</td>
              <td class="caption">{{ p.caption | slice:0:80 }}{{ (p.caption?.length ?? 0) > 80 ? '…' : '' }}</td>
              <td>
                <span class="status" [class]="'status-' + p.status">{{ p.status }}</span>
                @if (p.results) {
                  <div class="results">
                    @for (entry of resultEntries(p); track entry.platform) {
                      <span class="res" [class.ok]="entry.status === 'ok'" [class.fail]="entry.status === 'failed'">
                        {{ entry.platform }}: {{ entry.status }}
                      </span>
                    }
                  </div>
                }
              </td>
              <td>
                @if (p.status === 'scheduled') {
                  <button (click)="cancel(p.id)">Cancel</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      .dim { color: var(--text-dim); }
      .empty { margin-top: 2rem; color: var(--text-dim); }
      details.card { margin: 1rem 0 1.5rem; padding: 1rem 1.25rem; }
      details summary { cursor: pointer; list-style: none; }
      details summary h3 { display: inline; margin: 0; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 0.75rem; }
      .row .full { grid-column: 1 / -1; }
      label span {
        display: block;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
        margin-bottom: 0.25rem;
      }
      .platforms { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .check { display: flex; align-items: center; gap: 0.35rem; font-size: 0.9rem; }
      .check span {
        font-size: 0.85rem;
        text-transform: none;
        letter-spacing: 0;
        margin: 0;
        color: var(--text);
      }
      .error { color: var(--danger); font-size: 0.85rem; margin-top: 0.5rem; }
      .success { color: var(--success); font-size: 0.85rem; margin-top: 0.5rem; }
      table.posts { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      th, td {
        padding: 0.6rem 0.75rem;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
      }
      th { color: var(--text-dim); font-size: 0.7rem; text-transform: uppercase; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
      .chip {
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--text-dim);
      }
      .caption { max-width: 280px; }
      .status {
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        border: 1px solid currentColor;
      }
      .status-scheduled { color: var(--accent); }
      .status-publishing { color: #ffb454; }
      .status-published { color: var(--success); }
      .status-partially_published { color: #ffb454; }
      .status-failed { color: var(--danger); }
      .status-cancelled { color: var(--text-dim); }
      .results { display: flex; gap: 0.25rem; margin-top: 0.35rem; flex-wrap: wrap; }
      .res {
        font-size: 0.65rem;
        padding: 0.1rem 0.4rem;
        border-radius: 3px;
      }
      .res.ok { color: var(--success); border: 1px solid var(--success); }
      .res.fail { color: var(--danger); border: 1px solid var(--danger); }
    `,
  ],
})
export class SchedulerComponent {
  private readonly api = inject(ApiService);
  private readonly data = inject(UserDataService);

  protected readonly posts = this.data.scheduledPosts();
  protected readonly ts = formatTimestamp;

  protected readonly platformOptions = [
    { id: 'instagram' as const, label: 'Instagram' },
    { id: 'facebook' as const, label: 'Facebook' },
    { id: 'twitter' as const, label: 'Twitter / X' },
    { id: 'tiktok' as const, label: 'TikTok' },
  ];

  protected readonly selectedPlatforms = signal<SocialPlatformId[]>(['instagram']);
  protected readonly mediaType = signal<MediaType>('IMAGE');
  protected readonly caption = signal<string>('');
  protected readonly imageUrl = signal<string>('');
  protected readonly videoUrl = signal<string>('');
  protected readonly scheduledAt = signal<string>(this.defaultFutureDateLocal());
  protected readonly submitting = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly canSubmit = computed(() => {
    return (
      this.selectedPlatforms().length > 0 &&
      this.scheduledAt().length > 0 &&
      (this.mediaType() === 'TEXT'
        ? this.caption().length > 0
        : this.imageUrl().length > 0 || this.videoUrl().length > 0)
    );
  });

  protected togglePlatform(id: SocialPlatformId): void {
    this.selectedPlatforms.update((list) =>
      list.includes(id) ? list.filter((p) => p !== id) : [...list, id],
    );
  }

  protected resultEntries(p: ScheduledPostDoc): Array<{ platform: string; status: string }> {
    if (!p.results) return [];
    return Object.entries(p.results).map(([platform, r]) => ({
      platform,
      status: r.status,
    }));
  }

  private defaultFutureDateLocal(): string {
    const d = new Date(Date.now() + 15 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit() || this.submitting()) return;
    this.error.set(null);
    this.success.set(null);
    this.submitting.set(true);
    try {
      const res = await this.api.createScheduledPost({
        platforms: this.selectedPlatforms(),
        mediaType: this.mediaType(),
        caption: this.caption() || undefined,
        imageUrl: this.imageUrl() || undefined,
        videoUrl: this.videoUrl() || undefined,
        scheduledAtIso: new Date(this.scheduledAt()).toISOString(),
      });
      this.success.set(res.id);
      this.caption.set('');
      this.imageUrl.set('');
      this.videoUrl.set('');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to schedule.');
    } finally {
      this.submitting.set(false);
    }
  }

  async cancel(id: string): Promise<void> {
    if (!confirm('Cancel this scheduled post?')) return;
    try {
      await this.api.cancelScheduledPost(id);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Cancel failed.');
    }
  }
}
