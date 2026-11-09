import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, Auth, Client, errMsg } from './api';

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="row"><h1>Clients</h1>
      @if (auth.canWrite()) { <button (click)="form.set({ name: '' })">+ Add client</button> }
    </div>
    @if (error()) { <div class="error">{{ error() }}</div> }
    @if (form(); as f) {
      <form class="card form" (ngSubmit)="save()">
        <label>Name <input name="n" [(ngModel)]="f.name" required /></label>
        <label>Contact <input name="c" [(ngModel)]="f.contact" /></label>
        <label>Notes <input name="no" [(ngModel)]="f.notes" /></label>
        <div><button>Save</button> <button type="button" (click)="form.set(null)">Cancel</button></div>
      </form>
    }
    <div class="grid">
      @for (c of clients(); track c.id) {
        <div class="card">
          <h2><a [routerLink]="['/clients', c.id]">{{ c.name }}</a></h2>
          <p class="muted">{{ c.contact }}</p>
          <p>{{ c.deviceCount ?? 0 }} devices</p>
          <p class="muted">{{ c.notes }}</p>
          @if (auth.canWrite()) { <button class="sm" (click)="form.set({ ...c })">Edit</button> }
          @if (auth.isAdmin()) { <button class="sm danger" (click)="remove(c)">Delete</button> }
        </div>
      } @empty { <p class="muted">No clients yet.</p> }
    </div>`,
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(Auth);
  private api = inject(Api);
  clients = signal<Client[]>([]);
  form = signal<Partial<Client> | null>(null);
  error = signal('');

  ngOnInit() { this.load(); }
  load() { this.api.clients().subscribe({ next: (c) => this.clients.set(c), error: (e) => this.error.set(errMsg(e)) }); }

  save() {
    this.api.saveClient(this.form()!).subscribe({
      next: () => { this.form.set(null); this.error.set(''); this.load(); },
      error: (e) => this.error.set(errMsg(e)),
    });
  }
  remove(c: Client) {
    if (confirm(`Delete client ${c.name} and all its devices?`)) {
      this.api.deleteClient(c.id).subscribe({ next: () => this.load(), error: (e) => this.error.set(errMsg(e)) });
    }
  }
}
