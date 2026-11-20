import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, AssetMovement, AssetMovementDetails, Auth, BrandingService, errMsg } from './api';

@Component({
  selector: 'app-forms',
  imports: [RouterLink],
  template: `
    <h1>Forms</h1>
    <p class="muted">Create and view forms for your organisation.</p>
    <div class="card">
      <h2>Asset movement</h2>
      <p>Record an asset's movement and print a copy.</p>
      <a routerLink="/forms/asset-movement">Open asset movement forms</a>
    </div>
  `,
})
export class FormsPageComponent {}

const emptyMovement = (): AssetMovementDetails => ({
  assetName: '', assetTag: '', serialNumber: '', moverName: '', moverContact: '',
  origin: '', destination: '', movementDate: '', notes: '',
});

@Component({
  selector: 'app-asset-movement',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="no-print">
      <a routerLink="/forms">← Forms</a>
      <h1>Asset movement</h1>
      <p class="muted">Saved forms are available to users in this organisation. Recording a movement does not update the asset inventory.</p>
      @if (error()) { <div class="error" role="alert">{{ error() }}</div> }
      @if (loadFailed()) { <button type="button" (click)="load()">Retry loading forms</button> }
      @if (auth.canWrite()) {
        <form class="card form" #movementForm="ngForm" (ngSubmit)="save(movementForm)">
          <h3>New movement form</h3>
          <label>Asset name or description * <input name="assetName" [(ngModel)]="draft.assetName" required maxlength="200" /></label>
          <label>Asset tag <input name="assetTag" [(ngModel)]="draft.assetTag" maxlength="200" /></label>
          <label>Serial number <input name="serialNumber" [(ngModel)]="draft.serialNumber" maxlength="200" /></label>
          <label>Person moving the asset * <input name="moverName" [(ngModel)]="draft.moverName" required maxlength="200" /></label>
          <label>Person's contact details <input name="moverContact" [(ngModel)]="draft.moverContact" maxlength="200" /></label>
          <label>Moving from * <input name="origin" [(ngModel)]="draft.origin" required maxlength="200" /></label>
          <label>Destination * <input name="destination" [(ngModel)]="draft.destination" required maxlength="200" /></label>
          <label>Movement date * <input name="movementDate" type="date" [(ngModel)]="draft.movementDate" required /></label>
          <label>Notes <textarea name="notes" [(ngModel)]="draft.notes" maxlength="2000"></textarea></label>
          <div><button [disabled]="movementForm.invalid || saving() || loading() || loadFailed()">Save form</button></div>
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
                <td>{{ movement.movementDate }}</td><td>{{ movement.assetName }}</td>
                <td>{{ movement.moverName }}</td><td>{{ movement.destination }}</td>
                <td><button type="button" class="sm" (click)="selected.set(movement)">View</button></td>
              </tr>
            }
          </tbody>
        </table>
      }
      @if (selected()) {
        <p><button type="button" (click)="print()">Print / save as PDF</button></p>
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
        <h3>Asset details</h3>
        <p><b>Asset:</b> {{ movement.assetName }}</p>
        <p><b>Asset tag:</b> {{ movement.assetTag || '—' }}</p>
        <p><b>Serial number:</b> {{ movement.serialNumber || '—' }}</p>
        <h3>Person moving the asset</h3>
        <p><b>Name:</b> {{ movement.moverName }}</p>
        <p><b>Contact:</b> {{ movement.moverContact || '—' }}</p>
        <h3>Movement details</h3>
        <p><b>From:</b> {{ movement.origin }}</p>
        <p><b>Destination:</b> {{ movement.destination }}</p>
        <p class="movement-notes"><b>Notes:</b> {{ movement.notes || '—' }}</p>
        <div class="movement-signatures"><span>Released by: ____________________</span><span>Received by: ____________________</span></div>
      </article>
    }
  `,
})
export class AssetMovementComponent implements OnInit {
  private api = inject(Api);
  readonly auth = inject(Auth);
  readonly brand = inject(BrandingService);
  movements = signal<AssetMovement[]>([]);
  selected = signal<AssetMovement | null>(null);
  loading = signal(true);
  loadFailed = signal(false);
  saving = signal(false);
  error = signal('');
  draft = emptyMovement();

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set('');
    this.api.assetMovements().subscribe({
      next: (movements) => { this.movements.set(movements); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.loading.set(false); this.loadFailed.set(true); },
    });
  }

  save(form: NgForm) {
    if (form.invalid || this.saving() || this.loading() || this.loadFailed()) return;
    const draft = {
      ...this.draft,
      assetName: this.draft.assetName.trim(), moverName: this.draft.moverName.trim(),
      origin: this.draft.origin.trim(), destination: this.draft.destination.trim(),
    };
    if (!draft.assetName || !draft.moverName || !draft.origin || !draft.destination) {
      this.error.set('Complete all required fields.');
      return;
    }
    this.error.set('');
    this.saving.set(true);
    this.api.createAssetMovement(draft).subscribe({
      next: (movement) => {
        this.movements.update((items) => [movement, ...items]);
        this.selected.set(movement);
        this.draft = emptyMovement();
        form.resetForm(this.draft);
        this.saving.set(false);
      },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.saving.set(false); },
    });
  }

  print() { window.print(); }
}
