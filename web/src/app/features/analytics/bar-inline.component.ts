import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CountByKey } from '../../core/analytics';

/**
 * Tiny horizontal bar chart. Zero dependencies — pure CSS grid + a
 * width percentage normalised against the largest value in the set.
 */
@Component({
  selector: 'app-bar-inline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!data || data.length === 0) {
      <div class="dim">No data</div>
    } @else {
      <ul class="bars">
        @for (row of data; track row.key) {
          <li>
            <div class="key">{{ row.key }}</div>
            <div class="track">
              <span [style.width.%]="percentOf(row.count)"></span>
            </div>
            <div class="count">{{ row.count }}</div>
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      .dim { color: var(--text-dim); font-size: 0.85rem; }
      .bars {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .bars li {
        display: grid;
        grid-template-columns: 100px 1fr 40px;
        gap: 0.75rem;
        align-items: center;
        font-size: 0.8rem;
      }
      .key {
        color: var(--text-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .track {
        height: 8px;
        background: var(--panel-2);
        border-radius: 999px;
        overflow: hidden;
      }
      .track span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
      }
      .count { text-align: right; font-variant-numeric: tabular-nums; }
    `,
  ],
})
export class BarInlineComponent {
  @Input() data: CountByKey[] = [];

  protected percentOf(value: number): number {
    const max = Math.max(1, ...this.data.map((d) => d.count));
    return Math.round((value / max) * 100);
  }
}
