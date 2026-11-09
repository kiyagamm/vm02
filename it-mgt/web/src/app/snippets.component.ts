import { DatePipe, UpperCasePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Client, DEVICE_TYPES, Device, Snippet, errMsg } from './api';

const MAX_FILE = 200_000;

@Component({
  selector: 'app-snippets',
  imports: [FormsModule, DatePipe, UpperCasePipe],
  template: `
    <div class="row">
      <h1>Device Configuration Snippets</h1>
      <button (click)="startNew()">+ Add snippet</button>
    </div>
    @if (error()) { <div class="error">{{ error() }}</div> }

    @if (editing(); as s) {
      <form class="card form" (ngSubmit)="save()">
        <h3>{{ s.id ? 'Edit snippet' : 'New snippet' }}</h3>
        <label>Client
          <select name="c" [ngModel]="s.clientId" (ngModelChange)="pickClient($event)" required [disabled]="!!s.id">
            <option value="" disabled>Select client…</option>
            @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        </label>
        @if (!s.id) {
          <div>
            <button type="button" class="sm" (click)="quick.set(quick() === 'client' ? '' : 'client')">+ New client</button>
            <button type="button" class="sm" [disabled]="!s.clientId" (click)="quick.set(quick() === 'device' ? '' : 'device')">+ New device</button>
          </div>
        }
        @if (quick() === 'client') {
          <div class="card">
            <label>Client name <input name="qcn" [(ngModel)]="newClient.name" maxlength="200" /></label>
            <label>Contact <input name="qcc" [(ngModel)]="newClient.contact" /></label>
            <div><button type="button" (click)="addClient()">Add client</button> <button type="button" (click)="quick.set('')">Cancel</button></div>
          </div>
        }
        <label>Device
          <select name="d" [(ngModel)]="s.deviceId" required [disabled]="!s.clientId">
            <option value="" disabled>Select device…</option>
            @for (d of devices(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }
          </select>
        </label>
        @if (quick() === 'device') {
          <div class="card">
            <label>Device name <input name="qdn" [(ngModel)]="newDevice.name" maxlength="200" /></label>
            <label>Type
              <select name="qdt" [(ngModel)]="newDevice.type">
                @for (t of types; track t) { <option [value]="t">{{ t | uppercase }}</option> }
              </select>
            </label>
            <label>Host / IP <input name="qdh" [(ngModel)]="newDevice.host" /></label>
            <div><button type="button" (click)="addDevice()">Add device</button> <button type="button" (click)="quick.set('')">Cancel</button></div>
          </div>
        }
        <label>Snippet name <input name="n" [(ngModel)]="s.name" required maxlength="200" /></label>
        <label>Load from file <input type="file" (change)="onFile($event, s)" /></label>
        <label>Configuration
          <textarea name="t" rows="14" [(ngModel)]="s.content" required class="mono"></textarea>
        </label>
        <div><button>Save</button> <button type="button" (click)="editing.set(null)">Cancel</button></div>
      </form>
    }

    <table>
      <thead><tr><th>Snippet</th><th>Client</th><th>Device</th><th>Updated</th><th></th></tr></thead>
      <tbody>
        @for (s of snippets(); track s.id) {
          <tr>
            <td>{{ s.name }}</td>
            <td>{{ s.client?.name }}</td>
            <td>{{ s.device?.name }}</td>
            <td>{{ s.updatedAt | date: 'yyyy-MM-dd HH:mm' }}</td>
            <td>
              <button type="button" class="sm" (click)="toggle(s.id)">{{ openId() === s.id ? 'Hide' : 'View' }}</button>
              <button type="button" class="sm" (click)="copy(s)">Copy</button>
              <button type="button" class="sm" (click)="download(s)">Download</button>
              <button type="button" class="sm" (click)="edit(s)">Edit</button>
              <button type="button" class="sm danger" (click)="remove(s)">Delete</button>
            </td>
          </tr>
          @if (openId() === s.id) { <tr><td colspan="5"><pre class="mono">{{ s.content }}</pre></td></tr> }
        } @empty {
          <tr><td colspan="5" class="muted">No configuration snippets yet.</td></tr>
        }
      </tbody>
    </table>`,
  styles: [`.mono { font-family: Consolas, monospace; } pre.mono { white-space: pre-wrap; margin: 0; }`],
})
export class SnippetsComponent implements OnInit {
  private api = inject(Api);
  snippets = signal<Snippet[]>([]);
  clients = signal<Client[]>([]);
  devices = signal<Device[]>([]);
  editing = signal<Partial<Snippet> | null>(null);
  openId = signal('');
  error = signal('');
  quick = signal<'' | 'client' | 'device'>('');
  readonly types = DEVICE_TYPES;
  newClient: Partial<Client> = { name: '', contact: '' };
  newDevice: Partial<Device> = { name: '', type: 'server', host: '' };

