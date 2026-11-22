import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from './api';
import { ReportsComponent } from './reports.component';

describe('Reports', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReportsComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    TestBed.inject(Auth).user.set({ id: 'e', username: 'engineer', role: 'engineer', active: true });
  });

  it('generates separate delivered and in-store reports', () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    const http = TestBed.inject(HttpTestingController);
    const entries = [{ id: '1', name: 'Delivered laptop', serialNumber: 'S1', delivered: true, deliveredTo: 'Site' },
      { id: '2', name: 'In-store laptop', serialNumber: 'S2', delivered: false, deliveredTo: null }];
    fixture.componentInstance.generate();
    http.expectOne('/api/reports/equipment').flush(entries);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Delivered laptop');
    expect(fixture.nativeElement.textContent).not.toContain('In-store laptop');
    expect(fixture.nativeElement.querySelector('.report.movement-report .movement-header')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('turn off headers and footers');
    fixture.componentInstance.type = 'store';
    fixture.componentInstance.generate();
    http.expectOne('/api/reports/equipment').flush(entries);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('In-store laptop');
    expect(fixture.nativeElement.textContent).not.toContain('Delivered laptop');
    http.verify();
  });

  it('generates client device reports without credentials', () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.componentInstance.type = 'clients';
    fixture.componentInstance.generate();
    http.expectOne('/api/clients').flush([{ id: 'c', name: 'Client' }]);
    http.expectOne('/api/devices').flush([{ id: 'd', clientId: 'c', name: 'Server', type: 'server' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Client');
    expect(fixture.nativeElement.textContent).toContain('Server');
    http.verify();
  });

  it('does not offer or generate client device reports for viewers', () => {
    TestBed.inject(Auth).user.set({ id: 'v', username: 'viewer', role: 'viewer', active: true });
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('option[value="clients"]')).toBeNull();
    fixture.componentInstance.type = 'clients';
    fixture.componentInstance.generate();
    expect(fixture.componentInstance.error()).toContain('not available');
    TestBed.inject(HttpTestingController).expectNone('/api/devices');
    TestBed.inject(HttpTestingController).expectNone('/api/clients');
  });
});
