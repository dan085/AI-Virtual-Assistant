import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { UserDataService } from '../../core/user-data.service';
import {
  analyzeMedia,
  analyzePosts,
  analyzeTickets,
  analyzeVideos,
  formatBytes,
} from '../../core/analytics';
import { BarInlineComponent } from './bar-inline.component';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [BarInlineComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Analytics</h1>
    <p class="dim">Live aggregates over every live Firestore stream.</p>

    <section class="group">
      <h2>Service tickets</h2>
      <div class="stat-row">
        <div class="stat card">
          <div class="label">Total</div>
          <div class="value">{{ tickets().total }}</div>
        </div>
        <div class="stat card">
          <div class="label">💧 Liquid damage</div>
          <div class="value danger">{{ tickets().liquidDamageCount }}</div>
        </div>
        <div class="stat card">
          <div class="label">💥 Physical</div>
          <div class="value warn">{{ tickets().physicalDamageCount }}</div>
        </div>
      </div>
      <div class="charts">
        <div class="card">
          <div class="chart-title">By status</div>
          <app-bar-inline [data]="tickets().byStatus"></app-bar-inline>
        </div>
        <div class="card">
          <div class="chart-title">By device family</div>
          <app-bar-inline [data]="tickets().byFamily"></app-bar-inline>
        </div>
        <div class="card">
          <div class="chart-title">By urgency</div>
          <app-bar-inline [data]="tickets().byUrgency"></app-bar-inline>
        </div>
      </div>
    </section>

    <section class="group">
      <h2>AI video jobs</h2>
      <div class="stat-row">
        <div class="stat card">
          <div class="label">Total</div>
          <div class="value">{{ videos().total }}</div>
        </div>
        <div class="stat card">
          <div class="label">Success rate</div>
          <div class="value">{{ (videos().successRate * 100).toFixed(0) }}%</div>
        </div>
        <div class="stat card">
          <div class="label">Avg progress</div>
          <div class="value">{{ videos().avgProgress.toFixed(0) }}%</div>
        </div>
      </div>
      <div class="charts">
        <div class="card">
          <div class="chart-title">By status</div>
          <app-bar-inline [data]="videos().byStatus"></app-bar-inline>
        </div>
        <div class="card">
          <div class="chart-title">By provider</div>
          <app-bar-inline [data]="videos().byProvider"></app-bar-inline>
        </div>
      </div>
    </section>

    <section class="group">
      <h2>Posts</h2>
      <div class="stat-row">
        <div class="stat card">
          <div class="label">Scheduled</div>
          <div class="value">{{ posts().totalScheduled }}</div>
        </div>
        <div class="stat card">
          <div class="label">Published</div>
          <div class="value success">{{ posts().totalPublished }}</div>
        </div>
        <div class="stat card">
          <div class="label">Platform OK</div>
          <div class="value success">{{ posts().successfulPublishes }}</div>
        </div>
        <div class="stat card">
          <div class="label">Platform fail</div>
          <div class="value danger">{{ posts().failedPublishes }}</div>
        </div>
      </div>
      <div class="charts">
        <div class="card">
          <div class="chart-title">By platform</div>
          <app-bar-inline [data]="posts().byPlatform"></app-bar-inline>
        </div>
        <div class="card">
          <div class="chart-title">Scheduled by status</div>
          <app-bar-inline [data]="posts().byStatus"></app-bar-inline>
        </div>
      </div>
    </section>

    <section class="group">
      <h2>Media library</h2>
      <div class="stat-row">
        <div class="stat card">
          <div class="label">Assets</div>
          <div class="value">{{ media().total }}</div>
        </div>
        <div class="stat card">
          <div class="label">Storage used</div>
          <div class="value">{{ fmtBytes(media().totalBytes) }}</div>
        </div>
      </div>
      <div class="charts">
        <div class="card">
          <div class="chart-title">By kind</div>
          <app-bar-inline [data]="media().byKind"></app-bar-inline>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      h2 { margin: 0 0 0.75rem; font-size: 1.1rem; }
      .dim { color: var(--text-dim); }
      .group { margin-bottom: 2rem; }
      .stat-row {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 0.75rem;
        margin-bottom: 1rem;
      }
      .stat .label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
      }
      .stat .value { font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem; }
      .stat .value.danger { color: var(--danger); }
      .stat .value.warn { color: #ffb454; }
      .stat .value.success { color: var(--success); }
      .charts {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1rem;
      }
      .chart-title {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
        margin-bottom: 0.5rem;
      }
    `,
  ],
})
export class AnalyticsComponent {
  private readonly data = inject(UserDataService);
  protected readonly fmtBytes = formatBytes;

  // Cache the signals once. Each call to data.tickets() etc creates a
  // new toSignal subscription; we save the returned Signal and read it
  // inside computed() so the reactivity chain is stable.
  private readonly _tickets = this.data.tickets();
  private readonly _videos = this.data.videoJobs();
  private readonly _scheduled = this.data.scheduledPosts();
  private readonly _instagram = this.data.instagramPosts();
  private readonly _media = this.data.mediaAssets();

  protected readonly tickets = computed(() => analyzeTickets(this._tickets()));
  protected readonly videos = computed(() => analyzeVideos(this._videos()));
  protected readonly posts = computed(() =>
    analyzePosts(this._scheduled(), this._instagram()),
  );
  protected readonly media = computed(() => analyzeMedia(this._media()));
}