  addClient() {
    const name = (this.newClient.name ?? '').trim();
    if (!name) { this.error.set('Client name is required'); return; }
    const contact = (this.newClient.contact ?? '').trim();
    this.api.saveClient({ name, ...(contact && { contact }) }).subscribe({
      next: (c) => {
        this.error.set('');
        this.clients.update((l) => [...l, c]);
        this.pickClient(c.id);
        this.newClient = { name: '', contact: '' };
        this.quick.set('');
      },
      error: (e) => this.error.set(errMsg(e)),
    });
  }

  addDevice() {
    const clientId = this.editing()?.clientId;
    const name = (this.newDevice.name ?? '').trim();
    if (!clientId || !name) { this.error.set('Device name is required'); return; }
    const host = (this.newDevice.host ?? '').trim();
    this.api.saveDevice({ clientId, name, type: this.newDevice.type, ...(host && { host }) }).subscribe({
      next: (d) => {
        this.error.set('');
        this.devices.update((l) => [...l, d]);
        this.editing.update((s) => s && { ...s, deviceId: d.id });
        this.newDevice = { name: '', type: 'server', host: '' };
        this.quick.set('');
      },
      error: (e) => this.error.set(errMsg(e)),
    });
  }

  ngOnInit() {
    this.load();
    this.api.clients().subscribe((c) => this.clients.set(c));
  }
  load() { this.api.snippets().subscribe({ next: (s) => this.snippets.set(s), error: (e) => this.error.set(errMsg(e)) }); }

  startNew() { this.devices.set([]); this.editing.set({ clientId: '', deviceId: '', name: '', content: '' }); }
  edit(s: Snippet) { this.loadDevices(s.clientId); this.editing.set({ ...s }); }
  pickClient(clientId: string) {
    this.editing.update((s) => s && { ...s, clientId, deviceId: '' });
    this.loadDevices(clientId);
  }
  private loadDevices(clientId: string) {
    this.api.devices(clientId).subscribe((d) => this.devices.set(d));
  }

  onFile(ev: Event, s: Partial<Snippet>) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE) { this.error.set('File too large (max 200 KB)'); return; }
    f.text().then((t) => { s.content = t; if (!s.name) s.name = f.name; });
  }

  save() {
    const s = this.editing();
    if (!s) return;
    this.api.saveSnippet(s).subscribe({
      next: () => { this.error.set(''); this.editing.set(null); this.load(); },
      error: (e) => this.error.set(errMsg(e)),
    });
  }
  remove(s: Snippet) {
    if (confirm(`Delete snippet "${s.name}"?`)) {
      this.api.deleteSnippet(s.id).subscribe({ next: () => this.load(), error: (e) => this.error.set(errMsg(e)) });
    }
  }
  toggle(id: string) { this.openId.set(this.openId() === id ? '' : id); }
  copy(s: Snippet) { navigator.clipboard?.writeText(s.content); }
  download(s: Snippet) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s.content], { type: 'text/plain' }));
    a.download = `${s.name.replace(/[^\w.-]+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
