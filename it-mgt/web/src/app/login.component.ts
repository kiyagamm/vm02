import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth, BrandingService, OrgRef, PlatformService, errMsg } from './api';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <form class="card form login" (ngSubmit)="submit()">
      @if (plat.settings().logo; as logo) { <img class="login-logo" [src]="logo" alt="Logo" /> }
      <h1>{{ plat.settings().name }}</h1>
      @if (plat.settings().tagline; as t) { <p class="muted tagline">{{ t }}</p> }
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
export class LoginComponent {
  private auth = inject(Auth);
  readonly plat = inject(PlatformService);
  private brand = inject(BrandingService);
  private router = inject(Router);
  username = '';
  password = '';
  orgId = '';
  orgs = signal<OrgRef[]>([]);
  error = signal('');

  submit() {
    this.auth.login(this.username, this.password, this.orgs().length ? this.orgId : undefined).subscribe({
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
