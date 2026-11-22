import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Auth } from './api';
import { LoginComponent } from './login.component';

const loggedIn: CanActivateFn = () => {
  const a = inject(Auth);
  return !a.user() ? inject(Router).parseUrl('/login') : a.isPlatform() ? inject(Router).parseUrl('/platform') : true;
};
const platformOnly: CanActivateFn = () => inject(Auth).isPlatform() ? true : inject(Router).parseUrl(inject(Auth).user() ? '/' : '/login');
const adminOnly: CanActivateFn = () => inject(Auth).isAdmin() ? true : inject(Router).parseUrl('/');
const writerOnly: CanActivateFn = () => inject(Auth).canWrite() ? true : inject(Router).parseUrl('/');
const formsOnly: CanActivateFn = () => inject(Auth).canAccessForms() ? true : inject(Router).parseUrl('/');

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'o/:slug', component: LoginComponent },
  { path: 'signup', loadComponent: () => import('./signup.component').then((m) => m.SignupComponent) },
  { path: '', loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent), canActivate: [loggedIn] },
  { path: 'clients/:id', loadComponent: () => import('./client-detail.component').then((m) => m.ClientDetailComponent), canActivate: [loggedIn, writerOnly] },
  { path: 'audit', loadComponent: () => import('./audit.component').then((m) => m.AuditComponent), canActivate: [loggedIn, adminOnly] },
  { path: 'users', loadComponent: () => import('./users.component').then((m) => m.UsersComponent), canActivate: [loggedIn, adminOnly] },
  { path: 'settings', loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent), canActivate: [loggedIn] },
  { path: 'forms', loadComponent: () => import('./forms.component').then((m) => m.FormsPageComponent), canActivate: [loggedIn, formsOnly] },
  { path: 'forms/asset-movement', loadComponent: () => import('./forms.component').then((m) => m.AssetMovementComponent), canActivate: [loggedIn, formsOnly] },
  { path: 'forms/equipment-entry', loadComponent: () => import('./equipment-entry.component').then((m) => m.EquipmentEntryComponent), canActivate: [loggedIn, formsOnly] },
  { path: 'reports', loadComponent: () => import('./reports.component').then((m) => m.ReportsComponent), canActivate: [loggedIn] },
  { path: 'snippets', loadComponent: () => import('./snippets.component').then((m) => m.SnippetsComponent), canActivate: [loggedIn, writerOnly] },
  { path: 'platform', loadComponent: () => import('./platform.component').then((m) => m.PlatformOverviewComponent), canActivate: [platformOnly] },
  { path: 'platform/organizations', loadComponent: () => import('./organizations.component').then((m) => m.OrganizationsComponent), canActivate: [platformOnly] },
  { path: 'platform/users', loadComponent: () => import('./platform.component').then((m) => m.PlatformUsersComponent), canActivate: [platformOnly] },
  { path: 'platform/settings', loadComponent: () => import('./platform.component').then((m) => m.PlatformSettingsComponent), canActivate: [platformOnly] },
  { path: '**', redirectTo: '' },
];
