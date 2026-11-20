import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Auth, BrandingService } from './api';
import { AssetMovementComponent } from './forms.component';

describe('Asset movement forms', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AssetMovementComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('saves multiple items on one form and displays them with the organisation logo', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'alex', role: 'engineer', active: true, organization: { id: 'org', name: 'Org' } });
    TestBed.inject(BrandingService).branding.set({ companyName: 'Org', logo: 'data:image/png;base64,abc' });
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    const component = fixture.componentInstance;
    component.draft = {
      assetName: ' Laptop ', assetTag: 'A-1', serialNumber: 'S-1', moverName: 'Alex',
      moverContact: '123', origin: 'Office', destination: 'Store', movementDate: '2026-11-20', notes: 'Handle carefully',
    };
    component.assets = [
      { assetName: ' Laptop ', assetTag: 'A-1', serialNumber: 'S-1' },
      { assetName: ' Monitor ', assetTag: 'A-2', serialNumber: 'S-2' },
    ];
    fixture.detectChanges();
    await fixture.whenStable();
    const ngForm = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(ngForm);
    const req = http.expectOne('/api/asset-movements');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.assetName).toBe('Laptop');
    expect(req.request.body.additionalAssets).toEqual([{ assetName: 'Monitor', assetTag: 'A-2', serialNumber: 'S-2' }]);
    req.flush({ ...req.request.body, id: 'one', createdAt: '2026-11-20T00:00:00Z' });
    fixture.detectChanges();
    const report = fixture.nativeElement.querySelector('.movement-report') as HTMLElement;
    expect(report.textContent).toContain('Handle carefully');
    expect(report.textContent).toContain('Store');
    expect(report.textContent).toContain('Laptop');
    expect(report.textContent).toContain('Monitor');
    expect(report.textContent).toContain('S-2');
    expect(report.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,abc');
    expect(component.movements()).toHaveLength(1);
    expect(component.assets).toEqual([{ assetName: '', assetTag: '', serialNumber: '' }]);
    expect(fixture.nativeElement.textContent).toContain('Laptop, Monitor');
    http.verify();
  });

  it('lets viewers open saved forms but not create them', () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'viewer', role: 'viewer', active: true });
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/asset-movements').flush([{
      id: 'one', assetName: 'Laptop', moverName: 'Alex', destination: 'Store', movementDate: '2026-11-20',
    }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Laptop');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.movement-report').textContent).toContain('Laptop');
  });

  it('adds and removes items and rejects whitespace-only item names', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'alex', role: 'engineer', active: true });
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    const component = fixture.componentInstance;
    component.draft = { assetName: '', assetTag: '', serialNumber: '', moverName: 'Alex', moverContact: '',
      origin: 'Office', destination: 'Store', movementDate: '2026-11-20', notes: '' };
    component.assets[0].assetName = 'Laptop';
    component.addAsset();
    component.assets[1].assetName = '   ';
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    expect(component.error()).toBe('Complete all required fields.');
    http.expectNone('/api/asset-movements');
    component.removeAsset(1);
    component.removeAsset(0);
    expect(component.assets).toHaveLength(1);
    fixture.detectChanges();
    await fixture.whenStable();
    component.save(form);
    const req = http.expectOne('/api/asset-movements');
    expect(req.request.body.additionalAssets).toEqual([]);
    req.flush({ ...req.request.body, id: 'one', createdAt: '2026-11-20T00:00:00Z' });
    http.verify();
  });

  it('keeps the remaining item values when the first item is removed', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'alex', role: 'engineer', active: true });
    const fixture = TestBed.createComponent(AssetMovementComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/asset-movements').flush([]);
    const component = fixture.componentInstance;
    component.draft = { assetName: '', assetTag: '', serialNumber: '', moverName: 'Alex', moverContact: '',
      origin: 'Office', destination: 'Store', movementDate: '2026-11-20', notes: '' };
    component.assets[0].assetName = 'Laptop';
    component.addAsset();
    component.assets[1] = { assetName: 'Monitor', assetTag: 'A-2', serialNumber: 'S-2' };
    fixture.detectChanges();
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('.movement-asset button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement.querySelector('.movement-asset input') as HTMLInputElement).value).toBe('Monitor');
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    component.save(form);
    const req = http.expectOne('/api/asset-movements');
    expect(req.request.body.assetName).toBe('Monitor');
    expect(req.request.body.assetTag).toBe('A-2');
    req.flush({ ...req.request.body, id: 'one', createdAt: '2026-11-20T00:00:00Z' });
    http.verify();
  });
});
