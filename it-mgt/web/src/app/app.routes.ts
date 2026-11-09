import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Auth } from './api';
import { AuditComponent } from './audit.component';
import { ClientDetailComponent } from './client-detail.component';
import { DashboardComponent } from './dashboard.component';
import { LoginComponent } from './login.component';
import { OrganizationsComponent } from './organizations.component';
import { PlatformOverviewComponent, PlatformSettingsComponent, PlatformUsersComponent } from './platform.component';
import { SettingsComponent } from './settings.component';
import { SignupComponent } from './signup.component';
import { SnippetsComponent } from './snippets.component';
import { UsersComponent } from './users.component';

const loggedIn: CanActivateFn = () => {
  const a = inject(Auth);
  return !a.user() ? inject(Router).parseUrl('/login') : a.isPlatform() ? inject(Router).parseUrl('/platform') : true;
};
const platformOnly: CanActivateFn = () => inject(Auth).isPlatform() ? true : inject(Router).parseUrl(inject(Auth).user() ? '/' : '/login');
const adminOnly: CanActivateFn = () => inject(Auth).isAdmin() ? true : inject(Router).parseUrl('/');
const writerOnly: CanActivateFn = () => inject(Auth).canWrite() ? true : inject(Router).parseUrl('/');

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'o/:slug', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: '', component: DashboardComponent, canActivate: [loggedIn] },
  { path: 'clients/:id', component: ClientDetailComponent, canActivate: [loggedIn] },
  { path: 'audit', component: AuditComponent, canActivate: [loggedIn, adminOnly] },
  { path: 'users', component: UsersComponent, canActivate: [loggedIn, adminOnly] },
  { path: 'settings', component: SettingsComponent, canActivate: [loggedIn] },
  { path: 'snippets', component: SnippetsComponent, canActivate: [loggedIn, writerOnly] },
  { path: 'platform', component: PlatformOverviewComponent, canActivate: [platformOnly] },
  { path: 'platform/organizations', component: OrganizationsComponent, canActivate: [platformOnly] },
  { path: 'platform/users', component: PlatformUsersComponent, canActivate: [platformOnly] },
  { path: 'platform/settings', component: PlatformSettingsComponent, canActivate: [platformOnly] },
  { path: '**', redirectTo: '' },
];
