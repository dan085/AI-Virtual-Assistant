import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat">
      <div class="messages" #scroller>
        @for (msg of messages(); track $index) {
          <div class="bubble" [class.user]="msg.role === 'user'" [class.assistant]="msg.role === 'assistant'">
            <div class="role">{{ msg.role === 'user' ? 'You' : 'Emma' }}</div>
            <div class="content">
              @if (msg.pending) {
                <span class="typing">thinking…</span>
              } @else {
                {{ msg.content }}
              }
            </div>
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
      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .empty {
        color: var(--text-dim);
        text-align: center;
        margin-top: 3rem;
      }
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
export class ChatComponent {
  private readonly api = inject(ApiService);
  private readonly scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');

  protected readonly messages = signal<UiMessage[]>([]);
  protected readonly draft = signal<string>('');
  protected readonly sending = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  private readonly conversationId = this.makeConversationId();

  constructor() {
    effect(() => {
      // Re-run on messages changes to auto-scroll.
      this.messages();
      queueMicrotask(() => {
        const el = this.scroller()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    this.error.set(null);
    this.draft.set('');
    this.sending.set(true);

    this.messages.update((m) => [
      ...m,
      { role: 'user', content: text },
      { role: 'assistant', content: '', pending: true },
    ]);

    try {
      const res = await this.api.chatWithAgent({
        conversationId: this.conversationId,
        message: text,
      });
      this.messages.update((m) => {
        const copy = [...m];
        const lastIdx = copy.length - 1;
        copy[lastIdx] = { role: 'assistant', content: res.reply };
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
