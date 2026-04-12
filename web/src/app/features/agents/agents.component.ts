import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../../core/agent.store';

@Component({
  selector: 'app-agents',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Agents</h1>
    <p class="dim">
      Pick an agent to chat with. Each agent has its own persona and a
      curated set of <strong>skills</strong> — the tools it is allowed to
      use on your behalf.
    </p>

    @if (store.loading()) {
      <div class="dim">Loading agents…</div>
    }

    @if (store.error()) {
      <div class="error">{{ store.error() }}</div>
    }

    <div class="grid">
      @for (agent of store.agents(); track agent.id) {
        <div class="card" [class.selected]="agent.id === store.selectedId()">
          <div class="header">
            <div>
              <h3>{{ agent.displayName }}</h3>
              <div class="tagline">{{ agent.tagline }}</div>
            </div>
            @if (agent.id === store.selectedId()) {
              <span class="badge">Selected</span>
            }
          </div>
          <p class="desc">{{ agent.description }}</p>
          <div class="skills">
            @for (skill of agent.skills; track skill) {
              <span class="skill">{{ store.skillLabel(skill) }}</span>
            }
          </div>
          <div class="actions">
            <button (click)="select(agent.id)" [disabled]="agent.id === store.selectedId()">
              Select
            </button>
            <button class="primary" (click)="chatWith(agent.id)">
              Chat now
            </button>
          </div>
        </div>
      }
    </div>

    @if (store.skills().length) {
      <section class="skills-section">
        <h2>All skills</h2>
        <p class="dim">
          Skills are the discrete capabilities an agent can use. Agents only
          see the skills they've been granted.
        </p>
        <ul class="skill-list">
          @for (s of store.skills(); track s.id) {
            <li>
              <strong>{{ s.label }}</strong>
              <span class="skill-id">{{ s.id }}</span>
              <p>{{ s.description }}</p>
            </li>
          }
        </ul>
      </section>
    }
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
        margin: 1.5rem 0 2.5rem;
      }
      .card { display: flex; flex-direction: column; gap: 0.75rem; }
      .card.selected { border-color: var(--accent); }
      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
      }
      h3 { margin: 0; }
      .tagline { color: var(--text-dim); font-size: 0.85rem; }
      .badge {
        background: var(--accent);
        color: white;
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
      }
      .desc { margin: 0; color: var(--text-dim); font-size: 0.9rem; }
      .skills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .skill {
        font-size: 0.7rem;
        padding: 0.2rem 0.55rem;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--text-dim);
      }
      .actions { display: flex; gap: 0.5rem; margin-top: auto; }
      .skills-section { margin-top: 2rem; }
      .skill-list {
        list-style: none;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 0.75rem;
      }
      .skill-list li {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.75rem 1rem;
      }
      .skill-list p { margin: 0.35rem 0 0; color: var(--text-dim); font-size: 0.85rem; }
      .skill-id {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.75rem;
        color: var(--text-dim);
        margin-left: 0.5rem;
      }
    `,
  ],
})
export class AgentsComponent implements OnInit {
  protected readonly store = inject(AgentStore);
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.store.load();
  }

  select(id: string): void {
    this.store.select(id);
  }

  chatWith(id: string): void {
    this.store.select(id);
    void this.router.navigateByUrl('/chat');
  }
}
