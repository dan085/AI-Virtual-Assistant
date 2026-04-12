import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">🤖 AI Assistant</div>

        @if (auth.user()) {
          <nav>
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Dashboard</a>
            <a routerLink="/agents" routerLinkActive="active">Agents</a>
            <a routerLink="/chat" routerLinkActive="active">Chat</a>
            <a routerLink="/instagram" routerLinkActive="active">Instagram</a>
            <a routerLink="/connections" routerLinkActive="active">Connections</a>
          </nav>
          <button class="signout" (click)="auth.signOut()">Sign out</button>
        } @else {
          <nav>
            <a routerLink="/login" routerLinkActive="active">Sign in</a>
          </nav>
        }
      </aside>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        display: grid;
        grid-template-columns: 240px 1fr;
        min-height: 100vh;
      }
      .sidebar {
        background: var(--panel);
        border-right: 1px solid var(--border);
        padding: 1.5rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .brand {
        font-weight: 700;
        font-size: 1.1rem;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      nav { display: flex; flex-direction: column; gap: 0.25rem; }
      nav a {
        padding: 0.55rem 0.85rem;
        border-radius: 8px;
        color: var(--text-dim);
      }
      nav a.active,
      nav a:hover {
        background: var(--panel-2);
        color: var(--text);
        text-decoration: none;
      }
      .signout { margin-top: auto; }
      .content { padding: 2rem; overflow: auto; }
      @media (max-width: 720px) {
        .shell { grid-template-columns: 1fr; }
        .sidebar { border-right: none; border-bottom: 1px solid var(--border); }
      }
    `,
  ],
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
}
