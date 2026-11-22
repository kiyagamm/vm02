import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Api, Auth, PlatformService, Theme } from './api';
import { App } from './app';
import { routes } from './app.routes';

describe('web', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
  });

  it('creates the app and hides the nav when logged out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('nav')).toBeNull();
  });

  it('derives permissions from the role', () => {
    const auth = TestBed.inject(Auth);
    auth.user.set({ id: '1', username: 'v', role: 'viewer', active: true });
    expect(auth.canWrite()).toBe(false);
    expect(auth.isAdmin()).toBe(false);
    expect(auth.canAccessForms()).toBe(true);
    auth.user.set({ id: '2', username: 'e', role: 'engineer', active: true });
    expect(auth.canWrite()).toBe(true);
    expect(auth.isAdmin()).toBe(false);
    expect(auth.canAccessForms()).toBe(false);
    auth.user.set({ id: '3', username: 'a', role: 'admin', active: true });
    expect(auth.canAccessForms()).toBe(true);
  });

  it('shows the username without the current role in organisation and platform menus', () => {
    const auth = TestBed.inject(Auth);
    auth.user.set({ id: '1', username: 'member', role: 'admin', active: true,
      organization: { id: 'org', name: 'Example' } });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.usermenu .whoami').textContent.trim()).toBe('member · Example ▾');
    expect(fixture.nativeElement.querySelector('.user-avatar').textContent.trim()).toBe('M');
    expect(fixture.nativeElement.querySelector('.user-avatar').getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Audit log');

    auth.user.set({ id: '1', username: 'member', role: 'admin', active: true, platform: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.usermenu .whoami').textContent.trim()).toBe('member ▾');
    expect(fixture.nativeElement.querySelector('.user-avatar').getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps browser theme preferences separate for each user and from the platform default', () => {
    localStorage.setItem('itmgt.theme', 'dark');
    const auth = TestBed.inject(Auth);
    auth.user.set({ id: 'one', username: 'one', role: 'viewer', active: true });
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/settings/platform').flush({ name: 'Platform', tagline: null, logo: null, accent: '#000000', theme: 'light' });
    fixture.detectChanges();
    const theme = TestBed.inject(Theme);
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    theme.set('dark');
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    auth.user.set({ id: 'two', username: 'two', role: 'viewer', active: true });
    fixture.detectChanges();
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    theme.set('light');
    TestBed.inject(PlatformService).save({ theme: 'dark' }).subscribe();
    http.expectOne('/api/settings/platform').flush({ name: 'Platform', tagline: null, logo: null, accent: '#000000', theme: 'dark' });
    fixture.detectChanges();
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    auth.user.set(null);
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    auth.user.set({ id: 'one', username: 'one', role: 'viewer', active: true });
    fixture.detectChanges();
    expect(theme.theme()).toBe('dark');
    auth.user.set({ id: 'two', username: 'two', role: 'viewer', active: true });
    fixture.detectChanges();
    expect(theme.theme()).toBe('light');
  });

  it('opens the mobile menu and closes it after navigating to a lazy-loaded form', async () => {
    TestBed.inject(Auth).user.set({ id: '1', username: 'viewer', role: 'viewer', active: true });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('.nav-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.nav-links.open')).not.toBeNull();
    await TestBed.inject(Router).navigateByUrl('/forms');
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('app-forms')?.textContent).toContain('Equipment entry');
  });

  it('keeps form access restricted after lazy loading', async () => {
    TestBed.inject(Auth).user.set({ id: '1', username: 'engineer', role: 'engineer', active: true });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/forms/asset-movement');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('blocks viewer access to client details and search', async () => {
    TestBed.inject(Auth).user.set({ id: '1', username: 'viewer', role: 'viewer', active: true });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.topbar .search')).toBeNull();
    await TestBed.inject(Router).navigateByUrl('/clients/one');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('sends only allowed fields on update and nulls empty strings', () => {
    const api = TestBed.inject(Api);
    const http = TestBed.inject(HttpTestingController);
    api.saveClient({ id: 'abc', name: 'NCIC', contact: '', deviceCount: 3 }).subscribe();
    const req = http.expectOne('/api/clients/abc');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'NCIC', contact: null });
  });
});
