import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminAgent, ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-admin-agents',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!auth.isAdmin()) {
      <h1>Admin</h1>
      <p class="error">
        You don't have the admin role. Run
        <code>admin.auth().setCustomUserClaims(uid, {{ '{' }} admin: true {{ '}' }})</code>
        on your uid to grant it.
      </p>
    } @else {
      <h1>Admin · Agents</h1>
      <p class="dim">
        Edit built-in agent personas at runtime. Changes land in the
        <code>agents/{{ '{' }}id{{ '}' }}</code> Firestore collection and override the
        in-code defaults on the next chat request.
      </p>

      @if (loading()) { <div class="dim">Loading…</div> }
      @if (error()) { <div class="error">{{ error() }}</div> }

      <div class="layout">
        <aside class="list">
          @for (a of agents(); track a.id) {
            <button
              type="button"
              class="item"
              [class.active]="selected()?.id === a.id"
              (click)="select(a)"
            >
              <div class="name">{{ a.displayName ?? a.id }}</div>
              <div class="id">{{ a.id }}</div>
            </button>
          }
        </aside>

        @if (selected(); as agent) {
          <div class="editor card">
            <label>
              <span>Display name</span>
              <input type="text" [(ngModel)]="editName" name="editName" />
            </label>
            <label>
              <span>Tagline</span>
              <input type="text" [(ngModel)]="editTagline" name="editTagline" />
            </label>
            <label>
              <span>Description</span>
              <textarea rows="3" [(ngModel)]="editDescription" name="editDescription"></textarea>
            </label>
            <label>
              <span>System prompt</span>
              <textarea rows="14" [(ngModel)]="editPrompt" name="editPrompt"></textarea>
            </label>
            <label>
              <span>Skills (comma-separated)</span>
              <input type="text" [(ngModel)]="editSkills" name="editSkills" />
            </label>
            <label class="check">
              <input type="checkbox" [(ngModel)]="editPublished" name="editPublished" />
              <span>Published (visible in agent picker)</span>
            </label>

            <div class="actions">
              <button class="primary" (click)="save()" [disabled]="saving()">
                @if (saving()) { Saving… } @else { Save }
              </button>
              <button (click)="reloadFromServer()">Revert</button>
            </div>
            @if (saveSuccess()) { <div class="success">Saved.</div> }
          </div>
        } @else {
          <div class="editor dim">Select an agent to edit.</div>
        }
      </div>
    }
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      .dim { color: var(--text-dim); }
      .error { color: var(--danger); }
      .success { color: var(--success); margin-top: 0.5rem; }
      code { background: var(--panel-2); padding: 0 0.25rem; border-radius: 3px; }
      .layout {
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 1.25rem;
        margin-top: 1rem;
      }
      @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
      .list { display: flex; flex-direction: column; gap: 0.35rem; }
      .item {
        text-align: left;
        background: var(--panel);
        border: 1px solid var(--border);
        padding: 0.75rem 1rem;
        cursor: pointer;
      }
      .item.active { border-color: var(--accent); }
      .name { font-weight: 500; }
      .id { font-size: 0.7rem; color: var(--text-dim); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .editor label {
        display: block;
        margin-bottom: 0.75rem;
      }
      .editor label span {
        display: block;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
        margin-bottom: 0.25rem;
      }
      .editor textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
      .check { display: flex; align-items: center; gap: 0.5rem; }
      .check span {
        font-size: 0.85rem;
        text-transform: none;
        letter-spacing: 0;
        margin: 0;
      }
      .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
    `,
  ],
})
export class AdminAgentsComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);

  protected readonly agents = signal<AdminAgent[]>([]);
  protected readonly selected = signal<AdminAgent | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal<boolean>(false);
  protected readonly saveSuccess = signal<boolean>(false);

  protected editName = '';
  protected editTagline = '';
  protected editDescription = '';
  protected editPrompt = '';
  protected editSkills = '';
  protected editPublished = true;

  ngOnInit(): void {
    if (this.auth.isAdmin()) void this.reloadFromServer();
  }

  protected async reloadFromServer(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.adminListAllAgents();
      this.agents.set(res.agents);
      if (this.selected()) {
        const fresh = res.agents.find((a) => a.id === this.selected()!.id);
        if (fresh) this.select(fresh);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      this.loading.set(false);
    }
  }

  protected select(agent: AdminAgent): void {
    this.selected.set(agent);
    this.editName = agent.displayName ?? '';
    this.editTagline = agent.tagline ?? '';
    this.editDescription = agent.description ?? '';
    this.editPrompt = agent.systemPrompt ?? '';
    this.editSkills = (agent.skills ?? []).join(', ');
    this.editPublished = agent.published !== false;
    this.saveSuccess.set(false);
  }

  protected async save(): Promise<void> {
    const current = this.selected();
    if (!current) return;
    this.saving.set(true);
    this.error.set(null);
    this.saveSuccess.set(false);
    try {
      await this.api.adminUpdateAgent({
        id: current.id,
        displayName: this.editName,
        tagline: this.editTagline,
        description: this.editDescription,
        systemPrompt: this.editPrompt,
        skills: this.editSkills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        published: this.editPublished,
      });
      this.saveSuccess.set(true);
      await this.reloadFromServer();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      this.saving.set(false);
    }
  }
}
