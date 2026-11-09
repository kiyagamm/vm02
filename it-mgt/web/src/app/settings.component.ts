import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth, BrandingService, Theme, errMsg } from './api';

const MAX_LOGO_BYTES = 500 * 1024;

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <h1>Settings</h1>

    <section class="card">
      <h2>Appearance</h2>
      <label>Theme
        <select [ngModel]="theme.theme()" (ngModelChange)="theme.set($event)">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <p class="muted">Saved in this browser only.</p>
    </section>

    <form class="card form" (ngSubmit)="saveProfile()">
      <h2>My profile</h2>
      @if (profileMsg()) { <div [class]="profileOk() ? 'ok' : 'error'">{{ profileMsg() }}</div> }
      <label>Username <input name="username" [(ngModel)]="profile.username" required minlength="3" autocomplete="username" /></label>
      <label>New password (leave empty to keep) <input name="np" type="password" [(ngModel)]="profile.newPassword" minlength="8" autocomplete="new-password" /></label>
      <label>Current password (required to save) <input name="cp" type="password" [(ngModel)]="profile.currentPassword" required autocomplete="current-password" /></label>
      <div><button>Save profile</button></div>
      <p class="muted">Role: {{ auth.user()?.role }}. Admins can edit other users under Users.</p>
    </form>

    @if (auth.isAdmin()) {
      <form class="card form" (ngSubmit)="saveBranding()">
        <h2>Company branding</h2>
        @if (brandMsg()) { <div [class]="brandOk() ? 'ok' : 'error'">{{ brandMsg() }}</div> }
        <label>Company name <input name="cn" [(ngModel)]="companyName" maxlength="100" /></label>
        <label>Logo (PNG, JPEG, WebP or GIF, max 500 KB)
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" (change)="pickLogo($event)" />
        </label>
        @if (logoPreview(); as src) {
          <div class="logo-preview"><img [src]="src" alt="Company logo preview" /></div>
        }
        <div class="row">
          <button>Save branding</button>
          @if (logoPreview()) { <button type="button" (click)="removeLogo()">Remove logo</button> }
        </div>
      </form>
    }
  `,
})
export class SettingsComponent {
  readonly auth = inject(Auth);
  readonly theme = inject(Theme);
  private brand = inject(BrandingService);

  profile = { username: this.auth.user()?.username ?? '', newPassword: '', currentPassword: '' };
  profileMsg = signal('');
  profileOk = signal(false);

  companyName = this.brand.branding().companyName ?? '';
  logoPreview = signal<string | null>(this.brand.branding().logo);
  logoChanged = false;
  brandMsg = signal('');
  brandOk = signal(false);

  saveProfile() {
    const p = this.profile;
    this.auth.updateMe({
      currentPassword: p.currentPassword,
      username: p.username,
      newPassword: p.newPassword || undefined,
    }).subscribe({
      next: () => {
        this.profile = { username: this.auth.user()?.username ?? '', newPassword: '', currentPassword: '' };
        this.profileOk.set(true); this.profileMsg.set('Profile updated.');
      },
      error: (e) => { this.profileOk.set(false); this.profileMsg.set(errMsg(e)); },
    });
  }

  pickLogo(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      this.brandOk.set(false); this.brandMsg.set('Logo is larger than 500 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { this.logoPreview.set(reader.result as string); this.logoChanged = true; this.brandMsg.set(''); };
    reader.readAsDataURL(file);
  }
  removeLogo() { this.logoPreview.set(null); this.logoChanged = true; }

  saveBranding() {
    const patch: { companyName: string; logo?: string | null } = { companyName: this.companyName };
    if (this.logoChanged) patch.logo = this.logoPreview();
    this.brand.save(patch).subscribe({
      next: () => { this.logoChanged = false; this.brandOk.set(true); this.brandMsg.set('Branding saved.'); },
      error: (e) => { this.brandOk.set(false); this.brandMsg.set(errMsg(e)); },
    });
  }
}
