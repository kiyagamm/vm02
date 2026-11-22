import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, Auth, BrandingService, EquipmentDetails, EquipmentEntry, errMsg } from './api';

const emptyEntry = (): EquipmentDetails => ({
  name: '', serialNumber: '', assetTag: '', brand: '', model: '', dateReceived: '', notes: '',
});

@Component({
  selector: 'app-equipment-entry',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="no-print">
      <a routerLink="/forms">← Forms</a>
      <h1>Equipment entry</h1>
      <p class="muted">Delivery is determined by the latest matching movement, using the movement date and then creation time. A later inbound movement clears delivery.</p>
      @if (error()) { <div class="error" role="alert">{{ error() }}</div> }
      @if (loadFailed()) { <button type="button" (click)="load()">Retry loading entries</button> }
      @if (auth.canAccessForms()) {
        <form class="card form" #entryForm="ngForm" (ngSubmit)="save(entryForm)">
          <h3>{{ editingId() ? 'Edit equipment entry' : 'New equipment entry' }}</h3>
          <label>Equipment name * <input name="name" [(ngModel)]="draft.name" required maxlength="200" /></label>
          <label>Serial number * <input name="serialNumber" [(ngModel)]="draft.serialNumber" required maxlength="200" /></label>
          <label>Asset tag <input name="assetTag" [(ngModel)]="draft.assetTag" maxlength="200" /></label>
          <label>Brand <input name="brand" [(ngModel)]="draft.brand" maxlength="200" /></label>
          <label>Model <input name="model" [(ngModel)]="draft.model" maxlength="200" /></label>
          <label>Date received * <input name="dateReceived" type="date" [(ngModel)]="draft.dateReceived" required /></label>
          <label>Notes <textarea name="notes" [(ngModel)]="draft.notes" maxlength="2000"></textarea></label>
          <div><button [disabled]="entryForm.invalid || saving() || loading() || loadFailed()">Save form</button>
            @if (editingId()) { <button type="button" (click)="cancelEdit(entryForm)" [disabled]="saving()">Cancel</button> }
          </div>
        </form>
      }
      <h2>Saved entries</h2>
      @if (loading()) { <p>Loading entries…</p> }
      @else if (!entries().length && !error()) { <p class="muted">No equipment entries have been saved yet.</p> }
      @else if (entries().length) {
        @for (group of groupedEntries(); track group.key) {
          <section class="equipment-group">
            <h3>{{ group.name }}</h3>
            <table>
              <thead><tr><th>Equipment</th><th>Serial number</th><th>Status</th><th>Delivered to</th><th></th></tr></thead>
              <tbody>
                @for (entry of group.entries; track entry.id) {
                  <tr><td>{{ entry.name }}</td><td>{{ entry.serialNumber }}</td>
                    <td>{{ entry.delivered ? 'Delivered' : 'Not delivered' }}</td><td>{{ entry.deliveredTo || '—' }}</td>
                    <td><button type="button" class="sm" (click)="selected.set(entry)">View</button>
                      @if (auth.isAdmin()) {
                        <button type="button" class="sm" (click)="edit(entry)" [disabled]="saving()">Edit</button>
                        <button type="button" class="sm danger" (click)="remove(entry)" [disabled]="saving()">Delete</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      }
      @if (selected()) {
        <p><button type="button" (click)="print()">Print / save as PDF</button></p>
        @if (!brand.branding().logo) { <p class="muted">Add an organisation logo in Settings to include it on the form.</p> }
      }
    </div>
    @if (selected(); as entry) {
      <article class="report movement-report">
        <header class="movement-header">
          @if (brand.branding().logo; as logo) { <img [src]="logo" alt="Organisation logo" /> }
          <div><strong>{{ brand.branding().companyName || auth.user()?.organization?.name }}</strong><h2>Equipment entry form</h2></div>
        </header>
        <p><b>Equipment:</b> {{ entry.name }}</p>
        <p><b>Serial number:</b> {{ entry.serialNumber }}</p>
        <p><b>Asset tag:</b> {{ entry.assetTag || '—' }}</p>
        <p><b>Brand:</b> {{ entry.brand || '—' }}</p>
        <p><b>Model:</b> {{ entry.model || '—' }}</p>
        <p><b>Date received:</b> {{ entry.dateReceived }}</p>
        <p><b>Status:</b> {{ entry.delivered ? 'Delivered' : 'Not delivered' }}</p>
        <p><b>Delivered to:</b> {{ entry.deliveredTo || '—' }}</p>
        <p class="movement-notes"><b>Notes:</b> {{ entry.notes || '—' }}</p>
      </article>
    }
  `,
})
export class EquipmentEntryComponent implements OnInit {
  private api = inject(Api);
  @ViewChild('entryForm') private entryForm?: NgForm;
  readonly auth = inject(Auth);
  readonly brand = inject(BrandingService);
  entries = signal<EquipmentEntry[]>([]);
  groupedEntries = computed(() => {
    const groups = new Map<string, { key: string; name: string; entries: EquipmentEntry[] }>();
    for (const entry of this.entries()) {
      const name = entry.name.trim();
      const key = name.toLowerCase();
      const group = groups.get(key);
      if (group) group.entries.push(entry);
      else groups.set(key, { key, name, entries: [entry] });
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  selected = signal<EquipmentEntry | null>(null);
  editingId = signal<string | null>(null);
  loading = signal(true);
  loadFailed = signal(false);
  saving = signal(false);
  error = signal('');
  draft = emptyEntry();

  ngOnInit() { this.load(); }
  load(selectId?: string) {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set('');
    this.api.equipmentEntries().subscribe({
      next: (entries) => {
        this.entries.set(entries);
        const id = selectId ?? this.selected()?.id;
        this.selected.set(entries.find((entry) => entry.id === id) ?? null);
        this.loading.set(false);
      },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.loading.set(false); this.loadFailed.set(true); },
    });
  }
  edit(entry: EquipmentEntry) {
    this.editingId.set(entry.id);
    this.draft = { name: entry.name, serialNumber: entry.serialNumber, assetTag: entry.assetTag,
      brand: entry.brand, model: entry.model, dateReceived: entry.dateReceived, notes: entry.notes };
    this.error.set('');
  }
  cancelEdit(form: NgForm) {
    this.editingId.set(null);
    this.draft = emptyEntry();
    form.resetForm(this.draft);
  }
  save(form: NgForm) {
    if (form.invalid || this.saving() || this.loading() || this.loadFailed()) return;
    const draft = { ...this.draft, name: this.draft.name.trim(), serialNumber: this.draft.serialNumber.trim() };
    if (!draft.name || !draft.serialNumber) { this.error.set('Complete all required fields.'); return; }
    this.error.set('');
    this.saving.set(true);
    const id = this.editingId();
    const request = id ? this.api.updateEquipmentEntry(id, draft) : this.api.createEquipmentEntry(draft);
    request.subscribe({
      next: (entry) => { this.cancelEdit(form); this.saving.set(false); this.load(entry.id); },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.saving.set(false); },
    });
  }
  remove(entry: EquipmentEntry) {
    if (!confirm('Delete this equipment entry?')) return;
    this.error.set('');
    this.saving.set(true);
    this.api.deleteEquipmentEntry(entry.id).subscribe({
      next: () => {
        this.entries.update((entries) => entries.filter((item) => item.id !== entry.id));
        if (this.selected()?.id === entry.id) this.selected.set(null);
        if (this.editingId() === entry.id && this.entryForm) this.cancelEdit(this.entryForm);
        this.saving.set(false);
      },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.saving.set(false); },
    });
  }
  print() { window.print(); }
}
