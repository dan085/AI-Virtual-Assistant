import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { UserDataService } from '../../core/user-data.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Welcome{{ name() ? ', ' + name() : '' }} 👋</h1>
    <p class="dim">Live overview of your workspace.</p>

    <div class="stats">
      <a class="stat card" routerLink="/tickets">
        <div class="label">Service tickets</div>
        <div class="value">{{ ticketCount() }}</div>
        <div class="sub dim">{{ ticketsOpen() }} open</div>
      </a>
      <a class="stat card" routerLink="/videos">
        <div class="label">AI video jobs</div>
        <div class="value">{{ videoCount() }}</div>
        <div class="sub dim">{{ videosRunning() }} in progress</div>
      </a>
      <a class="stat card" routerLink="/scheduler">
        <div class="label">Scheduled posts</div>
        <div class="value">{{ scheduledCount() }}</div>
        <div class="sub dim">{{ scheduledUpcoming() }} upcoming</div>
      </a>
      <a class="stat card" routerLink="/media">
        <div class="label">Media assets</div>
        <div class="value">{{ mediaCount() }}</div>
        <div class="sub dim">{{ mediaImages() }} images · {{ mediaVideos() }} videos</div>
      </a>
    </div>

    <h2>Quick actions</h2>
    <div class="grid">
      <a class="card tile" routerLink="/chat">
        <div class="icon">💬</div>
        <h3>Chat with your agent</h3>
        <p>Emma, Nina, Dr. Pineapple, or Chronos.</p>
      </a>
      <a class="card tile" routerLink="/scheduler">
        <div class="icon">⏰</div>
        <h3>Schedule a post</h3>
        <p>Queue multi-platform content for later.</p>
      </a>
      <a class="card tile" routerLink="/media">
        <div class="icon">🖼</div>
        <h3>Upload media</h3>
        <p>Drop files to get public URLs.</p>
      </a>
      <a class="card tile" routerLink="/connections">
        <div class="icon">🔗</div>
        <h3>Connect accounts</h3>
        <p>Instagram, Facebook, Twitter, TikTok.</p>
      </a>
    </div>
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      h2 { margin-top: 2rem; }
      .dim { color: var(--text-dim); }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
        margin: 1.5rem 0;
      }
      .stat {
        display: block;
        color: var(--text);
        transition: transform 0.15s, border-color 0.15s;
      }
      .stat:hover {
        transform: translateY(-2px);
        border-color: var(--accent);
        text-decoration: none;
      }
      .stat .label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
      }
      .stat .value {
        font-size: 2.25rem;
        font-weight: 700;
        margin: 0.25rem 0;
      }
      .stat .sub { font-size: 0.8rem; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      .tile {
        color: var(--text);
        transition: transform 0.15s, border-color 0.15s;
        display: block;
      }
      .tile:hover {
        transform: translateY(-2px);
        border-color: var(--accent);
        text-decoration: none;
      }
      .icon { font-size: 1.75rem; }
      h3 { margin: 0.5rem 0 0.25rem; }
      p { margin: 0; color: var(--text-dim); }
    `,
  ],
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly data = inject(UserDataService);

  protected readonly name = () => this.auth.user()?.displayName ?? '';

  private readonly tickets = this.data.tickets();
  private readonly videos = this.data.videoJobs();
  private readonly scheduled = this.data.scheduledPosts();
  private readonly media = this.data.mediaAssets();

  protected readonly ticketCount = computed(() => this.tickets()?.length ?? 0);
  protected readonly ticketsOpen = computed(
    () => this.tickets()?.filter((t) => (t.status ?? 'open') === 'open').length ?? 0,
  );

  protected readonly videoCount = computed(() => this.videos()?.length ?? 0);
  protected readonly videosRunning = computed(
    () =>
      this.videos()?.filter((v) => v.status === 'queued' || v.status === 'running').length ?? 0,
  );

  protected readonly scheduledCount = computed(() => this.scheduled()?.length ?? 0);
  protected readonly scheduledUpcoming = computed(
    () => this.scheduled()?.filter((p) => p.status === 'scheduled').length ?? 0,
  );

  protected readonly mediaCount = computed(() => this.media()?.length ?? 0);
  protected readonly mediaImages = computed(
    () => this.media()?.filter((m) => m.kind === 'image').length ?? 0,
  );
  protected readonly mediaVideos = computed(
    () => this.media()?.filter((m) => m.kind === 'video').length ?? 0,
  );
}
