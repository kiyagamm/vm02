import { Component, computed, inject, input, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Auth, CREDENTIAL_TYPES, Credential, ExecResult, errMsg } from './api';

@Component({
  selector: 'app-credentials',
  imports: [FormsModule],
  template: `
    <div class="creds">
      <div class="row"><strong>Credentials</strong>
        @if (auth.canWrite()) { <button class="sm" (click)="startAdd()">+ Add</button> }
      </div>
      @if (error()) { <div class="error">{{ error() }}</div> }
      @for (c of creds(); track c.id) {
        <div class="cred">
          <span class="tag">{{ c.type }}</span>
          <code>{{ c.username }}</code>
          <code class="pw">{{ revealed()[c.id] ?? '••••••••' }}</code>
          @if (auth.canWrite()) {
            <button class="sm" (click)="reveal(c)">{{ revealed()[c.id] ? 'Hide' : 'Reveal' }}</button>
            <button class="sm" (click)="copy(c)">Copy</button>
            @if (c.type === 'ssh') { <button class="sm" (click)="openExec(c)">Run</button> }
            <button class="sm" (click)="edit(c)">Edit</button>
          }
          @if (auth.isAdmin()) { <button class="sm danger" (click)="remove(c)">Delete</button> }
          @if (c.notes) { <small class="muted">{{ c.notes }}</small> }
        </div>
        @if (execFor() === c.id) {
          <div class="exec">
            <form (ngSubmit)="run(c)">
              <input name="cmd" [(ngModel)]="command" placeholder="command, e.g. uptime" required />
              <button [disabled]="running()">{{ running() ? 'Running…' : 'Run' }}</button>
            </form>
            @if (result(); as r) {
              <pre>{{ r.stdout }}{{ r.stderr ? '\\n[stderr]\\n' + r.stderr : '' }}
[exit {{ r.exitCode }} on {{ r.target }}]</pre>
            }
          </div>
        }
      } @empty { <small class="muted">No credentials.</small> }

      @if (form(); as f) {
        <form class="inline" (ngSubmit)="save()">
          <input name="u" [(ngModel)]="f.username" placeholder="username" required />
          <input name="p" type="password" [(ngModel)]="f.password" autocomplete="new-password"
                 [placeholder]="f.id ? 'new password (leave blank to keep)' : 'password'" [required]="!f.id" />
          <select name="t" [(ngModel)]="f.type">@for (t of types; track t) { <option>{{ t }}</option> }</select>
          <input name="n" [(ngModel)]="f.notes" placeholder="notes" />
          <button>Save</button> <button type="button" (click)="form.set(null)">Cancel</button>
        </form>
      }
    </div>`,
})
export class CredentialsComponent implements OnInit {
  readonly deviceId = input<string>();
  readonly vmId = input<string>();
  readonly auth = inject(Auth);
  private api = inject(Api);
  readonly types = CREDENTIAL_TYPES;
  creds = signal<Credential[]>([]);
  revealed = signal<Record<string, string>>({});
  form = signal<Partial<Credential> | null>(null);
  error = signal('');
  execFor = signal<string | null>(null);
  result = signal<ExecResult | null>(null);
  running = signal(false);
  command = '';
  private target = computed(() => (this.deviceId() ? { deviceId: this.deviceId() } : { vmId: this.vmId() }));

  ngOnInit() { this.load(); }

  load() { this.api.credentials(this.target()).subscribe({ next: (c) => this.creds.set(c), error: (e) => this.error.set(errMsg(e)) }); }
  startAdd() { this.form.set({ ...this.target(), type: 'ssh', username: '', password: '' }); }
  edit(c: Credential) { this.form.set({ ...c, password: '' }); }

  save() {
    this.api.saveCredential(this.form()!).subscribe({
      next: () => { this.form.set(null); this.error.set(''); this.load(); },
      error: (e) => this.error.set(errMsg(e)),
    });
  }

  remove(c: Credential) {
    if (confirm(`Delete credential ${c.username}?`)) this.api.deleteCredential(c.id).subscribe({ next: () => this.load(), error: (e) => this.error.set(errMsg(e)) });
  }

  reveal(c: Credential) {
    if (this.revealed()[c.id]) { this.revealed.update(({ [c.id]: _, ...rest }) => rest); return; }
    this.api.reveal(c.id).subscribe({
      next: (r) => this.revealed.update((m) => ({ ...m, [c.id]: r.password })),
      error: (e) => this.error.set(errMsg(e)),
    });
  }

  copy(c: Credential) {
    this.api.reveal(c.id).subscribe({
      next: (r) => navigator.clipboard.writeText(r.password).catch(() => this.error.set('Clipboard unavailable')),
      error: (e) => this.error.set(errMsg(e)),
    });
  }

  openExec(c: Credential) { this.execFor.set(this.execFor() === c.id ? null : c.id); this.result.set(null); }

  run(c: Credential) {
    this.running.set(true); this.result.set(null); this.error.set('');
    this.api.exec(c.id, this.command).subscribe({
      next: (r) => { this.result.set(r); this.running.set(false); },
      error: (e) => { this.error.set(errMsg(e)); this.running.set(false); },
    });
  }
}
