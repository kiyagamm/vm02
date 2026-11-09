import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Auth } from './api';
import { AuditComponent } from './audit.component';
import { ClientDetailComponent } from './client-detail.component';
import { DashboardComponent } from './dashboard.component';
import { LoginComponent } from './login.component';
import { OrganizationsComponent } from './organizations.component';
import { SettingsComponent } from './settings.component';
import { SnippetsComponent } from './snippets.component';
import { UsersComponent } from './users.component';

const loggedIn: CanActivateFn = () => inject(Auth).user() ? true : inject(Router).parseUrl('/login');
const adminOnly: CanActivateFn = () => inject(Auth).isAdmin() ? true : inject(Router).parseUrl('/');
const writerOnly: CanActivateFn = () => inject(Auth).canWrite() ? true : inject(Router).parseUrl('/');
const superOnly: CanActivateFn = () => inject(Auth).isSuper() ? true : inject(Router).parseUrl('/');

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: DashboardComponent, canActivate: [loggedIn] },
  { path: 'clients/:id', component: ClientDetailComponent, canActivate: [loggedIn] },
  { path: 'audit', component: AuditComponent, canActivate: [loggedIn, adminOnly] },
  { path: 'users', component: UsersComponent, canActivate: [loggedIn, adminOnly] },
  { path: 'settings', component: SettingsComponent, canActivate: [loggedIn] },
  { path: 'snippets', component: SnippetsComponent, canActivate: [loggedIn, writerOnly] },
  { path: 'organizations', component: OrganizationsComponent, canActivate: [loggedIn, superOnly] },
  { path: '**', redirectTo: '' },
];
