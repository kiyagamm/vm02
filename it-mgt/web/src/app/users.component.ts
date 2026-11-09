import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Auth, User, errMsg } from './api';

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
      <thead><tr><th>Username</th><th>Role</th><th>Active</th><th></th></tr></thead>
      <tbody>
        @for (u of users(); track u.id) {
          <tr>
            <td>{{ u.username }}</td>
            <td><select [ngModel]="u.role" (ngModelChange)="update(u, { role: $event })" [disabled]="u.id === me()?.id">
              @for (r of roles; track r) { <option>{{ r }}</option> }</select></td>
            <td><input type="checkbox" [ngModel]="u.active" (ngModelChange)="update(u, { active: $event })" [disabled]="u.id === me()?.id" /></td>
            <td>
              <button class="sm" (click)="rename(u)">Rename</button>
              <button class="sm" (click)="resetPw(u)">Reset password</button>
              <button class="sm danger" [disabled]="u.id === me()?.id" (click)="remove(u)">Delete</button>
            </td>
          </tr>
        }
      </tbody>
    </table>`,
})
export class UsersComponent implements OnInit {
  private api = inject(Api);
  readonly me = inject(Auth).user;
  readonly roles = ['admin', 'engineer', 'viewer'];
  users = signal<User[]>([]);
  error = signal('');
  nu = { username: '', password: '', role: 'viewer' };

  ngOnInit() { this.load(); }
  load() { this.api.users().subscribe({ next: (u) => this.users.set(u), error: (e) => this.error.set(errMsg(e)) }); }
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
  remove(u: User) { if (confirm(`Delete user ${u.username}?`)) this.api.deleteUser(u.id).subscribe(this.handle); }
}
