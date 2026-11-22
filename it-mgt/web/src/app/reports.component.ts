import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, map, Observable } from 'rxjs';
import { Api, AssetMovement, Auth, BrandingService, Client, Device, EquipmentEntry, errMsg, Project } from './api';

type ReportType = 'delivered' | 'store' | 'movement' | 'equipment' | 'projects' | 'client-summary' | 'clients';
interface ReportRow { id: string; label: string; cells: string[] }
interface ReportData { title: string; columns: string[]; rows: ReportRow[] }
interface Report extends ReportData { generated: string }

@Component({
  selector: 'app-reports',
  imports: [FormsModule],
  template: `
    <div class="no-print">
      <h1>Reports</h1>
      <p class="muted">Generate an organisation summary, then choose all records or one record. Reports do not include credentials.</p>
      <label>Report
        <select [ngModel]="type" (ngModelChange)="changeType($event)" [disabled]="loading()">
          <option value="delivered">Delivered equipment</option>
          <option value="store">Equipment in store</option>
          @if (auth.canAccessForms()) {
            <option value="movement">Asset movement forms</option>
            <option value="equipment">Equipment entries</option>
          }
          <option value="projects">Projects</option>
          <option value="client-summary">Clients</option>
          @if (auth.canWrite()) { <option value="clients">Client devices</option> }
        </select>
      </label>
      <p><button type="button" (click)="generate()" [disabled]="loading()">Generate report</button>
        @if (report()) { <button type="button" (click)="print()">Print / save as PDF</button> }
      </p>
      @if (error()) { <div class="error" role="alert">{{ error() }}</div> }
      @if (loading()) { <p>Generating report…</p> }
      @if (report(); as result) {
        @if (result.rows.length) {
          <label>Records
            <select [ngModel]="selectedId()" (ngModelChange)="selectedId.set($event)">
              <option value="">All records</option>
              @for (row of result.rows; track row.id) { <option [value]="row.id">{{ row.label }}</option> }
            </select>
          </label>
        }
        <p class="muted">If your browser adds a date, title or URL, turn off headers and footers in the print settings.</p>
      }
    </div>
    @if (report(); as result) {
      <article class="report movement-report generated-report">
        <header class="movement-header">
          @if (brand.branding().logo; as logo) { <img [src]="logo" alt="Organisation logo" /> }
          <div><strong>{{ brand.branding().companyName || auth.user()?.organization?.name }}</strong>
            <h2>{{ result.title }}</h2>
          </div>
        </header>
        <p>Generated: {{ result.generated }}</p>
        @if (!visibleRows().length) { <p>No records found.</p> }
        @else {
          <table><thead><tr>@for (column of result.columns; track $index) { <th>{{ column }}</th> }</tr></thead>
            <tbody>@for (row of visibleRows(); track row.id) {
              <tr>@for (cell of row.cells; track $index) { <td>{{ cell }}</td> }</tr>
            }</tbody>
          </table>
        }
      </article>
    }
  `,
})
export class ReportsComponent {
  private api = inject(Api);
  readonly auth = inject(Auth);
  readonly brand = inject(BrandingService);
  type: ReportType = 'delivered';
  report = signal<Report | null>(null);
  selectedId = signal('');
  visibleRows = computed(() => {
    const rows = this.report()?.rows ?? [];
    return this.selectedId() ? rows.filter((row) => row.id === this.selectedId()) : rows;
  });
  loading = signal(false);
  error = signal('');

  changeType(type: ReportType) {
    this.type = type;
    this.report.set(null);
    this.selectedId.set('');
    this.error.set('');
  }

  generate() {
    if (this.loading()) return;
    const type = this.type;
    this.report.set(null);
    this.selectedId.set('');
    if (type === 'clients' && !this.auth.canWrite()) {
      this.error.set('Client device reports are not available to viewers.');
      return;
    }
    if ((type === 'movement' || type === 'equipment') && !this.auth.canAccessForms()) {
      this.error.set('Form reports are not available for your role.');
      return;
    }
    this.error.set('');
    this.loading.set(true);
    this.loadReport(type).subscribe({
      next: (data) => { this.report.set({ ...data, generated: new Date().toLocaleString() }); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.loading.set(false); },
    });
  }

