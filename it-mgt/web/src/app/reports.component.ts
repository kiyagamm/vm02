import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Api, Auth, BrandingService, Client, Device, EquipmentEntry, errMsg } from './api';

type ReportType = 'delivered' | 'store' | 'clients';
type Report =
  | { type: 'delivered' | 'store'; generated: string; equipment: EquipmentEntry[] }
  | { type: 'clients'; generated: string; clients: Client[]; devices: Device[] };

@Component({
  selector: 'app-reports',
  imports: [FormsModule],
  template: `
    <div class="no-print">
      <h1>Reports</h1>
      <p class="muted">Generate an organisation report. Client device reports do not include credentials.</p>
      <label>Report
        <select [(ngModel)]="type">
          <option value="delivered">Delivered equipment</option>
          <option value="store">Equipment in store</option>
          @if (auth.canWrite()) { <option value="clients">Client devices</option> }
        </select>
      </label>
      <p><button type="button" (click)="generate()" [disabled]="loading()">Generate report</button>
        @if (report()) { <button type="button" (click)="print()">Print / save as PDF</button> }
      </p>
      @if (error()) { <div class="error" role="alert">{{ error() }}</div> }
      @if (loading()) { <p>Generating report…</p> }
      @if (report()) { <p class="muted">If your browser adds a date, title or URL, turn off headers and footers in the print settings.</p> }
    </div>
    @if (report(); as result) {
      <article class="report movement-report generated-report">
        <header class="movement-header">
          @if (brand.branding().logo; as logo) { <img [src]="logo" alt="Organisation logo" /> }
          <div><strong>{{ brand.branding().companyName || auth.user()?.organization?.name }}</strong>
            <h2>{{ result.type === 'delivered' ? 'Delivered equipment' : result.type === 'store' ? 'Equipment in store' : 'Client devices' }}</h2>
          </div>
        </header>
        <p>Generated: {{ result.generated }}</p>
        @if (result.type === 'clients') {
          @if (!result.devices.length) { <p>No client devices found.</p> }
          @else {
            <table><thead><tr><th>Client</th><th>Device</th><th>Type</th><th>Brand</th><th>Model</th><th>Location</th></tr></thead>
              <tbody>@for (device of result.devices; track device.id) {
                <tr><td>{{ clientName(result.clients, device.clientId) }}</td><td>{{ device.name }}</td><td>{{ device.type }}</td>
                  <td>{{ device.brand || '—' }}</td><td>{{ device.model || '—' }}</td><td>{{ device.location || '—' }}</td></tr>
              }</tbody>
            </table>
          }
        } @else {
          @if (!result.equipment.length) { <p>No equipment found.</p> }
          @else {
            <table><thead><tr><th>Equipment</th><th>Serial number</th><th>Asset tag</th><th>Brand</th><th>Model</th><th>Date received</th><th>Delivered to</th></tr></thead>
              <tbody>@for (entry of result.equipment; track entry.id) {
                <tr><td>{{ entry.name }}</td><td>{{ entry.serialNumber }}</td><td>{{ entry.assetTag || '—' }}</td>
                  <td>{{ entry.brand || '—' }}</td><td>{{ entry.model || '—' }}</td><td>{{ entry.dateReceived }}</td><td>{{ entry.deliveredTo || '—' }}</td></tr>
              }</tbody>
            </table>
          }
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
  loading = signal(false);
  error = signal('');

  generate() {
    if (this.loading()) return;
    const type = this.type;
    if (type === 'clients' && !this.auth.canWrite()) {
      this.report.set(null);
      this.error.set('Client device reports are not available to viewers.');
      return;
    }
    this.error.set('');
    this.report.set(null);
    this.loading.set(true);
    if (type === 'clients') {
      forkJoin({ clients: this.api.clients(), devices: this.api.allDevices() }).subscribe({
        next: ({ clients, devices }) => { this.report.set({ type, generated: new Date().toLocaleString(), clients, devices }); this.loading.set(false); },
        error: (e: unknown) => { this.error.set(errMsg(e)); this.loading.set(false); },
      });
    } else {
      this.api.equipmentReport().subscribe({
        next: (equipment) => {
          this.report.set({ type, generated: new Date().toLocaleString(), equipment: equipment.filter((entry) => entry.delivered === (type === 'delivered')) });
          this.loading.set(false);
        },
        error: (e: unknown) => { this.error.set(errMsg(e)); this.loading.set(false); },
      });
    }
  }
  clientName(clients: Client[], id: string) { return clients.find((client) => client.id === id)?.name ?? 'Unknown client'; }
  print() { window.print(); }
}
