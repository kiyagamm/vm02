import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgForm } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Auth, BrandingService } from './api';
import { EquipmentEntryComponent } from './equipment-entry.component';

const entry = { id: 'one', name: 'Laptop', serialNumber: 'S-1', assetTag: 'A-1', brand: 'Brand', model: 'Model',
  dateReceived: '2026-11-20', notes: '', createdAt: '2026-11-20T00:00:00Z', delivered: true, deliveredTo: 'Warehouse' };

describe('Equipment entry forms', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [EquipmentEntryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('lets a viewer create an entry and view the recalculated delivery and logo', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'viewer', role: 'viewer', active: true });
    TestBed.inject(BrandingService).branding.set({ companyName: 'Org', logo: 'data:image/png;base64,abc' });
    const fixture = TestBed.createComponent(EquipmentEntryComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/equipment-entries').flush([]);
    fixture.componentInstance.draft = { name: 'Laptop', serialNumber: ' S-1 ', assetTag: 'A-1', brand: 'Brand', model: 'Model',
      dateReceived: '2026-11-20', notes: '' };
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    fixture.componentInstance.save(form);
    const save = http.expectOne('/api/equipment-entries');
    expect(save.request.method).toBe('POST');
    expect(save.request.body.serialNumber).toBe('S-1');
    save.flush(entry);
    http.expectOne('/api/equipment-entries').flush([entry]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Delivered');
    expect(fixture.nativeElement.textContent).toContain('Warehouse');
    expect(fixture.nativeElement.querySelector('.movement-report img').getAttribute('src')).toBe('data:image/png;base64,abc');
    expect(fixture.nativeElement.querySelector('td .danger')).toBeNull();
    http.verify();
  });

  it('allows admins to edit and delete entries', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'admin', role: 'admin', active: true });
    const fixture = TestBed.createComponent(EquipmentEntryComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/equipment-entries').flush([entry]);
    fixture.detectChanges();
    fixture.componentInstance.edit(entry);
    fixture.componentInstance.draft.name = 'Updated';
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    fixture.componentInstance.save(form);
    const update = http.expectOne('/api/equipment-entries/one');
    expect(update.request.method).toBe('PUT');
    update.flush({ ...entry, name: 'Updated' });
    http.expectOne('/api/equipment-entries').flush([{ ...entry, name: 'Updated' }]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fixture.componentInstance.remove({ ...entry, name: 'Updated' });
    const remove = http.expectOne('/api/equipment-entries/one');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
    expect(fixture.componentInstance.entries()).toHaveLength(0);
    confirmSpy.mockRestore();
    http.verify();
  });

  it('groups entries by equipment name and updates groups when entries change', () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'admin', role: 'admin', active: true });
    const fixture = TestBed.createComponent(EquipmentEntryComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const server = { ...entry, id: 'server', name: 'Server', serialNumber: 'S-2' };
    const switchEntry = { ...entry, id: 'switch', name: 'Switch', serialNumber: 'S-3', delivered: false, deliveredTo: null };
    const anotherServer = { ...entry, id: 'server-2', name: ' server ', serialNumber: 'S-4' };
    http.expectOne('/api/equipment-entries').flush([switchEntry, server, anotherServer]);
    fixture.detectChanges();
    const groups = Array.from(fixture.nativeElement.querySelectorAll('.equipment-group')) as HTMLElement[];
    expect(groups.map((group) => group.querySelector('h3')?.textContent?.trim())).toEqual(['Server', 'Switch']);
    expect(groups[0].querySelectorAll('tbody tr')).toHaveLength(2);
    expect(groups[0].textContent).toContain('S-2');
    expect(groups[0].textContent).toContain('S-4');
    expect(groups[1].textContent).toContain('Not delivered');
    expect(groups[1].querySelectorAll('button')).toHaveLength(3);

    fixture.componentInstance.entries.set([{ ...server, name: 'Storage' }, switchEntry]);
    fixture.detectChanges();
    const updatedGroups = Array.from(fixture.nativeElement.querySelectorAll('.equipment-group h3')) as HTMLElement[];
    expect(updatedGroups.map((heading) => heading.textContent?.trim())).toEqual(['Storage', 'Switch']);
    http.verify();
  });
});
