import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, Auth, OrgSummary, PlatformOverview, PlatformService, Theme, User, errMsg } from './api';

const MAX_LOGO_BYTES = 500 * 1024;

@Component({
  selector: 'app-platform-overview',
  imports: [RouterLink],
  template: `
    <h1>Platform overview</h1>
    @if (error()) { <div class="error">{{ error() }}</div> }
    @if (o(); as s) {
      <div class="stats">
        <a class="card stat" routerLink="/platform/organizations"><b>{{ s.organizations }}</b><span>Organisations</span></a>
        <a class="card stat" routerLink="/platform/users"><b>{{ s.users }}</b><span>Users</span></a>
        <div class="card stat"><b>{{ s.clients }}</b><span>Clients</span></div>
        <div class="card stat"><b>{{ s.devices }}</b><span>Devices</span></div>
        <a class="card stat" routerLink="/platform/organizations"><b>{{ s.pendingSignups }}</b><span>Pending signups</span></a>
      </div>
    }
    <h2>Organisations</h2>
    <table>
      <thead><tr><th>Name</th><th>Clients</th><th>Users</th></tr></thead>
      <tbody>
        @for (x of orgs(); track x.id) { <tr><td>{{ x.name }}</td><td>{{ x.clientCount }}</td><td>{{ x.userCount }}</td></tr> }
      </tbody>
    </table>`,
})
export class PlatformOverviewComponent implements OnInit {
  private api = inject(Api);
  o = signal<PlatformOverview | null>(null);
  orgs = signal<OrgSummary[]>([]);
  error = signal('');
  ngOnInit() {
    this.api.overview().subscribe({ next: (v) => this.o.set(v), error: (e) => this.error.set(errMsg(e)) });
    this.api.orgs().subscribe((v) => this.orgs.set(v));
  }
}

@Component({
  selector: 'app-platform-users',
  imports: [FormsModule],
  template: `
    <h1>All users</h1>
    <p class="muted">Every account on the platform. Assign users to organisations and grant or revoke super-admin access.</p>
    @if (error()) { <div class="error">{{ error() }}</div> }
    <table>
      <thead><tr><th>Username</th><th>Role</th><th>Organisations</th><th>Super admin</th><th></th></tr></thead>
      <tbody>
        @for (u of users(); track u.id) {
          <tr>
            <td>{{ u.username }} @if (u.id === me()?.id) { <span class="tag">you</span> }</td>
            <td>{{ u.role }}</td>
            <td>
              @if (editing() === u.id) {
                @for (o of allOrgs(); track o.id) {
                  <label class="inline"><input type="checkbox" [checked]="picked().has(o.id)" (change)="toggle(o.id)" /> {{ o.name }}</label>
                }
              } @else { {{ names(u) }} }
            </td>
            <td>{{ u.isSuperAdmin ? 'Yes' : 'No' }}</td>
            <td>
              @if (editing() === u.id) {
                <button class="sm" (click)="save(u)">Save</button> <button class="sm" (click)="editing.set(null)">Cancel</button>
              } @else {
                <button class="sm" (click)="edit(u)">Organisations</button>
                @if (u.id !== me()?.id) {
                  <button class="sm" (click)="toggleSuper(u)">{{ u.isSuperAdmin ? 'Revoke super admin' : 'Make super admin' }}</button>
                }
              }
            </td>
          </tr>
        }
      </tbody>
    </table>`,
})
export class PlatformUsersComponent implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  me = this.auth.user;
  users = signal<User[]>([]);
  allOrgs = signal<OrgSummary[]>([]);
  editing = signal<string | null>(null);
  picked = signal(new Set<string>());
  error = signal('');

  ngOnInit() { this.load(); this.api.orgs().subscribe((o) => this.allOrgs.set(o)); }
  load() { this.api.platformUsers().subscribe({ next: (u) => this.users.set(u), error: (e) => this.error.set(errMsg(e)) }); }
  names(u: User) { return u.organizations?.map((o) => o.name).join(', ') || '—'; }
  edit(u: User) { this.picked.set(new Set((u.organizations ?? []).map((o) => o.id))); this.editing.set(u.id); }
  toggle(id: string) { const s = new Set(this.picked()); s.has(id) ? s.delete(id) : s.add(id); this.picked.set(s); }
  save(u: User) {
    this.api.setPlatformUserOrgs(u.id, [...this.picked()]).subscribe({
      next: () => { this.editing.set(null); this.error.set(''); this.load(); },
      error: (e) => this.error.set(errMsg(e)),
    });
  }
  toggleSuper(u: User) {
    if (!confirm(`${u.isSuperAdmin ? 'Revoke' : 'Grant'} super-admin access for ${u.username}?`)) return;
    this.api.setSuper(u.id, !u.isSuperAdmin).subscribe({ next: () => { this.error.set(''); this.load(); }, error: (e) => this.error.set(errMsg(e)) });
  }
}

@Component({
  selector: 'app-platform-settings',
  imports: [FormsModule],
  template: `
    <h1>Platform settings</h1>
    <p class="muted">Controls the look of the landing, sign-in and signup pages and of this console. Company dashboards keep their own branding.</p>
    <form class="card form" (ngSubmit)="save()">
      @if (msg()) { <div [class]="ok() ? 'ok' : 'error'">{{ msg() }}</div> }
      <label>Platform name <input name="n" [(ngModel)]="name" required maxlength="100" /></label>
      <label>Tagline <input name="t" [(ngModel)]="tagline" maxlength="200" placeholder="Shown under the name on the sign-in page" /></label>
      <label>Accent colour <input name="a" type="color" [(ngModel)]="accent" /></label>
      <label>Default theme
        <select name="th" [(ngModel)]="themeChoice">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label>Logo (PNG, JPEG, WebP or GIF, max 500 KB)
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="pick($event)" />
      </label>
      @if (logo(); as src) { <div class="logo-preview"><img [src]="src" alt="Platform logo preview" /></div> }
      <div class="row">
        <button>Save</button>
        @if (logo()) { <button type="button" (click)="logo.set(null); logoChanged = true">Remove logo</button> }
      </div>
    </form>`,
})
export class PlatformSettingsComponent {
  private plat = inject(PlatformService);
  private theme = inject(Theme);
  private s = this.plat.settings();
  name = this.s.name;
  tagline = this.s.tagline ?? '';
  accent = this.s.accent;
  themeChoice: 'light' | 'dark' = this.s.theme;
  logo = signal<string | null>(this.s.logo);
  logoChanged = false;
  msg = signal('');
  ok = signal(false);

  pick(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (f.size > MAX_LOGO_BYTES) { this.ok.set(false); this.msg.set('Logo is larger than 500 KB.'); return; }
    const r = new FileReader();
    r.onload = () => { this.logo.set(r.result as string); this.logoChanged = true; this.msg.set(''); };
    r.readAsDataURL(f);
  }

  save() {
    const patch: Record<string, unknown> = { name: this.name, tagline: this.tagline, accent: this.accent, theme: this.themeChoice };
    if (this.logoChanged) patch['logo'] = this.logo();
    this.plat.save(patch).subscribe({
      next: () => { this.logoChanged = false; this.theme.set(this.themeChoice); this.ok.set(true); this.msg.set('Saved.'); },
      error: (e) => { this.ok.set(false); this.msg.set(errMsg(e)); },
    });
  }
}
