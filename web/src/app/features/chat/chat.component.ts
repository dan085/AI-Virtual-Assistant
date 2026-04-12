import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AgentStore } from '../../core/agent.store';

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  agentDisplayName?: string;
  toolCalls?: Array<{ name: string; input: unknown }>;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat">
      <header class="chat-header">
        <div class="agent-picker">
          <label for="agent-select">Agent</label>
          <select
            id="agent-select"
            [value]="store.selectedId()"
            (change)="onAgentChange($event)"
            [disabled]="store.loading()"
          >
            @for (a of store.agents(); track a.id) {
              <option [value]="a.id">{{ a.displayName }} — {{ a.tagline }}</option>
            }
          </select>
        </div>
        @if (store.selected(); as agent) {
          <div class="agent-meta">
            <div class="agent-desc">{{ agent.description }}</div>
            <div class="skills">
              @for (skill of agent.skills; track skill) {
                <span class="skill">{{ store.skillLabel(skill) }}</span>
              }
            </div>
          </div>
        }
      </header>

      <div class="messages" #scroller>
        @for (msg of messages(); track $index) {
          <div class="bubble" [class.user]="msg.role === 'user'" [class.assistant]="msg.role === 'assistant'">
            <div class="role">
              {{ msg.role === 'user' ? 'You' : (msg.agentDisplayName ?? 'Assistant') }}
            </div>
            <div class="content">
              @if (msg.pending) {
                <span class="typing">thinking…</span>
              } @else {
                {{ msg.content }}
              }
            </div>
            @if (msg.toolCalls?.length) {
              <div class="tool-calls">
                @for (tc of msg.toolCalls; track $index) {
                  <span class="tool-call" title="{{ toJson(tc.input) }}">
                    🛠 {{ tc.name }}
                  </span>
                }
              </div>
            }
          </div>
        } @empty {
          <div class="empty">Say hi to start a conversation.</div>
        }
      </div>

      <form class="composer" (submit)="onSubmit($event)">
        <input
          type="text"
          placeholder="Type a message…"
          [(ngModel)]="draft"
          name="draft"
          [disabled]="sending()"
          autocomplete="off"
        />
        <button class="primary" type="submit" [disabled]="sending() || !draft().trim()">
          Send
        </button>
      </form>

      @if (error()) {
        <div class="error">{{ error() }}</div>
      }
    </div>
  `,
  styles: [
    `
      .chat {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 4rem);
        max-width: 820px;
        margin: 0 auto;
      }
      .chat-header {
        border-bottom: 1px solid var(--border);
        padding: 0.75rem 1rem 1rem;
      }
      .agent-picker {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .agent-picker label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
      }
      .agent-picker select {
        flex: 1;
        background: var(--panel);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 0.5rem 0.75rem;
        border-radius: 8px;
      }
      .agent-meta {
        margin-top: 0.5rem;
      }
      .agent-desc {
        font-size: 0.85rem;
        color: var(--text-dim);
      }
      .skills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.5rem;
      }
      .skill {
        font-size: 0.7rem;
        padding: 0.2rem 0.55rem;
        background: var(--panel-2);
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--text-dim);
      }
      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .empty { color: var(--text-dim); text-align: center; margin-top: 3rem; }
      .bubble {
        max-width: 75%;
        padding: 0.75rem 1rem;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--panel);
      }
      .bubble.user {
        align-self: flex-end;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        border-color: transparent;
        color: white;
      }
      .role {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.75;
        margin-bottom: 0.25rem;
      }
      .content { white-space: pre-wrap; }
      .typing { opacity: 0.6; font-style: italic; }
      .tool-calls {
        margin-top: 0.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .tool-call {
        font-size: 0.7rem;
        padding: 0.2rem 0.55rem;
        background: rgba(99, 102, 241, 0.15);
        border: 1px solid var(--accent);
        border-radius: 6px;
        color: var(--accent);
      }
      .composer {
        display: flex;
        gap: 0.5rem;
        padding: 1rem;
        border-top: 1px solid var(--border);
      }
      .composer input { flex: 1; }
      .error {
        color: var(--danger);
        padding: 0 1rem 1rem;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class ChatComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly store = inject(AgentStore);
  private readonly scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');

  protected readonly messages = signal<UiMessage[]>([]);
  protected readonly draft = signal<string>('');
  protected readonly sending = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  private readonly conversationId = this.makeConversationId();

  constructor() {
    effect(() => {
      this.messages();
      queueMicrotask(() => {
        const el = this.scroller()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  ngOnInit(): void {
    void this.store.load();
  }

  protected onAgentChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.store.select(id);
    // New agent → reset the conversation locally so history doesn't bleed.
    this.messages.set([]);
  }

  protected toJson(x: unknown): string {
    try { return JSON.stringify(x); } catch { return ''; }
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    this.error.set(null);
    this.draft.set('');
    this.sending.set(true);

    const agentId = this.store.selectedId();

    this.messages.update((m) => [
      ...m,
      { role: 'user', content: text },
      { role: 'assistant', content: '', pending: true },
    ]);

    try {
      const res = await this.api.chatWithAgent({
        conversationId: this.conversationId,
        message: text,
        agentId,
      });
      this.messages.update((m) => {
        const copy = [...m];
        const lastIdx = copy.length - 1;
        copy[lastIdx] = {
          role: 'assistant',
          content: res.reply,
          agentDisplayName: res.agentDisplayName,
          toolCalls: res.toolCalls,
        };
        return copy;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      this.error.set(msg);
      this.messages.update((m) => m.filter((x) => !x.pending));
    } finally {
      this.sending.set(false);
    }
  }

  private makeConversationId(): string {
    return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
