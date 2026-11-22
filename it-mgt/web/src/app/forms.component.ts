import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { Api, AssetMovement, AssetMovementDetails, Auth, BrandingService, EquipmentEntry, errMsg, MovementAsset } from './api';

@Component({
  selector: 'app-forms',
  imports: [RouterLink],
  template: `
    <h1>Forms</h1>
    <p class="muted">View forms and register equipment for your organisation.</p>
    <div class="card">
      <h2>Equipment entry</h2>
      <p>Register equipment and track delivery using movement forms.</p>
      <a routerLink="/forms/equipment-entry">Open equipment entries</a>
    </div>
    <div class="card">
      <h2>Asset movement</h2>
      <p>Record the movement of one or more assets and print a copy.</p>
      <a routerLink="/forms/asset-movement">Open asset movement forms</a>
    </div>
  `,
})
export class FormsPageComponent {}

const emptyMovement = (): AssetMovementDetails => ({
  assetName: '', assetTag: '', serialNumber: '', moverName: '', moverContact: '',
  origin: '', destination: '', movementDate: '', notes: '', direction: 'outbound',
});
const emptyAsset = (): MovementAsset => ({ assetName: '', assetTag: '', serialNumber: '', brand: '', model: '', manualEntry: false });

@Component({
  selector: 'app-asset-movement',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="no-print">
      <a routerLink="/forms">← Forms</a>
      <h1>Asset movement</h1>
      <p class="muted">Saved forms are available to viewers and admins in this organisation. Matching serial numbers update equipment delivery status.</p>
      @if (error()) { <div class="error" role="alert">{{ error() }}</div> }
      @if (loadFailed()) { <button type="button" (click)="load()">Retry loading forms</button> }
      @if (auth.isAdmin()) {
        <form class="card form" #movementForm="ngForm" (ngSubmit)="save(movementForm)">
          <h3>{{ editingId() ? 'Edit movement form' : 'New movement form' }}</h3>
          <h3>Assets</h3>
          <p class="movement-table-hint">Swipe across the table to see all asset details.</p>
          <div class="movement-assets-scroll">
            <table class="movement-assets-entry">
              <thead><tr><th>Asset *</th><th>Asset tag</th><th>Serial number</th><th>Model</th><th>Brand</th><th></th></tr></thead>
              <tbody>
                @for (asset of assets; track $index; let i = $index) {
                  <tr>
                    <td><select [attr.aria-label]="'Asset for item ' + (i + 1)" [name]="'assetChoice' + i" [ngModel]="asset.manualEntry ? null : asset.assetName" (ngModelChange)="chooseAsset(asset, $event)" [required]="!asset.manualEntry">
                      <option [ngValue]="''">Select equipment</option>
                      @for (name of equipmentNames(asset); track name) { <option [ngValue]="name">{{ name }}</option> }
                      <option [ngValue]="null">Other (manual entry)</option>
                    </select>
                    @if (asset.manualEntry) {
                      <input [attr.aria-label]="'Describe asset for item ' + (i + 1)" [name]="'assetDescription' + i" [(ngModel)]="asset.assetName" placeholder="Describe the asset" required maxlength="200" />
                    }</td>
                    <td>@if (asset.manualEntry) {
                      <input [attr.aria-label]="'Asset tag for item ' + (i + 1)" [name]="'assetTag' + i" [(ngModel)]="asset.assetTag" maxlength="200" />
                    } @else { {{ asset.assetTag || '—' }} }</td>
                    <td>@if (asset.manualEntry) {
                      <input [attr.aria-label]="'Serial number for item ' + (i + 1)" [name]="'serialNumber' + i" [(ngModel)]="asset.serialNumber" maxlength="200" placeholder="Optional" />
                    } @else {
                      <select [attr.aria-label]="'Serial number for item ' + (i + 1)" [name]="'serialNumber' + i" [ngModel]="asset.serialNumber" (ngModelChange)="selectSerial(asset, $event)" [required]="!isLegacyWithoutSerial(asset)">
                        <option value="">{{ isLegacyWithoutSerial(asset) ? 'Not recorded (existing item)' : 'Select serial number (required)' }}</option>
                        @for (serial of serialOptions(asset); track serial) { <option [value]="serial">{{ serial }}</option> }
                      </select>
                    }</td>
                    <td>@if (asset.manualEntry) {
                      <input [attr.aria-label]="'Model for item ' + (i + 1)" [name]="'model' + i" [(ngModel)]="asset.model" maxlength="200" />
                    } @else { {{ asset.model || '—' }} }</td>
                    <td>@if (asset.manualEntry) {
                      <input [attr.aria-label]="'Brand for item ' + (i + 1)" [name]="'brand' + i" [(ngModel)]="asset.brand" maxlength="200" />
                    } @else { {{ asset.brand || '—' }} }</td>
                    <td>@if (assets.length > 1) { <button type="button" class="sm" (click)="removeAsset(i)">Remove item {{ i + 1 }}</button> }</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div><button type="button" (click)="addAsset()">Add another item</button></div>
          <label>Person moving the assets * <input name="moverName" [(ngModel)]="draft.moverName" required maxlength="200" /></label>
          <label>Person's contact details <input name="moverContact" [(ngModel)]="draft.moverContact" maxlength="200" /></label>
          <label>Moving from * <input name="origin" [(ngModel)]="draft.origin" required maxlength="200" /></label>
          <label>Destination * <input name="destination" [(ngModel)]="draft.destination" required maxlength="200" /></label>
          <label>Movement date * <input name="movementDate" type="date" [(ngModel)]="draft.movementDate" required /></label>
          <label>Direction * <select name="direction" [(ngModel)]="draft.direction" (ngModelChange)="directionChanged()" required><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select></label>
          <label>Notes <textarea name="notes" [(ngModel)]="draft.notes" maxlength="2000"></textarea></label>
          <div><button [disabled]="movementForm.invalid || saving() || loading() || loadFailed()">Save form</button>
            @if (editingId()) { <button type="button" (click)="cancelEdit(movementForm)" [disabled]="saving()">Cancel</button> }
          </div>
        </form>
      }
      <h2>Saved forms</h2>
      @if (loading()) {
        <p>Loading forms…</p>
      } @else if (!movements().length && !error()) {
        <p class="muted">No asset movement forms have been saved yet.</p>
      } @else if (movements().length) {
        <table>
          <thead><tr><th>Date</th><th>Asset</th><th>Person</th><th>Destination</th><th></th></tr></thead>
          <tbody>
            @for (movement of movements(); track movement.id) {
              <tr>
                <td>{{ movement.movementDate }}</td><td>{{ assetNames(movement) }}</td>
                <td>{{ movement.moverName }}</td><td>{{ movement.destination }}</td>
                <td><button type="button" class="sm" (click)="selected.set(movement)">View</button>
                  @if (auth.isAdmin()) {
                    <button type="button" class="sm" (click)="edit(movement)" [disabled]="saving()">Edit</button>
                    <button type="button" class="sm danger" (click)="remove(movement)" [disabled]="saving()">Delete</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
      @if (selected()) {
        <p><button type="button" (click)="print()">Print / save as PDF</button></p>
        <p class="muted">If your browser adds a date, title or URL, turn off headers and footers in the print settings.</p>
        @if (!brand.branding().logo) { <p class="muted">Add an organisation logo in Settings to include it on the form.</p> }
      }
    </div>
    @if (selected(); as movement) {
      <article class="report movement-report">
        <header class="movement-header">
          @if (brand.branding().logo; as logo) { <img [src]="logo" alt="Organisation logo" /> }
          <div><strong>{{ brand.branding().companyName || auth.user()?.organization?.name }}</strong><h2>Asset movement form</h2></div>
        </header>
        <p><b>Movement date:</b> {{ movement.movementDate }}</p>
        <p><b>Direction:</b> {{ movement.direction === 'inbound' ? 'Inbound' : 'Outbound' }}</p>
        <h3>Asset details</h3>
        <table class="movement-assets-report">
          <thead><tr><th>Asset</th><th>Asset tag</th><th>Serial number</th><th>Model</th><th>Brand</th></tr></thead>
          <tbody>
            @for (asset of movementAssets(movement); track $index) {
              <tr><td>{{ asset.assetName }}</td><td>{{ asset.assetTag || '—' }}</td><td>{{ asset.serialNumber || '—' }}</td>
                <td>{{ asset.model || '—' }}</td><td>{{ asset.brand || '—' }}</td></tr>
            }
          </tbody>
        </table>
        <h3>Person moving the assets</h3>
        <p><b>Name:</b> {{ movement.moverName }}</p>
        <p><b>Contact:</b> {{ movement.moverContact || '—' }}</p>
        <h3>Movement details</h3>
        <p><b>From:</b> {{ movement.origin }}</p>
        <p><b>Destination:</b> {{ movement.destination }}</p>
        <p class="movement-notes"><b>Notes:</b> {{ movement.notes || '—' }}</p>
        <div class="movement-signatures"><span>Released by: ____________________</span><span class="no-print">Received by: ____________________</span></div>
      </article>
    }
  `,
})
export class AssetMovementComponent implements OnInit {
  private api = inject(Api);
  @ViewChild('movementForm') private movementForm?: NgForm;
  readonly auth = inject(Auth);
  readonly brand = inject(BrandingService);
  movements = signal<AssetMovement[]>([]);
  equipment = signal<EquipmentEntry[]>([]);
  selected = signal<AssetMovement | null>(null);
  loading = signal(true);
  loadFailed = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  error = signal('');
  draft = emptyMovement();
  assets: MovementAsset[] = [emptyAsset()];
  private originalAssets: MovementAsset[] = [];

  isLegacyWithoutSerial(asset: MovementAsset) {
    return !!this.editingId() && !asset.serialNumber && this.originalAssets.some((item) => !item.manualEntry && !item.serialNumber && item.assetName === asset.assetName);
  }
  private eligible(entry: EquipmentEntry) {
    return this.draft.direction === 'inbound' || !entry.delivered
      || this.originalAssets.some((asset) => !asset.manualEntry && asset.serialNumber === entry.serialNumber);
  }
  equipmentNames(asset: MovementAsset) {
    return [...new Set([...this.equipment().map((entry) => entry.name),
      ...(this.originalAssets.some((item) => !item.manualEntry && item.assetName === asset.assetName) ? [asset.assetName] : [])])].sort();
  }
  serialOptions(asset: MovementAsset) {
    const serials = this.equipment().filter((entry) => this.eligible(entry) && entry.name === asset.assetName
      && !this.assets.some((other) => other !== asset && other.serialNumber === entry.serialNumber)).map((entry) => entry.serialNumber);
    for (const original of this.originalAssets) {
      if (!original.manualEntry && original.serialNumber && original.assetName === asset.assetName && !serials.includes(original.serialNumber)
        && !this.assets.some((other) => other !== asset && other.serialNumber === original.serialNumber)) serials.push(original.serialNumber);
    }
    return serials.sort();
  }
  changeName(asset: MovementAsset, name: string) {
    Object.assign(asset, emptyAsset(), { assetName: name });
  }
  chooseAsset(asset: MovementAsset, name: string | null) {
    if (name === null) Object.assign(asset, emptyAsset(), { manualEntry: true });
    else this.changeName(asset, name);
  }
  selectSerial(asset: MovementAsset, serial: string) {
    const entry = this.equipment().find((item) => item.serialNumber === serial && item.name === asset.assetName && this.eligible(item));
    const original = this.originalAssets.find((item) => !item.manualEntry && item.serialNumber === serial && item.assetName === asset.assetName);
    if (entry) Object.assign(asset, { serialNumber: entry.serialNumber, assetTag: entry.assetTag, brand: entry.brand, model: entry.model });
    else if (original) Object.assign(asset, original);
    else Object.assign(asset, { serialNumber: '', assetTag: '', brand: '', model: '' });
  }
  directionChanged() {
    for (const asset of this.assets) {
      if (!asset.manualEntry && asset.serialNumber && !this.serialOptions(asset).includes(asset.serialNumber)) this.changeName(asset, '');
    }
  }

  addAsset() { this.assets.push(emptyAsset()); }
  removeAsset(index: number) { if (this.assets.length > 1) this.assets.splice(index, 1); }
  movementAssets(movement: AssetMovement): MovementAsset[] {
    return [movement, ...(movement.additionalAssets ?? [])];
  }
  assetNames(movement: AssetMovement) { return this.movementAssets(movement).map((asset) => asset.assetName).join(', '); }

  edit(movement: AssetMovement) {
    this.editingId.set(movement.id);
    this.draft = { assetName: movement.assetName, assetTag: movement.assetTag, serialNumber: movement.serialNumber,
      direction: movement.direction ?? 'outbound', moverName: movement.moverName, moverContact: movement.moverContact,
      origin: movement.origin, destination: movement.destination, movementDate: movement.movementDate, notes: movement.notes };
    this.assets = this.movementAssets(movement).map((asset) => ({ assetName: asset.assetName, assetTag: asset.assetTag, serialNumber: asset.serialNumber, brand: asset.brand, model: asset.model, manualEntry: asset.manualEntry ?? false }));
    this.originalAssets = this.assets.map((asset) => ({ ...asset }));
    this.error.set('');
  }
  cancelEdit(form: NgForm) {
    this.editingId.set(null);
    this.originalAssets = [];
    this.draft = emptyMovement();
    this.assets = [emptyAsset()];
    form.resetForm({ ...this.draft, assetChoice0: '', serialNumber0: '' });
  }
  remove(movement: AssetMovement) {
    if (!confirm('Delete this movement form? Equipment delivery status will be recalculated.')) return;
    this.error.set('');
    this.saving.set(true);
    this.api.deleteAssetMovement(movement.id).subscribe({
      next: () => {
        this.movements.update((items) => items.filter((item) => item.id !== movement.id));
        if (this.selected()?.id === movement.id) this.selected.set(null);
        if (this.editingId() === movement.id && this.movementForm) this.cancelEdit(this.movementForm);
        this.saving.set(false);
        this.load();
      },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.saving.set(false); },
    });
  }

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set('');
    forkJoin({ movements: this.api.assetMovements(), equipment: this.auth.isAdmin() ? this.api.equipmentEntries() : of([] as EquipmentEntry[]) }).subscribe({
      next: ({ movements, equipment }) => { this.movements.set(movements); this.equipment.set(equipment); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.loading.set(false); this.loadFailed.set(true); },
    });
  }

  save(form: NgForm) {
    if (form.invalid || this.saving() || this.loading() || this.loadFailed()) return;
    const assets = this.assets.map((asset) => ({ ...asset, assetName: asset.assetName.trim(), serialNumber: asset.serialNumber.trim() }));
    const draft: AssetMovementDetails = {
      ...this.draft,
      ...assets[0], additionalAssets: assets.slice(1), moverName: this.draft.moverName.trim(),
      origin: this.draft.origin.trim(), destination: this.draft.destination.trim(),
    };
    const serials = assets.map((asset) => asset.serialNumber.toUpperCase()).filter(Boolean);
    if (new Set(serials).size !== serials.length) {
      this.error.set('Each serial number may only be used once on a form.');
      return;
    }
    if (assets.some((asset, index) => !asset.assetName || (!asset.manualEntry && !asset.serialNumber && !this.isLegacyWithoutSerial(asset))
      || (!asset.manualEntry && !!asset.serialNumber && !this.serialOptions(this.assets[index]).includes(asset.serialNumber)))
      || !draft.moverName || !draft.origin || !draft.destination) {
      this.error.set('Complete all required fields.');
      return;
    }
    this.error.set('');
    this.saving.set(true);
    const editingId = this.editingId();
    const request = editingId ? this.api.updateAssetMovement(editingId, draft) : this.api.createAssetMovement(draft);
    request.subscribe({
      next: (movement) => {
        this.movements.update((items) => editingId ? items.map((item) => item.id === movement.id ? movement : item) : [movement, ...items]);
        this.selected.set(movement);
        this.cancelEdit(form);
        this.saving.set(false);
        this.load();
      },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.saving.set(false); },
    });
  }

  print() { window.print(); }
}
