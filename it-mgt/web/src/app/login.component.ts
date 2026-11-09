import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, Auth, BrandingService, OrgPublic, OrgRef, PlatformService, errMsg } from './api';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <form class="card form login" (ngSubmit)="submit()">
      @if (org(); as o) {
        @if (o.logo) { <img class="login-logo" [src]="o.logo" alt="Logo" /> }
        <h1>{{ o.name }}</h1>
        <p class="muted tagline">Sign in to your {{ o.name }} workspace</p>
      } @else if (slug && notFound()) {
        <h1>{{ plat.settings().name }}</h1>
        <div class="error">Organisation not found</div>
      } @else {
        @if (plat.settings().logo; as logo) { <img class="login-logo" [src]="logo" alt="Logo" /> }
        <h1>{{ plat.settings().name }}</h1>
        @if (plat.settings().tagline; as t) { <p class="muted tagline">{{ t }}</p> }
      }
      @if (error()) { <div class="error">{{ error() }}</div> }
      <label>Username <input name="u" [(ngModel)]="username" autocomplete="username" required /></label>
      <label>Password <input name="p" type="password" [(ngModel)]="password" autocomplete="current-password" required /></label>
      @if (orgs().length) {
        <label>Organisation
          <select name="o" [(ngModel)]="orgId" required>
            @for (o of orgs(); track o.id) { <option [value]="o.id">{{ o.name }}</option> }
          </select>
        </label>
      }
      <button>{{ orgs().length ? 'Continue' : 'Sign in' }}</button>
      <a routerLink="/signup">Create an account</a>
    </form>`,
})
export class LoginComponent implements OnInit {
  private auth = inject(Auth);
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  readonly plat = inject(PlatformService);
  private brand = inject(BrandingService);
  private router = inject(Router);
  username = '';
  password = '';
  orgId = '';
  orgs = signal<OrgRef[]>([]);
  error = signal('');
  org = signal<OrgPublic | null>(null);
  notFound = signal(false);
  slug = '';

  ngOnInit() {
    const host = location.hostname;
    const labels = host.split('.');
    const sub = labels.length >= 3 && !/^\d+$/.test(labels[labels.length - 1]) && labels[0] !== 'www' ? labels[0] : '';
    this.slug = this.route.snapshot.paramMap.get('slug') ?? sub;
    if (this.slug) this.api.orgBySlug(this.slug).subscribe({ next: (o) => this.org.set(o), error: () => this.notFound.set(true) });
  }

  submit() {
    const pinned = this.org()?.id;
    this.auth.login(this.username, this.password, pinned ?? (this.orgs().length ? this.orgId : undefined)).subscribe({
      next: (r) => {
        if (r.token) { this.brand.load(); this.router.navigateByUrl('/'); return; }
        this.orgs.set(r.organizations ?? []);
        this.orgId = this.orgs()[0]?.id ?? '';
        this.error.set('');
      },
      error: (e) => { this.orgs.set([]); this.error.set(errMsg(e)); },
    });
  }
}
