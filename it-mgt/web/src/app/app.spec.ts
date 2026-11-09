import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Api, Auth } from './api';
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
    auth.user.set({ id: '2', username: 'e', role: 'engineer', active: true });
    expect(auth.canWrite()).toBe(true);
    expect(auth.isAdmin()).toBe(false);
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
