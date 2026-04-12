import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Welcome{{ name() ? ', ' + name() : '' }} 👋</h1>
    <p class="dim">Choose what you want to do today.</p>

    <div class="grid">
      <a class="card tile" routerLink="/chat">
        <div class="icon">💬</div>
        <h3>Chat with your agent</h3>
        <p>Conversational assistant powered by Gemini.</p>
      </a>
      <a class="card tile" routerLink="/instagram">
        <div class="icon">📸</div>
        <h3>Publish to Instagram</h3>
        <p>Draft captions and publish images to your IG Business account.</p>
      </a>
    </div>
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      .dim { color: var(--text-dim); }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 1rem;
        margin-top: 1.5rem;
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
  protected readonly name = () => this.auth.user()?.displayName ?? '';
}
