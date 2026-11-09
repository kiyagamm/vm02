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
    <table>
      <thead><tr><th>Name</th><th>Clients</th><th>Users</th><th></th></tr></thead>
      <tbody>
        @for (o of orgs(); track o.id) {
          <tr>
            <td>{{ o.name }} @if (o.id === current()) { <span class="tag">current</span> }</td>
            <td>{{ o.clientCount }}</td>
            <td>{{ o.userCount }}</td>
            <td>
              @if (o.id !== current()) { <button class="sm" (click)="enter(o.id)">Open</button> }
              <button class="sm" (click)="rename(o)">Rename</button>
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