  private loadReport(type: ReportType): Observable<ReportData> {
    switch (type) {
      case 'delivered':
      case 'store':
      case 'equipment':
        return this.api.equipmentReport().pipe(map((entries) => this.equipmentData(type, entries)));
      case 'movement':
        return this.api.assetMovements().pipe(map((movements) => this.movementData(movements)));
      case 'projects':
        return this.api.projects().pipe(map((projects) => this.projectData(projects)));
      case 'client-summary':
        return this.api.clients().pipe(map((clients) => this.clientData(clients)));
      case 'clients':
        return forkJoin({ clients: this.api.clients(), devices: this.api.allDevices() })
          .pipe(map(({ clients, devices }) => this.deviceData(clients, devices)));
    }
  }

  private equipmentData(type: 'delivered' | 'store' | 'equipment', entries: EquipmentEntry[]): ReportData {
    const title = type === 'delivered' ? 'Delivered equipment' : type === 'store' ? 'Equipment in store' : 'Equipment entries';
    const included = type === 'equipment' ? entries : entries.filter((entry) => entry.delivered === (type === 'delivered'));
    return { title, columns: ['Equipment', 'Serial number', 'Asset tag', 'Brand', 'Model', 'Date received', 'Delivered to'],
      rows: included.map((entry) => ({
        id: entry.id, label: `${entry.name} — ${entry.serialNumber}`,
        cells: [entry.name, entry.serialNumber, entry.assetTag || '—', entry.brand || '—',
          entry.model || '—', entry.dateReceived, entry.deliveredTo || '—'],
      })) };
  }

  private movementData(movements: AssetMovement[]): ReportData {
    return { title: 'Asset movement forms', columns: ['Date', 'Assets', 'Direction', 'From', 'To', 'Person'],
      rows: movements.map((movement) => {
        const assets = [movement, ...(movement.additionalAssets ?? [])].map((asset) => asset.assetName).join(', ');
        return { id: movement.id, label: `${movement.movementDate} — ${assets} — ${movement.id.slice(0, 8)}`,
          cells: [movement.movementDate, assets, movement.direction === 'inbound' ? 'Inbound' : 'Outbound',
            movement.origin, movement.destination, movement.moverName] };
      }) };
  }

  private projectData(projects: Project[]): ReportData {
    return { title: 'Projects', columns: ['Project', 'Client', 'Status', 'Start date', 'Completion date', 'Location'],
      rows: projects.map((project) => ({
        id: project.id, label: `${project.name} — ${project.clientName} — ${project.id.slice(0, 8)}`,
        cells: [project.name, project.clientName, project.status.replace(/-/g, ' '),
          project.startDate, project.completionDate || '—', project.location],
      })) };
  }

  private clientData(clients: Client[]): ReportData {
    return { title: 'Clients', columns: ['Client', 'Devices'],
      rows: clients.map((client) => ({
        id: client.id, label: `${client.name} — ${client.id.slice(0, 8)}`,
        cells: [client.name, String(client.deviceCount ?? 0)],
      })) };
  }

  private deviceData(clients: Client[], devices: Device[]): ReportData {
    const names = new Map(clients.map((client) => [client.id, client.name]));
    return { title: 'Client devices', columns: ['Client', 'Device', 'Type', 'Brand', 'Model', 'Location'],
      rows: devices.map((device) => {
        const client = names.get(device.clientId) ?? 'Unknown client';
        return { id: device.id, label: `${client} — ${device.name} — ${device.id.slice(0, 8)}`,
          cells: [client, device.name, device.type, device.brand || '—', device.model || '—', device.location || '—'] };
      }) };
  }

  print() { window.print(); }
}
