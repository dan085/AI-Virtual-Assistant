import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {
  ApiService,
  AvailablePlatform,
  ConnectedSocialAccount,
  SocialPlatformId,
} from '../../core/api.service';

@Component({
  selector: 'app-connections',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Social connections</h1>
    <p class="dim">
      Connect your own Instagram, Twitter/X, and TikTok accounts. The AI
      agent can then publish to them on your behalf. We store only the
      OAuth tokens — never your passwords.
    </p>

    @if (loading()) { <div class="dim">Loading…</div> }
    @if (error()) { <div class="error">{{ error() }}</div> }

    <div class="grid">
      @for (p of available(); track p.id) {
        <div class="card">
          <div class="header">
            <div>
              <h3>{{ p.label }}</h3>
              <div class="dim supported">{{ formatSupported(p) }}</div>
            </div>
            @if (connectedFor(p.id); as acc) {
              <span class="badge ok">Connected</span>
            } @else if (!p.configured) {
              <span class="badge warn">Not configured</span>
            }
          </div>

          @if (connectedFor(p.id); as acc) {
            <div class="details">
              <div><strong>Handle:</strong> {{ acc.handle ?? acc.accountId }}</div>
              @if (acc.connectedAt) {
                <div><strong>Connected:</strong> {{ formatTime(acc.connectedAt) }}</div>
              }
              @if (acc.expiresAt) {
                <div><strong>Token expires:</strong> {{ formatTime(acc.expiresAt) }}</div>
              }
              @if (acc.scopes?.length) {
                <div class="scopes">
                  @for (s of acc.scopes; track s) { <span class="chip">{{ s }}</span> }
                </div>
              }
            </div>
            <button (click)="disconnect(p.id)">Disconnect</button>
          } @else {
            <p class="dim">
              @if (!p.configured) {
                Platform credentials are not configured yet. Set the
                client secrets via <code>firebase functions:secrets:set</code>.
              } @else {
                Click connect to authorize your account.
              }
            </p>
            <button
              class="primary"
              (click)="connect(p.id)"
              [disabled]="!p.configured || busyPlatform() === p.id"
            >
              @if (busyPlatform() === p.id) { Redirecting… } @else { Connect {{ p.label }} }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      .dim { color: var(--text-dim); }
      .error { color: var(--danger); }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 1rem;
        margin-top: 1.5rem;
      }
      .card { display: flex; flex-direction: column; gap: 0.75rem; }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.5rem;
      }
      h3 { margin: 0; }
      .supported { font-size: 0.75rem; margin-top: 0.25rem; }
      .badge {
        font-size: 0.7rem;
        padding: 0.2rem 0.5rem;
        border-radius: 999px;
      }
      .badge.ok { background: var(--success); color: #001; }
      .badge.warn { background: #3a2a10; color: #ffb454; border: 1px solid #ffb454; }
      .details { font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.25rem; }
      .scopes { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }
      .chip {
        font-size: 0.65rem;
        padding: 0.1rem 0.4rem;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--text-dim);
      }
      code { background: var(--panel-2); padding: 0 0.25rem; border-radius: 3px; }
    `,
  ],
})
export class ConnectionsComponent implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly connected = signal<ConnectedSocialAccount[]>([]);
  protected readonly available = signal<AvailablePlatform[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busyPlatform = signal<SocialPlatformId | null>(null);

  ngOnInit(): void {
    void this.reload();
  }

  protected connectedFor(id: SocialPlatformId): ConnectedSocialAccount | undefined {
    return this.connected().find((c) => c.platform === id);
  }

  protected formatSupported(p: AvailablePlatform): string {
    return `Supports: ${p.supportedMediaTypes.join(', ')}`;
  }

  protected formatTime(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleString();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.listSocialConnections();
      this.connected.set(res.connected);
      this.available.set(res.available);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      this.loading.set(false);
    }
  }

  async connect(platform: SocialPlatformId): Promise<void> {
    this.busyPlatform.set(platform);
    this.error.set(null);
    try {
      const { authorizeUrl } = await this.api.startSocialOAuth(platform);
      window.location.href = authorizeUrl;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to start OAuth.');
      this.busyPlatform.set(null);
    }
  }

  async disconnect(platform: SocialPlatformId): Promise<void> {
    if (!confirm(`Disconnect ${platform}? The agent will no longer be able to post there.`)) return;
    try {
      await this.api.disconnectSocial(platform);
      await this.reload();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Disconnect failed.');
    }
  }
}
