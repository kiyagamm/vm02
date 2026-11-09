import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject, switchMap, of } from 'rxjs';
import { Api, Auth, BrandingService, PlatformService, SearchHit, Theme } from './api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    @if (auth.user(); as u) {
      @if (u.platform) {
        <div class="layout">
          <nav class="sidebar platform">
            <a routerLink="/platform" class="brand">
              @if (plat.settings().logo; as logo) { <img class="brand-logo" [src]="logo" alt="" /> }
              {{ plat.settings().name }}
            </a>
            <a routerLink="/platform" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Overview</a>
            <a routerLink="/platform/organizations" routerLinkActive="active">Organisations</a>
            <a routerLink="/platform/users" routerLinkActive="active">Users</a>
            <span class="spacer"></span>
            <a routerLink="/platform/settings" routerLinkActive="active">⚙ Platform settings</a>
          </nav>
          <div class="content">
            <header class="topbar no-print">
              <span class="whoami"><b>Platform console</b></span>
              <div class="usermenu" tabindex="0">
                <span class="whoami">{{ u.username }} (super admin) ▾</span>
                <div class="usermenu-pop">
                  <button type="button" (click)="auth.logout()">Logout</button>
                </div>
              </div>
            </header>
            <main><router-outlet /></main>
          </div>
        </div>
      } @else {
      <div class="layout">
      <nav class="sidebar">
        <a routerLink="/" class="brand">
          @if (brand.branding().logo; as logo) { <img class="brand-logo" [src]="logo" alt="" /> }
          {{ brand.branding().companyName || 'IT Management' }}
        </a>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Clients</a>
        @if (auth.canWrite()) { <a routerLink="/snippets" routerLinkActive="active">Config snippets</a> }
        @if (u.role === 'admin') {
          <a routerLink="/audit" routerLinkActive="active">Audit log</a>
          <a routerLink="/users" routerLinkActive="active">Users</a>
        }
        <span class="spacer"></span>
        <a routerLink="/settings" routerLinkActive="active">⚙ Settings</a>
      </nav>
      <div class="content">
        <header class="topbar no-print">
          <div class="search">
            @if (searchOpen()) {
              <input #si placeholder="Search clients, devices, VMs…" [ngModel]="q" (ngModelChange)="onQuery($event)" (keydown.escape)="closeSearch()" />
            }
            <button class="icon-btn" type="button" title="Search" (click)="toggleSearch()">🔍</button>
            @if (searchOpen() && hits().length) {
              <ul>
                @for (h of hits(); track h.type + h.id) {
                  <li (click)="go(h)"><span class="tag">{{ h.type }}</span> {{ h.name }} <small class="muted">{{ h.detail }}</small></li>
                }
              </ul>
            }
          </div>
          <div class="usermenu" tabindex="0">
            <span class="whoami">{{ u.username }} ({{ u.role }}) · {{ u.organization?.name }} ▾</span>
            <div class="usermenu-pop">
              @for (o of otherOrgs(); track o.id) {
                <button type="button" (click)="switchOrg(o.id)">Switch to {{ o.name }}</button>
              }
              @if (auth.isSuper()) {
                <button type="button" (click)="goPlatform()">Platform console</button>
              }
              <button type="button" (click)="auth.logout()">Logout</button>
            </div>
          </div>
        </header>
        <main><router-outlet /></main>
      </div>
      </div>
      }
    } @else {
      <main><router-outlet /></main>
    }`,
})
export class App {
  readonly auth = inject(Auth);
  readonly brand = inject(BrandingService);
  readonly plat = inject(PlatformService);
  private theme = inject(Theme);
  private api = inject(Api);
  private router = inject(Router);
  hits = signal<SearchHit[]>([]);
  q = '';
  searchOpen = signal(false);
  private query$ = new Subject<string>();

  constructor() {
    this.brand.load();
    this.plat.load();
    this.query$.pipe(
      debounceTime(250), distinctUntilChanged(),
      switchMap((q) => (q.trim().length >= 2 ? this.api.search(q) : of([] as SearchHit[]))),
    ).subscribe((h) => this.hits.set(h));
  }

  onQuery(v: string) { this.q = v; this.query$.next(v); }
  otherOrgs() {
    const u = this.auth.user();
    return (u?.organizations ?? []).filter((o) => o.id !== u?.organization?.id);
  }
  switchOrg(id: string) {
    this.auth.switchOrg(id).subscribe(() => { location.assign('/'); });
  }
  goPlatform() { this.auth.platform().subscribe(() => location.assign('/platform')); }
  toggleSearch() { this.searchOpen() ? this.closeSearch() : this.searchOpen.set(true); }
  closeSearch() { this.searchOpen.set(false); this.hits.set([]); this.q = ''; this.query$.next(''); }
  go(h: SearchHit) {
    this.closeSearch();
    this.router.navigate(['/clients', h.clientId]);
  }
}
