import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Api } from './api';
import { ClientDetailComponent } from './client-detail.component';

describe('device configuration upload', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [ClientDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  }));

  it('keeps the saved device id after upload failure so retry does not create another device', () => {
    const fixture = TestBed.createComponent(ClientDetailComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(Api);
    const save = vi.spyOn(api, 'saveDevice').mockReturnValue(of({ id: 'device', clientId: 'client', name: 'Device', type: 'server', metadata: {} }));
    const upload = vi.spyOn(api, 'uploadDeviceConfigFile')
      .mockReturnValueOnce(throwError(() => new Error('upload failed')))
      .mockReturnValueOnce(of({ id: 'file', deviceId: 'device', name: 'config.bin', size: 1, createdAt: '' }));
    vi.spyOn(component, 'load').mockImplementation(() => {});
    component.deviceForm.set({ clientId: 'client', name: 'Device', type: 'server' });
    component.configFile = new File(['x'], 'config.bin');
    component.saveDevice();
    expect(component.deviceForm()?.id).toBe('device');
    expect(component.error()).toContain('Device saved, but configuration upload failed');
    component.saveDevice();
    expect(save.mock.calls[1][0].id).toBe('device');
    expect(upload).toHaveBeenCalledTimes(2);
    expect(component.deviceForm()).toBeNull();
  });

  it('prevents saving if the selected file exceeds 25 MiB', () => {
    const component = TestBed.createComponent(ClientDetailComponent).componentInstance;
    const save = vi.spyOn(TestBed.inject(Api), 'saveDevice');
    component.deviceForm.set({ clientId: 'client', name: 'Device', type: 'server' });
    const file = new File([], 'large.bin');
    Object.defineProperty(file, 'size', { value: 25 * 1024 * 1024 + 1 });
    component.selectConfigFile({ target: { files: [file] } } as unknown as Event);
    component.saveDevice();
    expect(save).not.toHaveBeenCalled();
    expect(component.error()).toContain('25 MB');
  });
});
