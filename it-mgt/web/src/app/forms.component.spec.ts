import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Auth, EquipmentEntry } from './api';
import { AssetMovementComponent, FormsPageComponent } from './forms.component';

const equipment: EquipmentEntry[] = [
  { id: '1', name: 'Laptop', serialNumber: 'S-1', assetTag: 'A-1', brand: 'Brand', model: 'Model', dateReceived: '2026-01-01', notes: '', createdAt: '', delivered: false, deliveredTo: null },
  { id: '2', name: 'Laptop', serialNumber: 'S-2', assetTag: 'A-2', brand: 'Other', model: 'M2', dateReceived: '2026-01-01', notes: '', createdAt: '', delivered: true, deliveredTo: 'Site' },
  { id: '3', name: 'Monitor', serialNumber: 'S-3', assetTag: 'A-3', brand: 'Display', model: 'M3', dateReceived: '2026-01-01', notes: '', createdAt: '', delivered: false, deliveredTo: null },
];

describe('Asset movement forms', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AssetMovementComponent, FormsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).user.set({ id: 'u', username: 'viewer', role: 'viewer', active: true });
  });

  it('shows equipment entry before asset movement on the forms page', () => {
    const fixture = TestBed.createComponent(FormsPageComponent);
    fixture.detectChanges();
    const headings = [...fixture.nativeElement.querySelectorAll('.card h2')] as HTMLElement[];
    expect(headings.map((heading) => heading.textContent?.trim())).toEqual(['Equipment entry', 'Asset movement']);
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
    const entry = fixture.nativeElement.querySelector('.movement-assets-entry') as HTMLTableElement;
    expect([...entry.querySelectorAll('th')].map((cell) => cell.textContent?.trim())).toEqual(['Asset *', 'Asset tag', 'Serial number', 'Model', 'Brand', '']);
    const entryRows = fixture.nativeElement.querySelectorAll('.movement-assets-entry tbody tr') as NodeListOf<HTMLTableRowElement>;
    expect(entryRows).toHaveLength(2);
    expect(entryRows[0].cells[1].textContent?.trim()).toBe('A-1');
    expect(entryRows[0].cells[2].querySelector('select')?.value).toBe('S-1');
    expect(entryRows[1].cells[3].textContent?.trim()).toBe('M3');
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    const req = http.expectOne('/api/asset-movements');
    expect(req.request.body).toMatchObject({ serialNumber: 'S-1', brand: 'Brand', model: 'Model',
      additionalAssets: [{ assetName: 'Monitor', serialNumber: 'S-3', assetTag: 'A-3', brand: 'Display', model: 'M3' }] });
    req.flush({ ...req.request.body, id: 'one', createdAt: '' });
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    fixture.detectChanges();
    const report = fixture.nativeElement.querySelector('.movement-assets-report') as HTMLTableElement;
    expect([...report.querySelectorAll('th')].map((cell) => cell.textContent?.trim())).toEqual(['Asset', 'Asset tag', 'Serial number', 'Model', 'Brand']);
    const rows = [...report.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(rows.map((row) => [...row.cells].map((cell) => cell.textContent?.trim()))).toEqual([
      ['Laptop', 'A-1', 'S-1', 'Model', 'Brand'],
      ['Monitor', 'A-3', 'S-3', 'M3', 'Display'],
    ]);
    const signatures = fixture.nativeElement.querySelector('.movement-signatures') as HTMLElement;
    expect(signatures.textContent).toContain('Released by:');
    expect(signatures.querySelector('.no-print')?.textContent).toContain('Received by:');
    http.verify();
  });

  it('saves and reopens manual assets without requiring a serial number', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'admin', role: 'admin', active: true });
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    const component = fixture.componentInstance;
    component.draft = { assetName: '', assetTag: '', serialNumber: '', moverName: 'Alex', moverContact: '',
      origin: 'Office', destination: 'Store', movementDate: '2026-11-20', notes: '', direction: 'outbound' };
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('.movement-assets-entry select') as HTMLSelectElement;
    select.value = [...select.options].find((option) => option.textContent?.trim() === 'Other (manual entry)')!.value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    const setInput = (label: string, value: string) => {
      const input = fixture.nativeElement.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    setInput('Describe asset for item 1', 'Projector');
    setInput('Asset tag for item 1', 'P-1');
    setInput('Model for item 1', 'P100');
    setInput('Brand for item 1', 'Example');
    component.addAsset();
    component.changeName(component.assets[1], 'Laptop');
    component.selectSerial(component.assets[1], 'S-1');
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    const req = http.expectOne('/api/asset-movements');
    expect(req.request.body).toMatchObject({ assetName: 'Projector', assetTag: 'P-1', serialNumber: '',
      model: 'P100', brand: 'Example', manualEntry: true,
      additionalAssets: [{ assetName: 'Laptop', serialNumber: 'S-1', manualEntry: false }] });
    const saved = { ...req.request.body, id: 'one', createdAt: '' };
    req.flush(saved);
    http.expectOne('/api/asset-movements').flush([saved]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    fixture.detectChanges();
    await fixture.whenStable();
    component.edit(saved);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('input[aria-label="Describe asset for item 1"]') as HTMLInputElement).value).toBe('Projector');
    setInput('Serial number for item 1', ' P-123 ');
    component.draft.direction = 'inbound';
    component.directionChanged();
    fixture.detectChanges();
    await fixture.whenStable();
    component.save(form);
    const update = http.expectOne('/api/asset-movements/one');
    expect(update.request.body).toMatchObject({ manualEntry: true, serialNumber: 'P-123', direction: 'inbound' });
    update.flush({ ...update.request.body, id: 'one', createdAt: '' });
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    http.verify();
  });

  it('rejects empty manual descriptions and duplicate serials across manual and registered items', async () => {
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    const component = fixture.componentInstance;
    component.draft = { assetName: '', assetTag: '', serialNumber: '', moverName: 'Alex', moverContact: '',
      origin: 'Office', destination: 'Store', movementDate: '2026-11-20', notes: '', direction: 'outbound' };
    component.chooseAsset(component.assets[0], null);
    component.assets[0].assetName = '  ';
    component.assets[0].serialNumber = ' s-1 ';
    component.addAsset();
    component.changeName(component.assets[1], 'Laptop');
    component.selectSerial(component.assets[1], 'S-1');
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    expect(component.error()).toBe('Each serial number may only be used once on a form.');
    component.assets[0].serialNumber = '';
    fixture.detectChanges();
    await fixture.whenStable();
    component.save(form);
    expect(component.error()).toBe('Complete all required fields.');
    component.assets[0].assetName = 'Projector';
    component.assets[0].serialNumber = ' s-1 ';
    fixture.detectChanges();
    await fixture.whenStable();
    component.save(form);
    expect(component.error()).toBe('Each serial number may only be used once on a form.');
    http.expectNone('/api/asset-movements');
    http.verify();
  });

  it('retains a manual additional asset when editing and clears its fields when switching to equipment', () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'admin', role: 'admin', active: true });
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    http.expectOne('/api/equipment-entries').flush(equipment);
    const component = fixture.componentInstance;
    component.edit({ id: 'one', assetName: 'Laptop', assetTag: 'A-1', serialNumber: 'S-1',
      moverName: 'Alex', moverContact: '', origin: 'Office', destination: 'Store', movementDate: '2026-11-20',
      notes: '', createdAt: '', direction: 'outbound',
      additionalAssets: [{ assetName: 'Cable', assetTag: 'C-1', serialNumber: '', model: '', brand: '', manualEntry: true }] });
    expect(component.assets[1]).toMatchObject({ assetName: 'Cable', assetTag: 'C-1', manualEntry: true });
    component.chooseAsset(component.assets[1], 'Monitor');
    expect(component.assets[1]).toMatchObject({ assetName: 'Monitor', assetTag: '', serialNumber: '', manualEntry: false });
    component.selectSerial(component.assets[1], 'S-3');
    expect(component.assets[1]).toMatchObject({ assetTag: 'A-3', model: 'M3' });
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
