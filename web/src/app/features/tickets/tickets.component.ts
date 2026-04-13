import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UserDataService, TicketDoc, formatTimestamp } from '../../core/user-data.service';

@Component({
  selector: 'app-tickets',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Service tickets</h1>
    <p class="dim">
      Tickets opened via the Dr. Pineapple agent or directly by users.
      Live from Firestore — new tickets appear automatically.
    </p>

    @if (tickets() === undefined) {
      <div class="dim">Loading…</div>
    } @else if ((tickets() ?? []).length === 0) {
      <div class="empty">No tickets yet. Chat with Dr. Pineapple to open one.</div>
    } @else {
      <table class="tickets">
        <thead>
          <tr>
            <th>Code</th>
            <th>Device</th>
            <th>Issue</th>
            <th>Urgency</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          @for (t of tickets(); track t.id) {
            <tr [class.liquid]="t.issue?.liquidDamage">
              <td class="code">{{ t.ticketCode }}</td>
              <td>
                <div class="model">{{ t.device?.model }}</div>
                <div class="family dim">{{ t.device?.family }}{{ t.device?.osVersion ? ' · ' + t.device?.osVersion : '' }}</div>
              </td>
              <td class="symptoms">
                {{ t.issue?.symptoms | slice:0:140 }}{{ (t.issue?.symptoms?.length ?? 0) > 140 ? '…' : '' }}
                <div class="flags">
                  @if (t.issue?.liquidDamage) { <span class="flag danger">💧 liquid</span> }
                  @if (t.issue?.physicalDamage) { <span class="flag warn">💥 drop</span> }
                </div>
              </td>
              <td>
                <span class="urgency" [class]="'urgency-' + (t.urgency ?? 'normal')">
                  {{ t.urgency ?? 'normal' }}
                </span>
              </td>
              <td>
                <span class="status" [class]="'status-' + (t.status ?? 'open')">
                  {{ t.status ?? 'open' }}
                </span>
              </td>
              <td class="dim">{{ ts(t.createdAt) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [
    `
      h1 { margin-top: 0; }
      .dim { color: var(--text-dim); }
      .empty { color: var(--text-dim); margin-top: 2rem; }
      table.tickets {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        font-size: 0.9rem;
      }
      th, td {
        text-align: left;
        padding: 0.75rem;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
      }
      th {
        color: var(--text-dim);
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.05em;
      }
      tr.liquid { background: rgba(239, 68, 68, 0.05); }
      .code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-weight: 600;
        color: var(--accent);
      }
      .model { font-weight: 500; }
      .family { font-size: 0.75rem; text-transform: uppercase; }
      .symptoms { max-width: 340px; }
      .flags { margin-top: 0.35rem; display: flex; gap: 0.25rem; }
      .flag {
        font-size: 0.65rem;
        padding: 0.1rem 0.4rem;
        border-radius: 999px;
        border: 1px solid currentColor;
      }
      .flag.danger { color: var(--danger); }
      .flag.warn { color: #ffb454; }
      .urgency {
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        text-transform: uppercase;
      }
      .urgency-low { background: var(--panel-2); color: var(--text-dim); }
      .urgency-normal { background: var(--accent); color: white; }
      .urgency-high { background: var(--danger); color: white; }
      .status {
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        border: 1px solid currentColor;
      }
      .status-open { color: var(--accent); }
      .status-in_progress { color: #ffb454; }
      .status-closed { color: var(--success); }
    `,
  ],
})
export class TicketsComponent {
  private readonly data = inject(UserDataService);
  protected readonly tickets = this.data.tickets();
  protected readonly ts = formatTimestamp;
}
