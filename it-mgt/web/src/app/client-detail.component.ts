import { Component, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe, JsonPipe, NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { Api, Auth, Client, Credential, DEVICE_TYPES, Device, DeviceConfigFile, Vm, errMsg } from './api';
import { CredentialsComponent } from './credentials.component';

@Component({
  selector: 'app-client-detail',
  imports: [FormsModule, DatePipe, JsonPipe, NgTemplateOutlet, UpperCasePipe, RouterLink, CredentialsComponent],
  template: `
    <p class="no-print"><a routerLink="/">← Clients</a></p>
    @if (client(); as c) {
      <div class="no-print">
      <h1>{{ c.name }}</h1>
      <p class="muted">{{ c.contact }} {{ c.notes ? '— ' + c.notes : '' }}</p>
      @if (error()) { <div class="error">{{ error() }}</div> }

      <div class="row"><h2>Devices</h2>
        @if (auth.canWrite()) { <button [disabled]="savingDevice()" (click)="newDevice()">+ Add device</button> }
        @if (auth.canWrite()) { <button type="button" (click)="openReport(c)">Print report</button> }
      </div>

      @if (reportOpen() && auth.canWrite()) {
        <div class="card">
          <h3>Report: choose devices</h3>
          <label class="check"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll($any($event.target).checked)" /> All devices ({{ c.devices?.length ?? 0 }})</label>
          @for (d of c.devices; track d.id) {
            <label class="check"><input type="checkbox" [checked]="selected().has(d.id)" (change)="toggleSelected(d.id)" /> {{ d.name }} <span class="muted">({{ d.type | uppercase }})</span></label>
          }
          <p class="muted">The report includes usernames and passwords; each password view is recorded in the audit log.</p>
          <div class="row">
            <button [disabled]="!selected().size || generating()" (click)="generate(c)">{{ generating() ? 'Generating…' : 'Generate report' }}</button>
            @if (report()) { <button (click)="print()">Print</button> }
            <button type="button" (click)="closeReport()">Close</button>
          </div>
        </div>
      }

      @if (deviceForm(); as f) {
        <form class="card form" (ngSubmit)="saveDevice()">
          <h3>{{ f.id ? 'Edit' : 'New' }} device</h3>
          <label>Name <input name="name" [(ngModel)]="f.name" required /></label>
          <label>Type <select name="type" [(ngModel)]="f.type">@for (t of types; track t) { <option [value]="t">{{ t | uppercase }}</option> }</select></label>
          <label>IP / host <input name="host" [(ngModel)]="f.host" /></label>
          <label>Port <input name="port" type="number" [(ngModel)]="f.port" /></label>
          <label>OS <input name="os" [(ngModel)]="f.os" /></label>
          <label>Brand <input name="brand" [(ngModel)]="f.brand" placeholder="Cisco, MikroTik, Dell…" /></label>
          <label>Model number <input name="model" [(ngModel)]="f.model" /></label>
          <label>Location <input name="location" [(ngModel)]="f.location" placeholder="Site, building, room, rack" /></label>
          <label>Deployment date <input name="deployed" type="date" [(ngModel)]="f.deploymentDate" /></label>
          @if (f.type === 'hypervisor') {
            <label>Platform <input name="platform" [(ngModel)]="f.platform" placeholder="Proxmox, VMware, Hyper-V" /></label>
          }
          <label>Notes <input name="notes" [(ngModel)]="f.notes" /></label>
          <label>Configuration file (optional, max 25 MB)
            <input type="file" (change)="selectConfigFile($event)" />
          </label>
          <label class="check"><input type="checkbox" name="snmpOn" [(ngModel)]="f.snmpEnabled" /> Monitor status with SNMP (needs the IP / host above)</label>
          @if (f.snmpEnabled) {
            <label>SNMP version <select name="snmpV" [(ngModel)]="f.snmpVersion"><option value="2c">v2c</option><option value="1">v1</option></select></label>
            <label>SNMP port <input name="snmpP" type="number" [(ngModel)]="f.snmpPort" placeholder="161" /></label>
            <label>Community string <input name="snmpC" type="password" autocomplete="new-password" [(ngModel)]="f.snmpCommunity" [placeholder]="f.id ? 'Leave blank to keep current' : 'public'" /></label>
          }
          <div><button [disabled]="savingDevice()">{{ savingDevice() ? 'Saving…' : 'Save' }}</button> <button type="button" [disabled]="savingDevice()" (click)="cancelDevice()">Cancel</button></div>
        </form>
      }

      @for (d of c.devices; track d.id) {
        <div class="card">
          <div class="row clickable" (click)="toggle('d' + d.id)">
            <span>{{ open().has('d' + d.id) ? '▾' : '▸' }}</span>
            <strong>{{ d.name }}</strong> <span class="tag">{{ d.type | uppercase }}{{ d.platform ? ': ' + d.platform : '' }}</span>
            @if (d.snmpEnabled) { <span class="status" [class.up]="d.status === 'up'" [class.down]="d.status === 'down'">{{ d.status ? (d.status | uppercase) : 'PENDING' }}</span> }
            <code>{{ d.host }}{{ d.port ? ':' + d.port : '' }}</code> <span class="muted">{{ d.brand }} {{ d.model }} {{ d.os }}</span>
            @if (d.location) { <span class="muted">· {{ d.location }}</span> }
            @if (d.deploymentDate) { <span class="muted">· deployed {{ d.deploymentDate }}</span> }
            <span class="spacer"></span>
            @if (d.type === 'hypervisor') { <span class="muted">{{ d.vms?.length ?? 0 }} VMs</span> }
            @if (auth.canWrite()) { <button class="sm" [disabled]="savingDevice()" (click)="editDevice(d); $event.stopPropagation()">Edit</button> }
            @if (auth.isAdmin()) { <button class="sm danger" (click)="deleteDevice(d); $event.stopPropagation()">Delete</button> }
          </div>
          @if (open().has('d' + d.id)) {
            <div class="body">
              @if (d.notes) { <p>{{ d.notes }}</p> }
              @if (d.snmpEnabled) {
                <div class="row">
                  <strong>SNMP status:</strong>
                  <span class="status" [class.up]="d.status === 'up'" [class.down]="d.status === 'down'">{{ d.status ? (d.status | uppercase) : 'PENDING' }}</span>
                  @if (d.statusInfo?.uptime) { <span class="muted">uptime {{ d.statusInfo?.uptime }}</span> }
                  @if (d.statusInfo?.sysName) { <span class="muted">· {{ d.statusInfo?.sysName }}</span> }
                  @if (d.statusInfo?.error) { <span class="muted">· {{ d.statusInfo?.error }}</span> }
                  @if (d.statusCheckedAt) { <span class="muted">· checked {{ d.statusCheckedAt | date: 'medium' }}</span> }
                  <span class="spacer"></span>
                  <button class="sm" (click)="checkNow(d)">Check now</button>
                </div>
                @if (d.statusInfo?.sysDescr) { <p class="muted">{{ d.statusInfo?.sysDescr }}</p> }
              }
              @if (hasMeta(d.metadata)) { <pre>{{ d.metadata | json }}</pre> }
              @if (auth.canWrite()) {
                <h3>Configuration files</h3>
                @if (configFiles()[d.id]; as files) {
                  @for (file of files; track file.id) {
                    <div class="row"><span>{{ file.name }} ({{ file.size }} bytes)</span>
                      <button type="button" class="sm" (click)="downloadConfigFile(d.id, file)">Download</button>
                    </div>
                  } @empty { <small class="muted">No configuration files.</small> }
                } @else if (configFileErrors()[d.id]) {
                  <small class="error">Unable to load configuration files. Close and reopen the device to retry.</small>
                } @else { <small class="muted">Loading configuration files…</small> }
              }
              <app-credentials [deviceId]="d.id" />

              @if (d.type === 'hypervisor') {
                <div class="row"><h3>Virtual machines</h3>
                  @if (auth.canWrite()) { <button class="sm" (click)="newVm(d)">+ Add VM</button> }
                </div>
                @if (vmForm(); as v) {
                  @if (v.deviceId === d.id) {
                    <form class="card form" (ngSubmit)="saveVm()">
                      <label>Name <input name="vn" [(ngModel)]="v.name" required /></label>
                      <label>IP <input name="vip" [(ngModel)]="v.ip" /></label>
                      <label>OS <input name="vos" [(ngModel)]="v.os" /></label>
                      <label>CPU <input name="vcpu" type="number" [(ngModel)]="v.cpu" /></label>
                      <label>RAM (MB) <input name="vram" type="number" [(ngModel)]="v.ramMb" /></label>
                      <label>Disk (GB) <input name="vdisk" type="number" [(ngModel)]="v.diskGb" /></label>
                      <label>Status <select name="vst" [(ngModel)]="v.status"><option>running</option><option>stopped</option><option>paused</option></select></label>
                      <label>Purpose <input name="vpur" [(ngModel)]="v.purpose" /></label>
                      <label>Metadata (JSON) <textarea name="vmeta" [(ngModel)]="vmMeta" rows="2"></textarea></label>
                      <div><button>Save</button> <button type="button" (click)="vmForm.set(null)">Cancel</button></div>
                    </form>
                  }
                }
                @for (v of d.vms; track v.id) {
                  <div class="card nested">
                    <div class="row clickable" (click)="toggle('v' + v.id)">
                      <span>{{ open().has('v' + v.id) ? '▾' : '▸' }}</span>
                      <strong>{{ v.name }}</strong> <span class="tag">{{ v.status }}</span>
                      <code>{{ v.ip }}</code> <span class="muted">{{ v.os }} · {{ v.cpu ?? '?' }} vCPU · {{ v.ramMb ?? '?' }} MB · {{ v.diskGb ?? '?' }} GB</span>
                      <span class="spacer"></span>
                      @if (auth.canWrite()) { <button class="sm" (click)="editVm(v); $event.stopPropagation()">Edit</button> }
                      @if (auth.isAdmin()) { <button class="sm danger" (click)="deleteVm(v); $event.stopPropagation()">Delete</button> }
                    </div>
                    @if (open().has('v' + v.id)) {
                      <div class="body">
                        @if (v.purpose) { <p>{{ v.purpose }}</p> }
                        <app-credentials [vmId]="v.id" />
                      </div>
                    }
                  </div>
                } @empty { <small class="muted">No VMs.</small> }
              }
            </div>
          }
        </div>
      } @empty { <p class="muted">No devices yet.</p> }
      </div>

      @if (report(); as r) {
        <section class="report">
          <h1>Device report — {{ c.name }}</h1>
          <p class="muted">Generated {{ r.generated }}{{ c.contact ? ' · Contact: ' + c.contact : '' }}</p>
          @for (d of r.devices; track d.id) {
            <article>
              <h2>{{ d.name }} <span class="tag">{{ d.type | uppercase }}{{ d.platform ? ': ' + d.platform : '' }}</span></h2>
              <table>
                <tr><th>Host</th><td>{{ d.host }}{{ d.port ? ':' + d.port : '' }}</td><th>OS</th><td>{{ d.os }}</td></tr>
                <tr><th>Brand</th><td>{{ d.brand }}</td><th>Model number</th><td>{{ d.model }}</td></tr>
                <tr><th>Location</th><td>{{ d.location }}</td><th>Deployed</th><td>{{ d.deploymentDate }}</td></tr>
                @if (d.notes) { <tr><th>Notes</th><td colspan="3">{{ d.notes }}</td></tr> }
                @if (hasMeta(d.metadata)) { <tr><th>Metadata</th><td colspan="3"><pre>{{ d.metadata | json }}</pre></td></tr> }
              </table>
              <ng-container *ngTemplateOutlet="creds; context: { $implicit: r.creds['d' + d.id] }" />
              @if (d.type === 'hypervisor') {
                <h3>Virtual machines ({{ d.vms?.length ?? 0 }})</h3>
                @for (v of d.vms; track v.id) {
                  <h4>{{ v.name }} <span class="tag">{{ v.status }}</span></h4>
                  <table>
                    <tr><th>IP</th><td>{{ v.ip }}</td><th>OS</th><td>{{ v.os }}</td></tr>
                    <tr><th>vCPU</th><td>{{ v.cpu }}</td><th>RAM / Disk</th><td>{{ v.ramMb }} MB / {{ v.diskGb }} GB</td></tr>
                    @if (v.purpose) { <tr><th>Purpose</th><td colspan="3">{{ v.purpose }}</td></tr> }
                  </table>
                  <ng-container *ngTemplateOutlet="creds; context: { $implicit: r.creds['v' + v.id] }" />
                }
              }
            </article>
          }
        </section>
      }
    }
    <ng-template #creds let-list>
      @if (list?.length) {
        <table class="creds-table">
          <tr><th>Type</th><th>Username</th><th>Password</th><th>Notes</th></tr>
          @for (x of list; track x.id) {
            <tr><td>{{ x.type }}</td><td>{{ x.username }}</td><td><code>{{ x.password }}</code></td><td>{{ x.notes }}</td></tr>
          }
        </table>
      } @else { <p class="muted">No credentials.</p> }
    </ng-template>
  `,
})
export class ClientDetailComponent implements OnInit {
  readonly id = input.required<string>();
  readonly auth = inject(Auth);
  private api = inject(Api);
  readonly types = DEVICE_TYPES;
  client = signal<Client | null>(null);
  open = signal(new Set<string>());
  error = signal('');
  deviceForm = signal<Partial<Device> | null>(null);
  configFiles = signal<Record<string, DeviceConfigFile[]>>({});
  configFileErrors = signal<Record<string, boolean>>({});
  configFile: File | null = null;
  configFileInvalid = false;
  savingDevice = signal(false);
  vmForm = signal<Partial<Vm> | null>(null);
  vmMeta = '{}';

  reportOpen = signal(false);
  generating = signal(false);
  selected = signal(new Set<string>());
  report = signal<{ generated: string; devices: Device[]; creds: Record<string, Credential[]> } | null>(null);

  openReport(c: Client) {
    this.selected.set(new Set((c.devices ?? []).map((d) => d.id)));
    this.report.set(null);
    this.reportOpen.set(true);
  }
  closeReport() { this.reportOpen.set(false); this.report.set(null); }
  allSelected() { return this.selected().size === (this.client()?.devices?.length ?? 0); }
  toggleAll(on: boolean) {
    this.report.set(null);
    this.selected.set(new Set(on ? (this.client()?.devices ?? []).map((d) => d.id) : []));
  }
  toggleSelected(id: string) {
    this.report.set(null);
    this.selected.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  generate(c: Client) {
    const devices = (c.devices ?? []).filter((d) => this.selected().has(d.id));
    const targets = devices.flatMap((d) => [
      { key: 'd' + d.id, ref: { deviceId: d.id } },
      ...(d.type === 'hypervisor' ? (d.vms ?? []).map((v) => ({ key: 'v' + v.id, ref: { vmId: v.id } })) : []),
    ]);
    this.generating.set(true);
    this.error.set('');
    forkJoin(targets.map((t) => this.api.credentials(t.ref).pipe(
      switchMap((list) => list.length
        ? forkJoin(list.map((cr) => this.api.reveal(cr.id).pipe(map((r) => ({ ...cr, password: r.password })))))
        : of([] as Credential[])),
      map((list) => [t.key, list] as const),
    ))).subscribe({
      next: (entries) => {
        this.report.set({ generated: new Date().toLocaleString(), devices, creds: Object.fromEntries(entries) });
        this.generating.set(false);
      },
      error: (e) => { this.error.set(errMsg(e)); this.generating.set(false); },
    });
  }
  print() { setTimeout(() => window.print()); }

  ngOnInit() { this.load(); }
  load() { this.api.client(this.id()).subscribe({ next: (c) => this.client.set(c), error: (e) => this.error.set(errMsg(e)) }); }

  toggle(k: string) {
    const opening = !this.open().has(k);
    this.open.update((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
    if (opening && k.startsWith('d') && this.auth.canWrite()) this.loadConfigFiles(k.slice(1));
  }
  hasMeta(m?: Record<string, unknown>) { return !!m && Object.keys(m).length > 0; }

  private parseMeta(text: string): Record<string, unknown> | null {
    try {
      const v = JSON.parse(text || '{}');
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch { /* fall through */ }
    this.error.set('Metadata must be a valid JSON object');
    return null;
  }

  private done = {
    next: () => { this.deviceForm.set(null); this.vmForm.set(null); this.error.set(''); this.load(); },
    error: (e: unknown) => this.error.set(errMsg(e)),
  };

  newDevice() { this.configFile = null; this.configFileInvalid = false; this.deviceForm.set({ clientId: this.id(), type: 'server' }); }
  editDevice(d: Device) { this.configFile = null; this.configFileInvalid = false; this.deviceForm.set({ ...d }); }
  cancelDevice() { this.configFile = null; this.configFileInvalid = false; this.deviceForm.set(null); }
  selectConfigFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.configFile = null;
    this.configFileInvalid = !!file && (file.size === 0 || file.size > 25 * 1024 * 1024);
    if (this.configFileInvalid) {
      this.error.set('Select a non-empty configuration file up to 25 MB');
      return;
    }
    this.error.set('');
    this.configFile = file;
  }
  saveDevice() {
    const f = this.deviceForm()!;
    if (this.savingDevice() || this.configFileInvalid) return;
    const file = this.configFile;
    this.savingDevice.set(true);
    this.error.set('');
    this.api.saveDevice({ ...f, port: f.port ? Number(f.port) : undefined, snmpPort: f.snmpPort ? Number(f.snmpPort) : null, snmpCommunity: f.snmpCommunity || undefined, deploymentDate: f.deploymentDate || null }).subscribe({
      next: (device) => {
        if (!file) { this.savingDevice.set(false); this.cancelDevice(); this.load(); return; }
        this.deviceForm.set({ ...f, id: device.id });
        this.api.uploadDeviceConfigFile(device.id, file).subscribe({
          next: () => { this.savingDevice.set(false); this.cancelDevice(); this.load(); if (this.open().has('d' + device.id)) this.loadConfigFiles(device.id); },
          error: (e) => { this.savingDevice.set(false); this.error.set(`Device saved, but configuration upload failed: ${errMsg(e)}. Retry saving to upload the file.`); this.load(); },
        });
      },
      error: (e) => { this.savingDevice.set(false); this.error.set(errMsg(e)); },
    });
  }
  private loadConfigFiles(deviceId: string) {
    this.configFileErrors.update((all) => ({ ...all, [deviceId]: false }));
    this.api.deviceConfigFiles(deviceId).subscribe({
      next: (files) => this.configFiles.update((all) => ({ ...all, [deviceId]: files })),
      error: (e) => {
        this.configFiles.update((all) => { const updated = { ...all }; delete updated[deviceId]; return updated; });
        this.configFileErrors.update((all) => ({ ...all, [deviceId]: true }));
        this.error.set(errMsg(e));
      },
    });
  }
  downloadConfigFile(deviceId: string, file: DeviceConfigFile) {
    this.api.downloadDeviceConfigFile(deviceId, file.id).subscribe({
      next: (content) => {
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url; link.download = file.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      },
      error: (e) => this.error.set(errMsg(e)),
    });
  }
  checkNow(d: Device) {
    this.api.checkDevice(d.id).subscribe({ next: () => this.load(), error: (e) => { this.error.set(errMsg(e)); this.load(); } });
  }
  deleteDevice(d: Device) {
    if (confirm(`Delete ${d.name} and everything under it?`)) this.api.deleteDevice(d.id).subscribe(this.done);
  }

  newVm(d: Device) { this.vmMeta = '{}'; this.vmForm.set({ deviceId: d.id, status: 'running' }); }
  editVm(v: Vm) { this.vmMeta = JSON.stringify(v.metadata ?? {}, null, 2); this.vmForm.set({ ...v }); }
  saveVm() {
    const metadata = this.parseMeta(this.vmMeta);
    if (!metadata) return;
    const f = this.vmForm()!;
    const num = (n?: number) => (n || n === 0 ? Number(n) : undefined);
    this.api.saveVm({ ...f, cpu: num(f.cpu), ramMb: num(f.ramMb), diskGb: num(f.diskGb), metadata }).subscribe(this.done);
  }
  deleteVm(v: Vm) {
    if (confirm(`Delete VM ${v.name}?`)) this.api.deleteVm(v.id).subscribe(this.done);
  }
}
