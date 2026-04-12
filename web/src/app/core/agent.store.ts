import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, AgentSummary, SkillDescriptor } from './api.service';

const STORAGE_KEY = 'ava.selectedAgentId';

@Injectable({ providedIn: 'root' })
export class AgentStore {
  private readonly api = inject(ApiService);

  private readonly _agents = signal<AgentSummary[]>([]);
  private readonly _skills = signal<SkillDescriptor[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _selectedId = signal<string>(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY) ?? 'default'
      : 'default',
  );
  private readonly _error = signal<string | null>(null);

  readonly agents = this._agents.asReadonly();
  readonly skills = this._skills.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();

  readonly selected = computed<AgentSummary | undefined>(() =>
    this._agents().find((a) => a.id === this._selectedId()),
  );

  async load(): Promise<void> {
    if (this._loading() || this._agents().length > 0) return;
    this._loading.set(true);
    this._error.set(null);
    try {
      const res = await this.api.listAvailableAgents();
      this._agents.set(res.agents);
      this._skills.set(res.skills);
      // If the persisted selection is no longer available, fall back.
      if (!res.agents.some((a) => a.id === this._selectedId())) {
        this.select(res.agents[0]?.id ?? 'default');
      }
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Failed to load agents.');
    } finally {
      this._loading.set(false);
    }
  }

  select(agentId: string): void {
    this._selectedId.set(agentId);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, agentId);
    }
  }

  skillLabel(skillId: string): string {
    return this._skills().find((s) => s.id === skillId)?.label ?? skillId;
  }
}
