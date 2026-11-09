import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Auth, OrgRef, User, errMsg } from './api';

@Component({
  selector: 'app-users',
  imports: [FormsModule],
  template: `
    <h1>Users</h1>
    @if (error()) { <div class="error">{{ error() }}</div> }
    <form class="card form" (ngSubmit)="create()">
      <h3>New user</h3>
      <label>Username <input name="u" [(ngModel)]="nu.username" required minlength="3" /></label>
      <label>Password <input name="p" type="password" [(ngModel)]="nu.password" required minlength="8" autocomplete="new-password" /></label>
      <label>Role <select name="r" [(ngModel)]="nu.role">@for (r of roles; track r) { <option>{{ r }}</option> }</select></label>
      <div><button>Create</button></div>
    </form>
    <table>
      <thead><tr><th>Username</th><th>Role</th><th>Organisations</th><th>Active</th><th></th></tr></thead>
      <tbody>
        @for (u of users(); track u.id) {
          <tr>
            <td>{{ u.username }} @if (u.isSuperAdmin) { <span class="tag">super admin</span> }</td>
            <td><select [ngModel]="u.role" (ngModelChange)="update(u, { role: $event })" [disabled]="u.id === me()?.id">
              @for (r of roles; track r) { <option>{{ r }}</option> }</select></td>
            <td>{{ orgNames(u) }}</td>
            <td><input type="checkbox" [ngModel]="u.active" (ngModelChange)="update(u, { active: $event })" [disabled]="u.id === me()?.id" /></td>
            <td>
              @if (auth.isSuper()) { <button class="sm" (click)="editOrgs(u)">Organisations</button> }
              <button class="sm" (click)="rename(u)">Rename</button>
              <button class="sm" (click)="resetPw(u)">Reset password</button>
              <button class="sm danger" [disabled]="u.id === me()?.id" (click)="remove(u)">Remove</button>
            </td>
          </tr>
          @if (orgEdit()?.id === u.id) {
            <tr><td colspan="5">
              @for (o of allOrgs(); track o.id) {
                <label class="inline"><input type="checkbox" [checked]="orgEdit()!.ids.has(o.id)" (change)="toggleOrg(o.id)" /> {{ o.name }}</label>
              }
              <button class="sm" (click)="saveOrgs(u)">Save</button>
              <button class="sm" (click)="orgEdit.set(null)">Cancel</button>
            </td></tr>
          }
        }
      </tbody>
    </table>`,
})
export class UsersComponent implements OnInit {
  private api = inject(Api);
  readonly auth = inject(Auth);
  readonly me = this.auth.user;
  readonly roles = ['admin', 'engineer', 'viewer'];
  users = signal<User[]>([]);
  allOrgs = signal<OrgRef[]>([]);
  orgEdit = signal<{ id: string; ids: Set<string> } | null>(null);
  error = signal('');
  nu = { username: '', password: '', role: 'viewer' };

  ngOnInit() {
    this.load();
    if (this.auth.isSuper()) this.api.orgs().subscribe((o) => this.allOrgs.set(o));
  }
  load() { this.api.users().subscribe({ next: (u) => this.users.set(u), error: (e) => this.error.set(errMsg(e)) }); }
  orgNames(u: User) { return (u.organizations ?? []).map((o) => o.name).join(', '); }
  editOrgs(u: User) { this.orgEdit.set({ id: u.id, ids: new Set((u.organizations ?? []).map((o) => o.id)) }); }
  toggleOrg(id: string) {
    const e = this.orgEdit();
    if (!e) return;
    e.ids.has(id) ? e.ids.delete(id) : e.ids.add(id);
  }
  saveOrgs(u: User) {
    const e = this.orgEdit();
    if (!e) return;
    this.api.setUserOrgs(u.id, [...e.ids]).subscribe({
      next: () => { this.orgEdit.set(null); this.handle.next(); },
      error: this.handle.error,
    });
  }
  private handle = { next: () => { this.error.set(''); this.load(); }, error: (e: unknown) => { this.error.set(errMsg(e)); this.load(); } };

  create() {
    this.api.createUser(this.nu).subscribe({
      next: () => { this.nu = { username: '', password: '', role: 'viewer' }; this.handle.next(); },
      error: this.handle.error,
    });
  }
  update(u: User, patch: Partial<User>) { this.api.updateUser(u.id, patch).subscribe(this.handle); }
  rename(u: User) {
    const username = prompt(`New username for ${u.username} (min 3 chars)`, u.username)?.trim();
    if (username && username !== u.username) this.api.updateUser(u.id, { username }).subscribe(this.handle);
  }
  resetPw(u: User) {
    const password = prompt(`New password for ${u.username} (min 8 chars)`);
    if (password) this.api.updateUser(u.id, { password }).subscribe(this.handle);
  }
  remove(u: User) { if (confirm(`Remove ${u.username} from this organisation? The account is deleted if it belongs to no other organisation.`)) this.api.deleteUser(u.id).subscribe(this.handle); }
}
