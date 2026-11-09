import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, BrandingService, errMsg } from './api';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <form class="card form login" (ngSubmit)="submit()">
      @if (brand.branding().logo; as logo) { <img class="login-logo" [src]="logo" alt="Company logo" /> }
      <h1>{{ brand.branding().companyName || 'IT Management' }}</h1>
      @if (error()) { <div class="error">{{ error() }}</div> }
      <label>Username <input name="u" [(ngModel)]="username" autocomplete="username" required /></label>
      <label>Password <input name="p" type="password" [(ngModel)]="password" autocomplete="current-password" required /></label>
      <button>Sign in</button>
    </form>`,
})
export class LoginComponent {
  private auth = inject(Auth);
  readonly brand = inject(BrandingService);
  private router = inject(Router);
  username = '';
  password = '';
  error = signal('');

  submit() {
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (e) => this.error.set(errMsg(e)),
    });
  }
}
