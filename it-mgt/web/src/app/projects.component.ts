import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { Api, Auth, Client, errMsg, Project, ProjectDetails, ProjectStatus } from './api';

const emptyProject = (): ProjectDetails => ({
  name: '', clientId: null, clientName: '', lpoNumber: '', referenceNumber: '', startDate: '', location: '',
  clientLead: '', companyLead: '', teamDetails: '', clientContacts: '', status: 'planned', completionDate: null,
});

@Component({
  selector: 'app-projects',
  imports: [FormsModule],
  template: `
    <div class="row"><h1>Projects</h1>
      @if (auth.canWrite()) { <button type="button" (click)="newProject()" [disabled]="saving() || loading()">+ Add project</button> }
    </div>
    <p class="muted">Select a project to view its details.</p>
    @if (error()) { <div class="error" role="alert">{{ error() }}</div> }
    @if (loading()) { <p>Loading projects…</p> }
    @if (loadFailed()) { <button type="button" (click)="load()">Retry loading projects</button> }
    @if (editing()) {
      <form class="card form" #projectForm="ngForm" (ngSubmit)="save(projectForm)">
        <h3>{{ editingId() ? 'Edit project' : 'New project' }}</h3>
        <label>Project name * <input name="name" [(ngModel)]="draft.name" required maxlength="200" /></label>
        <label>Client
          <select name="clientId" [ngModel]="draft.clientId" (ngModelChange)="selectClient($event)">
            <option [ngValue]="null">Other (enter name)</option>
            @for (client of clients(); track client.id) { <option [ngValue]="client.id">{{ client.name }}</option> }
          </select>
        </label>
        @if (!draft.clientId) {
          <label>Client name * <input name="clientName" [(ngModel)]="draft.clientName" required maxlength="200" /></label>
        }
        <label>LPO number (optional) <input name="lpo" [(ngModel)]="draft.lpoNumber" maxlength="200" /></label>
        <label>Project reference number (optional) <input name="reference" [(ngModel)]="draft.referenceNumber" maxlength="200" /></label>
        <label>Start date * <input name="startDate" type="date" [(ngModel)]="draft.startDate" required /></label>
        <label>Location * <input name="location" [(ngModel)]="draft.location" required maxlength="200" /></label>
        <label>Client project lead * <input name="clientLead" [(ngModel)]="draft.clientLead" required maxlength="200" /></label>
        <label>Executing company project lead * <input name="companyLead" [(ngModel)]="draft.companyLead" required maxlength="200" /></label>
        <label>Project team details * <textarea name="teamDetails" [(ngModel)]="draft.teamDetails" required maxlength="5000" rows="3" placeholder="Names, roles and contact details"></textarea></label>
        <label>Client contact persons * <textarea name="clientContacts" [(ngModel)]="draft.clientContacts" required maxlength="5000" rows="3" placeholder="Names, roles, phone numbers and email addresses"></textarea></label>
        <label>Status * <select name="status" [(ngModel)]="draft.status" required>
          @for (status of statuses; track status.value) { <option [value]="status.value">{{ status.label }}</option> }
        </select></label>
        @if (draft.status === 'completed') {
          <label>Completion date * <input name="completionDate" type="date" [(ngModel)]="draft.completionDate" required /></label>
        }
        <div><button [disabled]="projectForm.invalid || saving() || loading() || loadFailed()">Save project</button>
          <button type="button" (click)="cancelEdit()" [disabled]="saving()">Cancel</button></div>
      </form>
    }
    @for (project of projects(); track project.id) {
      <section class="card">
        <details>
          <summary class="project-summary">
            <strong>{{ project.name }}</strong> · Client: {{ project.clientName }}
            <span class="tag">{{ statusLabel(project.status) }}</span>
          </summary>
          @if (auth.canWrite()) { <p><button type="button" class="sm" (click)="edit(project)" [disabled]="saving()">Edit</button></p> }
          <p><b>LPO number:</b> {{ project.lpoNumber || '—' }} · <b>Project reference:</b> {{ project.referenceNumber || '—' }}</p>
          <p><b>Start date:</b> {{ project.startDate }} · <b>Location:</b> {{ project.location }}</p>
          @if (project.status === 'completed' || project.completionDate) {
            <p><b>Completion date:</b> {{ project.completionDate || '—' }}</p>
          }
          <p><b>Client project lead:</b> {{ project.clientLead }}</p>
          <p><b>Executing company project lead:</b> {{ project.companyLead }}</p>
          <p class="movement-notes"><b>Project team:</b> {{ project.teamDetails }}</p>
          <p class="movement-notes"><b>Client contacts:</b> {{ project.clientContacts }}</p>
          <h3>Completion report</h3>
          @if (project.reportName) {
            <p>{{ project.reportName }} ({{ project.reportSize }} bytes)
              <button type="button" class="sm" (click)="download(project)">Download</button></p>
          } @else { <p class="muted">No completion report uploaded.</p> }
          @if (auth.canWrite() && project.status === 'completed') {
            <label>Upload completion report (max 25 MB)
              <input #reportFile type="file" (change)="selectReport(project.id, $event)" [disabled]="saving()" />
            </label>
            @if (project.reportName) { <p class="muted">Uploading a new report replaces the current report.</p> }
            <p><button type="button" (click)="upload(project, reportFile)" [disabled]="saving() || selectedFile()?.projectId !== project.id">Upload report</button></p>
          }
        </details>
      </section>
    } @empty {
      @if (!loading() && !loadFailed()) { <p class="muted">No projects yet.</p> }
    }
  `,
  styles: [`.project-summary { cursor: pointer; line-height: 1.8; }`],
})
export class ProjectsComponent implements OnInit {
  private api = inject(Api);
  readonly auth = inject(Auth);
  readonly statuses: { value: ProjectStatus; label: string }[] = [
    { value: 'planned', label: 'Planned' }, { value: 'in-progress', label: 'In progress' },
    { value: 'on-hold', label: 'On hold' }, { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
  projects = signal<Project[]>([]);
  clients = signal<Client[]>([]);
  editing = signal(false);
  editingId = signal<string | null>(null);
  selectedFile = signal<{ projectId: string; file: File } | null>(null);
  loading = signal(true);
  loadFailed = signal(false);
  saving = signal(false);
  error = signal('');
  draft = emptyProject();

  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set('');
    forkJoin({ projects: this.api.projects(), clients: this.auth.canWrite() ? this.api.clients() : of([] as Client[]) }).subscribe({
      next: ({ projects, clients }) => { this.projects.set(projects); this.clients.set(clients); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.loadFailed.set(true); this.loading.set(false); },
    });
  }
  statusLabel(status: ProjectStatus) { return this.statuses.find((item) => item.value === status)?.label ?? status; }
  newProject() { this.draft = emptyProject(); this.editingId.set(null); this.editing.set(true); this.error.set(''); }
  edit(project: Project) {
    this.draft = { name: project.name, clientId: project.clientId, clientName: project.clientName, lpoNumber: project.lpoNumber,
      referenceNumber: project.referenceNumber, startDate: project.startDate, location: project.location,
      clientLead: project.clientLead, companyLead: project.companyLead, teamDetails: project.teamDetails,
      clientContacts: project.clientContacts, status: project.status, completionDate: project.completionDate };
    this.editingId.set(project.id); this.editing.set(true); this.error.set('');
  }
  cancelEdit() { this.editing.set(false); this.editingId.set(null); }
  selectClient(id: string | null) {
    this.draft.clientId = id;
    this.draft.clientName = id ? this.clients().find((client) => client.id === id)?.name ?? '' : '';
  }
  save(form: NgForm) {
    if (form.invalid || this.saving() || this.loading() || this.loadFailed()) return;
    if (![this.draft.name, this.draft.clientName, this.draft.location, this.draft.clientLead, this.draft.companyLead,
      this.draft.teamDetails, this.draft.clientContacts].every((value) => value.trim())) {
      this.error.set('Complete all required fields.'); return;
    }
    this.saving.set(true); this.error.set('');
    const id = this.editingId();
    const request = id ? this.api.updateProject(id, this.draft) : this.api.createProject(this.draft);
    request.subscribe({
      next: (project) => {
        this.projects.update((projects) => id ? projects.map((item) => item.id === id ? project : item) : [project, ...projects]);
        this.cancelEdit(); this.saving.set(false);
      },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.saving.set(false); },
    });
  }
  selectReport(projectId: string, event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.selectedFile.set(file ? { projectId, file } : null);
    this.error.set('');
  }
  upload(project: Project, input: HTMLInputElement) {
    const selected = this.selectedFile();
    if (!selected || selected.projectId !== project.id || this.saving()) return;
    if (!selected.file.size || selected.file.size > 25 * 1024 * 1024) {
      this.error.set('Select a non-empty completion report up to 25 MB.'); return;
    }
    this.saving.set(true); this.error.set('');
    this.api.uploadProjectReport(project.id, selected.file).subscribe({
      next: (report) => {
        this.projects.update((projects) => projects.map((item) => item.id === project.id
          ? { ...item, reportName: report.name, reportSize: report.size } : item));
        this.selectedFile.set(null); input.value = ''; this.saving.set(false);
      },
      error: (e: unknown) => { this.error.set(errMsg(e)); this.saving.set(false); },
    });
  }
  download(project: Project) {
    this.error.set('');
    this.api.downloadProjectReport(project.id).subscribe({
      next: (content) => {
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url; link.download = project.reportName ?? 'completion-report'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      },
      error: (e: unknown) => this.error.set(errMsg(e)),
    });
  }
}
