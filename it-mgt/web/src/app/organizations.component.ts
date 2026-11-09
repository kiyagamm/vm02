import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Auth, OrgSummary, SignupReq, errMsg } from './api';

@Component({
  selector: 'app-organizations',
  imports: [FormsModule],
  template: `
    <h1>Organisations</h1>
    <p class="muted">Each organisation has its own clients, devices, snippets, users, audit log and branding. Add users to organisations from the Users page.</p>
    @if (error()) { <div class="error">{{ error() }}</div> }
    <form class="card form" (ngSubmit)="create()">
      <h3>New organisation</h3>
      <label>Name <input name="n" [(ngModel)]="name" required maxlength="100" /></label>
      <div><button>Create</button></div>
    </form>
    @if (requests().length) {
      <h3>Pending signup requests</h3>
      <table>
        <thead><tr><th>Username</th><th>Request</th><th>Organisation</th><th></th></tr></thead>
        <tbody>
          @for (r of requests(); track r.id) {
            <tr>
              <td>{{ r.username }}</td>
              <td>{{ r.type === 'new-org' ? 'New organisation (admin)' : 'Join existing (viewer)' }}</td>
              <td>{{ r.organizationName }}</td>
              <td><button class="sm" (click)="approve(r)">Approve</button> <button class="sm danger" (click)="reject(r)">Reject</button></td>
            </tr>
          }
        </tbody>
      </table>
    }
    @if (editing(); as e) {
      <form class="card form" (ngSubmit)="saveEdit()">
        <h3>Edit {{ e.name }}</h3>
        <label>Name <input name="en" [(ngModel)]="e.name" required maxlength="100" /></label>
        <label>Maximum users <input name="mu" type="number" min="1" [(ngModel)]="e.maxUsers" required /></label>
        <label>Maximum devices <input name="md" type="number" min="1" [(ngModel)]="e.maxDevices" required /></label>
        <div><button>Save</button> <button type="button" (click)="editing.set(null)">Cancel</button></div>
      </form>
    }
    <table>
      <thead><tr><th>Name</th><th>Login link</th><th>Clients</th><th>Users</th><th>Devices</th><th></th></tr></thead>
      <tbody>
        @for (o of orgs(); track o.id) {
          <tr>
            <td>{{ o.name }} @if (o.id === current()) { <span class="tag">current</span> }</td>
            <td>@if (o.slug) { <a [href]="link(o.slug)" target="_blank">{{ link(o.slug) }}</a> }</td>
            <td>{{ o.clientCount }}</td>
            <td>{{ o.userCount }} / {{ o.maxUsers }}</td>
            <td>{{ o.deviceCount }} / {{ o.maxDevices }}</td>
            <td>
              @if (o.id !== current()) { <button class="sm" (click)="enter(o.id)">Open</button> }
              <button class="sm" (click)="editing.set({ id: o.id, name: o.name, maxUsers: o.maxUsers, maxDevices: o.maxDevices })">Edit</button>
              <button class="sm danger" [disabled]="o.id === current()" (click)="remove(o)">Delete</button>
            </td>
          </tr>
        }
      </tbody>
    </table>`,
})
export class OrganizationsComponent implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  orgs = signal<OrgSummary[]>([]);
  link = (slug: string) => `${location.origin}/o/${slug}`;
  requests = signal<SignupReq[]>([]);
  error = signal('');
  name = '';

  current = () => this.auth.user()?.organization?.id;
  ngOnInit() { this.load(); }
  loadRequests() { this.api.signups().subscribe((r) => this.requests.set(r)); }
  approve(r: SignupReq) { this.api.approveSignup(r.id).subscribe({ next: () => { this.load(); this.refreshSession(); }, error: this.handle.error }); }
  reject(r: SignupReq) { if (confirm(`Reject request from ${r.username}?`)) this.api.rejectSignup(r.id).subscribe({ next: () => this.loadRequests(), error: this.handle.error }); }
  load() { this.loadRequests(); this.api.orgs().subscribe({ next: (o) => this.orgs.set(o), error: (e) => this.error.set(errMsg(e)) }); }
  private handle = { next: () => { this.error.set(''); this.load(); }, error: (e: unknown) => { this.error.set(errMsg(e)); this.load(); } };

  create() {
    const name = this.name.trim();
    if (!name) return;
    this.api.createOrg(name).subscribe({ next: () => { this.name = ''; this.refreshSession(); }, error: this.handle.error });
  }
  rename(o: OrgSummary) {
    const name = prompt('New organisation name', o.name)?.trim();
    if (name && name !== o.name) this.api.renameOrg(o.id, name).subscribe({ next: () => this.refreshSession(), error: this.handle.error });
  }
  editing = signal<{ id: string; name: string; maxUsers: number; maxDevices: number } | null>(null);
  saveEdit() {
    const e = this.editing()!;
    this.api.updateOrg(e.id, { name: e.name.trim(), maxUsers: Number(e.maxUsers), maxDevices: Number(e.maxDevices) }).subscribe({
      next: () => { this.editing.set(null); this.refreshSession(); },
      error: this.handle.error,
    });
  }
  remove(o: OrgSummary) {
    if (confirm(`Delete organisation "${o.name}"? It must have no clients.`)) this.api.deleteOrg(o.id).subscribe({ next: () => this.refreshSession(), error: this.handle.error });
  }
  enter(id: string) { this.auth.switchOrg(id).subscribe(() => location.assign('/')); }

  /** Re-issue the session so the organisation list in the user menu stays current. */
  private refreshSession() {
    const id = this.current();
    if (id) this.auth.switchOrg(id).subscribe(this.handle);
    else this.load();
  }
}
