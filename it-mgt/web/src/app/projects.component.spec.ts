import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgForm } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { Auth, Project, ProjectDetails } from './api';
import { ProjectsComponent } from './projects.component';

const details: ProjectDetails = {
  name: 'Deployment', clientId: null, clientName: 'New client', lpoNumber: '', referenceNumber: '',
  startDate: '2026-11-20', location: 'Site', clientLead: 'Client lead', companyLead: 'Company lead',
  teamDetails: 'Alex - engineer', clientContacts: 'Contact - 123', status: 'planned', completionDate: null,
};
const project: Project = { ...details, id: 'one', reportName: null, reportSize: null, createdAt: '', updatedAt: '' };

describe('Projects', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ProjectsComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('creates projects with manual or registered clients and updates existing projects', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'admin', role: 'admin', active: true });
    const fixture = TestBed.createComponent(ProjectsComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/projects').flush([]);
    http.expectOne('/api/clients').flush([{ id: 'client', name: 'Registered' }]);
    fixture.componentInstance.newProject();
    fixture.componentInstance.draft = { ...details };
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    fixture.componentInstance.save(form);
    const create = http.expectOne('/api/projects');
    expect(create.request.body).toMatchObject({ clientName: 'New client', clientId: null, lpoNumber: '', referenceNumber: '' });
    create.flush(project);
    fixture.componentInstance.edit(project);
    fixture.componentInstance.selectClient('client');
    fixture.componentInstance.draft.status = 'completed';
    fixture.componentInstance.draft.completionDate = '2026-11-22';
    fixture.detectChanges();
    await fixture.whenStable();
    const editForm = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    fixture.componentInstance.save(editForm);
    const update = http.expectOne('/api/projects/one');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toMatchObject({ clientId: 'client', clientName: 'Registered', status: 'completed' });
    update.flush({ ...project, clientId: 'client', clientName: 'Registered', status: 'completed', completionDate: '2026-11-22' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Registered');
    expect(fixture.nativeElement.textContent).toContain('Completed');
    expect(fixture.nativeElement.textContent).toContain('2026-11-22');
    http.verify();
  });

  it('requires a completion date when marking a project completed', async () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'admin', role: 'admin', active: true });
    const fixture = TestBed.createComponent(ProjectsComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/projects').flush([project]);
    http.expectOne('/api/clients').flush([]);
    fixture.componentInstance.edit(project);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[name=completionDate]')).toBeNull();
    const status = fixture.nativeElement.querySelector('select[name=status]') as HTMLSelectElement;
    status.value = 'completed';
    status.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    expect(fixture.nativeElement.querySelector('input[name=completionDate]')).not.toBeNull();
    expect(form.invalid).toBe(true);
    fixture.componentInstance.save(form);
    http.expectNone('/api/projects/one');
    const date = fixture.nativeElement.querySelector('input[name=completionDate]') as HTMLInputElement;
    date.value = '2026-11-22';
    date.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(form.valid).toBe(true);
    fixture.componentInstance.save(form);
    const request = http.expectOne('/api/projects/one');
    expect(request.request.body.completionDate).toBe('2026-11-22');
    request.flush({ ...project, status: 'completed', completionDate: '2026-11-22' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Completion date: 2026-11-22');
    fixture.componentInstance.edit({ ...project, status: 'completed', completionDate: '2026-11-22' });
    fixture.detectChanges();
    await fixture.whenStable();
    const reopenedStatus = fixture.nativeElement.querySelector('select[name=status]') as HTMLSelectElement;
    reopenedStatus.value = 'in-progress';
    reopenedStatus.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[name=completionDate]')).toBeNull();
    const reopenedForm = fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
    fixture.componentInstance.save(reopenedForm);
    const reopen = http.expectOne('/api/projects/one');
    expect(reopen.request.body).toMatchObject({ status: 'in-progress', completionDate: '2026-11-22' });
    reopen.flush({ ...project, status: 'in-progress', completionDate: '2026-11-22' });
    http.verify();
  });

  it('uploads and replaces reports only for completed projects', () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'engineer', role: 'engineer', active: true });
    const fixture = TestBed.createComponent(ProjectsComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/projects').flush([project, { ...project, id: 'two', name: 'Finished', status: 'completed', reportName: 'old.pdf', reportSize: 1 }]);
    http.expectOne('/api/clients').flush([]);
    fixture.detectChanges();
    const sections = fixture.nativeElement.querySelectorAll('section.card') as NodeListOf<HTMLElement>;
    expect(sections[0].querySelector('input[type=file]')).toBeNull();
    expect(sections[1].textContent).toContain('replaces the current report');
    const input = sections[1].querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    [...sections[1].querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Upload report')!.click();
    const request = http.expectOne('/api/projects/two/completion-report');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBe(file);
    request.flush({ name: 'report.pdf', size: file.size });
    fixture.detectChanges();
    expect(sections[1].textContent).toContain('report.pdf');
    expect(sections[1].textContent).not.toContain('old.pdf');
    http.verify();
  });

  it('lets viewers read project details and request reports without editing or loading client details', () => {
    TestBed.inject(Auth).user.set({ id: 'u', username: 'viewer', role: 'viewer', active: true });
    const fixture = TestBed.createComponent(ProjectsComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/projects').flush([{ ...project, status: 'completed', reportName: 'report.pdf', reportSize: 10 }]);
    http.expectNone('/api/clients');
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Alex - engineer');
    expect(page.textContent).toContain('Contact - 123');
    expect(page.textContent).not.toContain('Edit');
    expect(page.textContent).not.toContain('Add project');
    expect(page.querySelector('input[type=file]')).toBeNull();
    const download = [...page.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Download')!;
    download.click();
    const request = http.expectOne('/api/projects/one/completion-report');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['forbidden']), { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(page.querySelector('[role=alert]')).not.toBeNull();
    http.verify();
  });
});
