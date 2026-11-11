import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  it('shows only nonzero device types and VM counts for each client', async () => {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/clients').flush([
      { id: 'empty', name: 'Empty', deviceCount: 0, vmCount: 0, deviceTypeCounts: [] },
      {
        id: 'mixed', name: 'Mixed', deviceCount: 7, vmCount: 2,
        deviceTypeCounts: [
          { type: 'switch', count: 4 }, { type: 'router', count: 1 },
          { type: 'firewall', count: 2 }, { type: 'server', count: 0 },
        ],
      },
      { id: 'other', name: 'Other', deviceCount: 1, vmCount: 0, deviceTypeCounts: [{ type: 'other', count: 1 }] },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.grid .card') as NodeListOf<HTMLElement>;
    expect(cards[0].textContent).toContain('0 devices');
    expect(cards[0].textContent).not.toContain('VMs');
    expect(cards[1].textContent).toContain('7 devices');
    expect(cards[1].textContent).toContain('4 switches');
    expect(cards[1].textContent).toContain('1 router');
    expect(cards[1].textContent).toContain('2 firewalls');
    expect(cards[1].textContent).toContain('2 VMs');
    expect(cards[1].textContent).not.toContain('server');
    expect(cards[2].textContent).toContain('1 other device');
    expect(cards[2].textContent).not.toContain('VMs');
  });
});
