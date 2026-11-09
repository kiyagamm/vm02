import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject, switchMap, of } from 'rxjs';
import { Api, Auth, BrandingService, SearchHit, Theme } from './api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    @if (auth.user(); as u) {
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
            <span class="whoami">{{ u.username }} ({{ u.role }}) ▾</span>
            <div class="usermenu-pop"><button type="button" (click)="auth.logout()">Logout</button></div>
          </div>
        </header>
        <main><router-outlet /></main>
      </div>
      </div>
    } @else {
      <main><router-outlet /></main>
    }`,
})
export class App {
  readonly auth = inject(Auth);
  readonly brand = inject(BrandingService);
  private theme = inject(Theme);
  private api = inject(Api);
  private router = inject(Router);
  hits = signal<SearchHit[]>([]);
  q = '';
  searchOpen = signal(false);
  private query$ = new Subject<string>();

  constructor() {
    this.brand.load();
    this.query$.pipe(
      debounceTime(250), distinctUntilChanged(),
      switchMap((q) => (q.trim().length >= 2 ? this.api.search(q) : of([] as SearchHit[]))),
    ).subscribe((h) => this.hits.set(h));
  }

  onQuery(v: string) { this.q = v; this.query$.next(v); }
  toggleSearch() { this.searchOpen() ? this.closeSearch() : this.searchOpen.set(true); }
  closeSearch() { this.searchOpen.set(false); this.hits.set([]); this.q = ''; this.query$.next(''); }
  go(h: SearchHit) {
    this.closeSearch();
    this.router.navigate(['/clients', h.clientId]);
  }
}
