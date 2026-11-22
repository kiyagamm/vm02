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
    http.expectOne('/api/devices').flush([
      { id: 'd', clientId: 'c', name: 'Server', type: 'server', snmpCommunity: 'secret-community' },
      { id: 'e', clientId: 'c', name: 'Switch', type: 'switch' },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Client');
    expect(fixture.nativeElement.textContent).toContain('Server');
    expect(fixture.nativeElement.textContent).not.toContain('secret-community');
    const select = [...fixture.nativeElement.querySelectorAll('select')].find((item) =>
      (item as HTMLSelectElement).options[0]?.text === 'All records') as HTMLSelectElement | undefined;
    expect(select).toBeDefined();
    fixture.componentInstance.selectedId.set('d');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('Server');
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).not.toContain('Switch');
    http.verify();
  });

  it('generates all or one asset movement, including additional assets, and equipment entries', () => {
    TestBed.inject(Auth).user.set({ id: 'a', username: 'admin', role: 'admin', active: true });
    const fixture = TestBed.createComponent(ReportsComponent);
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    component.type = 'movement';
    component.generate();
    http.expectOne('/api/asset-movements').flush([
      { id: 'first', movementDate: '2026-11-20', assetName: 'Server', additionalAssets: [{ assetName: 'Monitor' }],
        origin: 'Store', destination: 'Site', moverName: 'Alex', direction: 'outbound', moverContact: 'private-contact' },
      { id: 'second', movementDate: '2026-11-21', assetName: 'Router', origin: 'Site', destination: 'Store',
        moverName: 'Sam', direction: 'inbound' },
    ]);
    fixture.detectChanges();
    const output = fixture.nativeElement.querySelector('.generated-report') as HTMLElement;
    expect(output.textContent).toContain('Server, Monitor');
    expect(output.textContent).toContain('Router');
    expect(output.textContent).not.toContain('private-contact');
    const records = [...fixture.nativeElement.querySelectorAll('select')].find((item) =>
      (item as HTMLSelectElement).options[0]?.text === 'All records') as HTMLSelectElement;
    records.value = 'first';
    records.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(output.textContent).toContain('Server, Monitor');
    expect(output.textContent).not.toContain('Router');
    records.value = '';
    records.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(output.textContent).toContain('Router');
    component.changeType('equipment');
    expect(component.report()).toBeNull();
    component.generate();
    http.expectOne('/api/reports/equipment').flush([
      { id: '1', name: 'Laptop', serialNumber: 'S1', dateReceived: '2026-11-20', delivered: false },
      { id: '2', name: 'Printer', serialNumber: 'S2', dateReceived: '2026-11-21', delivered: true, deliveredTo: 'Site' },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('Laptop');
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('Printer');
    component.selectedId.set('2');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).not.toContain('Laptop');
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('Printer');
    http.verify();
  });

  it('generates project summaries with status and completion date and supports selecting one', () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    component.type = 'projects';
    component.generate();
    http.expectOne('/api/projects').flush([
      { id: 'one', name: 'First project', clientName: 'Client A', status: 'completed', startDate: '2026-11-01',
        completionDate: '2026-11-20', location: 'Site', clientContacts: 'private-contact' },
      { id: 'two', name: 'Second project', clientName: 'Client B', status: 'in-progress', startDate: '2026-11-02',
        completionDate: null, location: 'Office' },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('First project');
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('Second project');
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('2026-11-20');
    expect(fixture.nativeElement.textContent).not.toContain('private-contact');
    component.selectedId.set('two');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).not.toContain('First project');
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('Second project');
    http.verify();
  });

  it('limits viewer client reports to names and device counts', () => {
    TestBed.inject(Auth).user.set({ id: 'v', username: 'viewer', role: 'viewer', active: true });
    const fixture = TestBed.createComponent(ReportsComponent);
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    component.type = 'client-summary';
    component.generate();
    http.expectOne('/api/clients').flush([
      { id: 'one', name: 'Client A', deviceCount: 2, contact: 'private-contact' },
      { id: 'two', name: 'Client B', deviceCount: 0 },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('Client A');
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('Client B');
    expect(fixture.nativeElement.textContent).not.toContain('private-contact');
    component.selectedId.set('one');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).not.toContain('Client B');
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('2');
    http.expectNone('/api/devices');
    http.verify();
  });

  it('prevents engineers from generating form reports', () => {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('option[value="movement"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('option[value="equipment"]')).toBeNull();
    for (const type of ['movement', 'equipment'] as const) {
      fixture.componentInstance.type = type;
      fixture.componentInstance.generate();
      expect(fixture.componentInstance.error()).toContain('not available');
    }
    TestBed.inject(HttpTestingController).expectNone('/api/asset-movements');
    TestBed.inject(HttpTestingController).expectNone('/api/reports/equipment');
  });

  it('lets viewers report on saved forms and handles empty results and failures', () => {
    TestBed.inject(Auth).user.set({ id: 'v', username: 'viewer', role: 'viewer', active: true });
    const fixture = TestBed.createComponent(ReportsComponent);
    const component = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    component.type = 'movement';
    component.generate();
    http.expectOne('/api/asset-movements').flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.generated-report').textContent).toContain('No records found.');
    component.generate();
    http.expectOne('/api/asset-movements').flush({ message: 'Cannot load forms' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Cannot load forms');
    expect(fixture.nativeElement.querySelector('.generated-report')).toBeNull();
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
