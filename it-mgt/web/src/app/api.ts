import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

export type Role = 'admin' | 'engineer' | 'viewer';
export const DEVICE_TYPES = ['server', 'hypervisor', 'switch', 'router', 'firewall', 'other'];
export const CREDENTIAL_TYPES = ['ssh', 'rdp', 'web', 'snmp', 'database', 'other'];

export interface OrgRef { id: string; name: string }
export interface User {
  id: string; username: string; role: Role; active: boolean; isSuperAdmin?: boolean;
  organization?: OrgRef; organizations?: OrgRef[];
}
export interface OrgSummary extends OrgRef { clientCount: number; userCount: number }
export interface Client { id: string; name: string; contact?: string; notes?: string; deviceCount?: number; devices?: Device[] }
export interface Device {
  id: string; clientId: string; name: string; type: string; host?: string; port?: number; os?: string;
  platform?: string; brand?: string; model?: string; location?: string; deploymentDate?: string | null; notes?: string; metadata: Record<string, unknown>; vms?: Vm[];
}
export interface Vm {
  id: string; deviceId: string; name: string; ip?: string; os?: string; cpu?: number; ramMb?: number;
  diskGb?: number; status: string; purpose?: string; metadata: Record<string, unknown>;
}
export interface Credential { id: string; deviceId?: string; vmId?: string; username: string; password: string; type: string; notes?: string }
export interface AuditEntry { id: string; username: string; action: string; entity: string; entityId?: string; details?: string; ip?: string; timestamp: string }
export interface SearchHit { type: string; id: string; name: string; clientId: string; detail?: string }
export interface ExecResult { target: string; stdout: string; stderr: string; exitCode: number | null }
export interface Snippet {
  id: string; clientId: string; deviceId: string; name: string; content: string; updatedAt: string;
  client?: Client; device?: Device;
}

const TOKEN_KEY = 'itmgt.token';
const USER_KEY = 'itmgt.user';

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);
  readonly user = signal<User | null>(JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'));
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  readonly isSuper = computed(() => !!this.user()?.isSuperAdmin);
  readonly canWrite = computed(() => ['admin', 'engineer'].includes(this.user()?.role ?? ''));

  get token() { return localStorage.getItem(TOKEN_KEY); }

  /** Resolves with `organizations` when the user must pick one, otherwise signs in. */
  login(username: string, password: string, organizationId?: string) {
    return this.http.post<{ token?: string; user?: User; organizations?: OrgRef[] }>('/api/auth/login', { username, password, ...(organizationId ? { organizationId } : {}) }).pipe(
      tap((r) => { if (r.token && r.user) this.store(r.token, r.user); }),
    );
  }

  switchOrg(organizationId: string) {
    return this.http.post<{ token: string; user: User }>('/api/auth/switch', { organizationId }).pipe(tap((r) => this.store(r.token, r.user)));
  }

  private store(token: string, user: User) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.user.set(user);
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.router.navigateByUrl('/login');
  }

  updateMe(body: { currentPassword: string; username?: string; newPassword?: string }) {
    return this.http.put<User>('/api/auth/me', body).pipe(
      tap((u) => {
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        this.user.set(u);
      }),
    );
  }
}

export interface Branding { logo: string | null; companyName: string | null }

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private http = inject(HttpClient);
  readonly branding = signal<Branding>({ logo: null, companyName: null });

  load() { this.http.get<Branding>('/api/settings/branding').subscribe({ next: (b) => this.branding.set(b), error: () => {} }); }
  save(patch: Partial<Branding>) {
    return this.http.put<Branding>('/api/settings/branding', patch).pipe(tap((b) => this.branding.set(b)));
  }
}

export type ThemeName = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class Theme {
  readonly theme = signal<ThemeName>(localStorage.getItem('itmgt.theme') === 'dark' ? 'dark' : 'light');

  constructor() { this.apply(); }
  set(t: ThemeName) {
    this.theme.set(t);
    localStorage.setItem('itmgt.theme', t);
    this.apply();
  }
  private apply() { document.documentElement.setAttribute('data-theme', this.theme()); }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const token = auth.token;
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    tap({ error: (e) => { if (e.status === 401 && !req.url.endsWith('/auth/login')) auth.logout(); } }),
  );
};

