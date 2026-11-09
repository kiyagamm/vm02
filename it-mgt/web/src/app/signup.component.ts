import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, PlatformService, errMsg } from './api';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  template: `
    <form class="card form login" (ngSubmit)="submit()">
      @if (plat.settings().logo; as logo) { <img class="login-logo" [src]="logo" alt="Logo" /> }
      <h1>{{ plat.settings().name }}</h1>
      <p class="muted tagline">Create an account</p>
      @if (done()) {
        <div class="success">Request sent. A super admin must approve it before you can sign in.</div>
        <a routerLink="/login">Back to sign in</a>
      } @else {
        @if (error()) { <div class="error">{{ error() }}</div> }
        <label>I want to
          <select name="t" [(ngModel)]="type">
            <option value="new-org">Register my organisation</option>
            <option value="join">Join an existing organisation</option>
          </select>
        </label>
        <label>{{ type === 'new-org' ? 'Organisation name' : 'Name of the organisation to join' }}
          <input name="o" [(ngModel)]="organizationName" required maxlength="100" />
        </label>
        <label>Username <input name="u" [(ngModel)]="username" autocomplete="username" required minlength="3" /></label>
        <label>Password (min 8 characters) <input name="p" type="password" [(ngModel)]="password" autocomplete="new-password" required minlength="8" /></label>
        <button>Request access</button>
        <a routerLink="/login">Already have an account? Sign in</a>
      }
    </form>`,
})
export class SignupComponent {
  private api = inject(Api);
  readonly plat = inject(PlatformService);
  type: 'new-org' | 'join' = 'new-org';
  organizationName = '';
  username = '';
  password = '';
  done = signal(false);
  error = signal('');

  submit() {
    this.api.signup({ type: this.type, organizationName: this.organizationName, username: this.username, password: this.password })
      .subscribe({ next: () => this.done.set(true), error: (e) => this.error.set(errMsg(e)) });
  }
}
