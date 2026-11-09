import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api, AuditEntry, errMsg } from './api';

@Component({
  selector: 'app-audit',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="row"><h1>Audit log</h1>
      <select [(ngModel)]="action" (ngModelChange)="offset = 0; load()">
        <option value="">all actions</option>
        @for (a of actions; track a) { <option>{{ a }}</option> }
      </select>
    </div>
    @if (error()) { <div class="error">{{ error() }}</div> }
    <table>
      <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
      <tbody>
        @for (e of items(); track e.id) {
          <tr><td>{{ e.timestamp | date: 'yyyy-MM-dd HH:mm:ss' }}</td><td>{{ e.username }}</td>
              <td><span class="tag">{{ e.action }}</span></td><td>{{ e.entity }}</td><td>{{ e.details }}</td><td>{{ e.ip }}</td></tr>
        }
      </tbody>
    </table>
    <div class="row">
      <button [disabled]="offset === 0" (click)="page(-1)">Prev</button>
      <span class="muted">{{ offset + 1 }}–{{ Math.min(offset + limit, total()) }} of {{ total() }}</span>
      <button [disabled]="offset + limit >= total()" (click)="page(1)">Next</button>
    </div>`,
})
export class AuditComponent implements OnInit {
  private api = inject(Api);
  readonly Math = Math;
  readonly actions = ['create', 'update', 'delete', 'reveal-password', 'command-run', 'login', 'login-failed'];
  readonly limit = 50;
  items = signal<AuditEntry[]>([]);
  total = signal(0);
  error = signal('');
  action = '';
  offset = 0;

  ngOnInit() { this.load(); }
  page(dir: number) { this.offset = Math.max(0, this.offset + dir * this.limit); this.load(); }
  load() {
    this.api.audit(this.action, this.offset, this.limit).subscribe({
      next: (r) => { this.items.set(r.items); this.total.set(r.total); },
      error: (e) => this.error.set(errMsg(e)),
    });
  }
}