export function errMsg(e: any): string {
  const m = e?.error?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? e?.message ?? 'Request failed');
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  clients = () => this.http.get<Client[]>('/api/clients');
  client = (id: string) => this.http.get<Client>(`/api/clients/${id}`);
  saveClient = (c: Partial<Client>) => c.id ? this.http.put<Client>(`/api/clients/${c.id}`, pick(c, ['name', 'contact', 'notes'])) : this.http.post<Client>('/api/clients', pick(c, Object.keys(c)));
  deleteClient = (id: string) => this.http.delete(`/api/clients/${id}`);

  saveDevice = (d: Partial<Device>) => d.id
    ? this.http.put<Device>(`/api/devices/${d.id}`, pick(d, ['name', 'type', 'host', 'port', 'os', 'platform', 'brand', 'model', 'location', 'deploymentDate', 'notes', 'metadata']))
    : this.http.post<Device>('/api/devices', pick(d, Object.keys(d)));
  deleteDevice = (id: string) => this.http.delete(`/api/devices/${id}`);
  devices = (clientId: string) => this.http.get<Device[]>('/api/devices', { params: { clientId } });

  snippets = () => this.http.get<Snippet[]>('/api/snippets');
  saveSnippet = (s: Partial<Snippet>) => s.id
    ? this.http.put<Snippet>(`/api/snippets/${s.id}`, pick(s, ['deviceId', 'name', 'content']))
    : this.http.post<Snippet>('/api/snippets', pick(s, ['clientId', 'deviceId', 'name', 'content']));
  deleteSnippet = (id: string) => this.http.delete(`/api/snippets/${id}`);

  saveVm = (v: Partial<Vm>) => v.id
    ? this.http.put<Vm>(`/api/vms/${v.id}`, pick(v, ['name', 'ip', 'os', 'cpu', 'ramMb', 'diskGb', 'status', 'purpose', 'metadata']))
    : this.http.post<Vm>('/api/vms', pick(v, Object.keys(v)));
  deleteVm = (id: string) => this.http.delete(`/api/vms/${id}`);

  credentials = (target: { deviceId?: string; vmId?: string }) =>
    this.http.get<Credential[]>('/api/credentials', { params: target as Record<string, string> });
  saveCredential = (c: Partial<Credential>) => c.id
    ? this.http.put<Credential>(`/api/credentials/${c.id}`, pick(c, ['username', 'password', 'type', 'notes']))
    : this.http.post<Credential>('/api/credentials', pick(c, Object.keys(c)));
  deleteCredential = (id: string) => this.http.delete(`/api/credentials/${id}`);
  reveal = (id: string): Observable<{ password: string }> => this.http.post<{ password: string }>(`/api/credentials/${id}/reveal`, {});
  exec = (credentialId: string, command: string) => this.http.post<ExecResult>('/api/exec', { credentialId, command });

  audit = (action: string, offset: number, limit: number) =>
    this.http.get<{ items: AuditEntry[]; total: number }>('/api/audit', { params: { action, offset, limit } as any });
  search = (q: string) => this.http.get<SearchHit[]>('/api/search', { params: { q } });

  users = () => this.http.get<User[]>('/api/users');
  createUser = (u: { username: string; password: string; role: string }) => this.http.post<User>('/api/users', u);
  updateUser = (id: string, u: Partial<User> & { password?: string }) => this.http.put<User>(`/api/users/${id}`, u);
  deleteUser = (id: string) => this.http.delete(`/api/users/${id}`);
  setUserOrgs = (id: string, organizationIds: string[]) => this.http.put<User>(`/api/users/${id}/organizations`, { organizationIds });

  orgs = () => this.http.get<OrgSummary[]>('/api/organizations');
  createOrg = (name: string) => this.http.post<OrgRef>('/api/organizations', { name });
  renameOrg = (id: string, name: string) => this.http.put<OrgRef>(`/api/organizations/${id}`, { name });
  deleteOrg = (id: string) => this.http.delete(`/api/organizations/${id}`);
}

/** Copy only the allowed fields; empty strings become null so fields can be cleared. */
function pick<T extends object>(o: T, keys: string[]): Partial<T> {
  const out: any = {};
  for (const k of keys) {
    const v = (o as any)[k];
    if (v !== undefined) out[k] = v === '' ? null : v;
  }
  return out;
}
