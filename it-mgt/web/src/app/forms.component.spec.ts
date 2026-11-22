import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Auth, EquipmentEntry } from './api';
import { AssetMovementComponent } from './forms.component';

const equipment: EquipmentEntry[] = [
  { id: '1', name: 'Laptop', serialNumber: 'S-1', assetTag: 'A-1', brand: 'Brand', model: 'Model', dateReceived: '2026-01-01', notes: '', createdAt: '', delivered: false, deliveredTo: null },
  { id: '2', name: 'Laptop', serialNumber: 'S-2', assetTag: 'A-2', brand: 'Other', model: 'M2', dateReceived: '2026-01-01', notes: '', createdAt: '', delivered: true, deliveredTo: 'Site' },
  { id: '3', name: 'Monitor', serialNumber: 'S-3', assetTag: 'A-3', brand: 'Display', model: 'M3', dateReceived: '2026-01-01', notes: '', createdAt: '', delivered: false, deliveredTo: null },
];

describe('Asset movement forms', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AssetMovementComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).user.set({ id: 'u', username: 'viewer', role: 'viewer', active: true });
  });

  it('filters outbound serials, autofills and saves snapshots for multiple items', async () => {
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    const component = fixture.componentInstance;
    component.draft = { assetName: '', assetTag: '', serialNumber: '', moverName: 'Alex', moverContact: '',
      origin: 'Office', destination: 'Store', movementDate: '2026-11-20', notes: '', direction: 'outbound' };
    const first = component.assets[0];
    component.changeName(first, 'Laptop');
    expect(component.serialOptions(first)).toEqual(['S-1']);
    component.selectSerial(first, 'S-1');
    expect(first).toMatchObject({ assetTag: 'A-1', brand: 'Brand', model: 'Model' });
    component.addAsset();
    component.changeName(component.assets[1], 'Monitor');
    component.selectSerial(component.assets[1], 'S-3');
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    const req = http.expectOne('/api/asset-movements');
    expect(req.request.body).toMatchObject({ serialNumber: 'S-1', brand: 'Brand', model: 'Model',
      additionalAssets: [{ assetName: 'Monitor', serialNumber: 'S-3', assetTag: 'A-3', brand: 'Display', model: 'M3' }] });
    req.flush({ ...req.request.body, id: 'one', createdAt: '' });
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.movement-report').textContent).toContain('Brand');
    expect(fixture.nativeElement.querySelector('.movement-report').textContent).toContain('M3');
    http.verify();
  });

  it('allows delivered serials for returns and retains historical selections when editing', () => {
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    const component = fixture.componentInstance;
    component.changeName(component.assets[0], 'Laptop');
    component.draft.direction = 'inbound';
    expect(component.serialOptions(component.assets[0])).toEqual(['S-1', 'S-2']);
    component.selectSerial(component.assets[0], 'S-2');
    component.draft.direction = 'outbound';
    component.directionChanged();
    expect(component.assets[0].serialNumber).toBe('');
    component.edit({ id: 'old', assetName: 'Laptop', serialNumber: 'S-2', assetTag: 'old', brand: 'Old brand',
      model: 'Old model', moverName: 'Alex', moverContact: '', origin: 'Office', destination: 'Site',
      movementDate: '2026-01-01', notes: '', createdAt: '', direction: 'outbound' });
    expect(component.serialOptions(component.assets[0])).toContain('S-2');
    expect(component.assets[0].brand).toBe('Old brand');
  });

  it('preserves older items with no serial when editing', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'admin', role: 'admin', active: true });
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    const component = fixture.componentInstance;
    component.edit({ id: 'old', assetName: 'Legacy', serialNumber: '', assetTag: '', moverName: 'Alex', moverContact: '',
      origin: 'Office', destination: 'Site', movementDate: '2026-01-01', notes: '', createdAt: '', direction: 'outbound' });
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    const req = http.expectOne('/api/asset-movements/old');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.serialNumber).toBe('');
    req.flush({ ...req.request.body, id: 'old', createdAt: '' });
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    http.verify();
  });
});
