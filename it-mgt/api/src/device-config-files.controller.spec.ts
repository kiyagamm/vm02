import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { DeviceConfigFilesController } from './device-config-files.controller';
import { Device, DeviceConfigFile } from './entities';

describe('DeviceConfigFilesController', () => {
  const ctx = { userId: 'u', username: 'engineer', ip: null, orgId: 'org' };
  const devices = { exist: jest.fn() };
  const files = { create: jest.fn(), save: jest.fn(), find: jest.fn(), createQueryBuilder: jest.fn() };
  const audit = { log: jest.fn() };
  const controller = new DeviceConfigFilesController(
    devices as unknown as Repository<Device>,
    files as unknown as Repository<DeviceConfigFile>,
    audit as unknown as AuditService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    devices.exist.mockResolvedValue(true);
    files.create.mockImplementation((value) => value);
    files.save.mockImplementation(async (value) => ({ ...value, id: 'file', createdAt: new Date(0) }));
    audit.log.mockResolvedValue(undefined);
  });

  it('stores the binary content without returning it and scopes the device to the organisation', async () => {
    const buffer = Buffer.from([0, 255, 17]);
    const result = await controller.upload('device', 'org', ctx, { originalname: 'config.bin', size: buffer.length, buffer });
    expect(devices.exist).toHaveBeenCalledWith({ where: { id: 'device', client: { organizationId: 'org' } } });
    expect(files.save).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'device', content: buffer }));
    expect(result).toEqual({ id: 'file', deviceId: 'device', name: 'config.bin', size: 3, createdAt: new Date(0) });
  });

  it('rejects inaccessible devices and invalid files without saving', async () => {
    devices.exist.mockResolvedValueOnce(false);
    await expect(controller.upload('other', 'org', ctx, { originalname: 'config', size: 1, buffer: Buffer.from([1]) })).rejects.toThrow(NotFoundException);
    await expect(controller.upload('device', 'org', ctx)).rejects.toThrow(BadRequestException);
    await expect(controller.upload('device', 'org', ctx, { originalname: 'large', size: 25 * 1024 * 1024 + 1, buffer: Buffer.alloc(0) })).rejects.toThrow(BadRequestException);
    expect(files.save).not.toHaveBeenCalled();
  });

  it('limits file access to admins and engineers', () => {
    expect(Reflect.getMetadata('roles', DeviceConfigFilesController)).toEqual(['admin', 'engineer']);
  });

  it('downloads the exact bytes only when the file belongs to the requested device', async () => {
    const content = Buffer.from([0, 255, 17]);
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'file', name: 'config.bin', content }),
    };
    files.createQueryBuilder.mockReturnValue(query);
    const res = {
      setHeader: jest.fn(), attachment: jest.fn(),
      type: jest.fn().mockReturnThis(), send: jest.fn(),
    };
    await controller.download('device', 'file', 'org', ctx, res as unknown as Response);
    expect(query.where).toHaveBeenCalledWith('file.id = :fileId AND file.deviceId = :deviceId', { fileId: 'file', deviceId: 'device' });
    expect(res.attachment).toHaveBeenCalledWith('config.bin');
    expect(res.send).toHaveBeenCalledWith(content);
    query.getOne.mockResolvedValue(null);
    await expect(controller.download('device', 'other', 'org', ctx, res as unknown as Response)).rejects.toThrow(NotFoundException);
  });
});
