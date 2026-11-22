import { ValidationPipe } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { EquipmentEntryDto } from './dto';
import { AssetMovement, EquipmentEntry } from './entities';
import { EquipmentEntriesController } from './equipment-entries.controller';
import { EquipmentReportService } from './equipment-report.service';
import { ReportsController } from './reports.controller';

const details = { name: 'Laptop', serialNumber: ' s-1 ', assetTag: '', brand: '', model: '', dateReceived: '2026-11-20', notes: '' };
const ctx = { orgId: 'org-a', userId: 'user', username: 'alex', ip: null };

describe('Equipment entries', () => {
  it('derives delivery from the latest matching movement, including additional items', async () => {
    const repo = { find: jest.fn().mockResolvedValue([
      { id: '1', serialNumber: 'S-1' }, { id: '2', serialNumber: 'S-2' }, { id: '3', serialNumber: 'S-3' },
    ]) };
    const movements = { find: jest.fn().mockResolvedValue([
      { direction: 'inbound', serialNumber: 's-1', additionalAssets: [], destination: 'Office' },
      { direction: 'outbound', serialNumber: '', additionalAssets: [{ serialNumber: ' s-2 ' }], destination: 'Warehouse' },
      { direction: 'outbound', serialNumber: 'S-1', additionalAssets: [], destination: 'Old site' },
    ]) };
    const controller = new EquipmentReportService(repo as unknown as Repository<EquipmentEntry>,
      movements as unknown as Repository<AssetMovement>);
    const result = await controller.list('org-a');
    expect(result.map(({ delivered, deliveredTo }) => ({ delivered, deliveredTo }))).toEqual([
      { delivered: false, deliveredTo: null }, { delivered: true, deliveredTo: 'Warehouse' }, { delivered: false, deliveredTo: null },
    ]);
    expect(movements.find).toHaveBeenCalledWith({ where: { organizationId: 'org-a' }, order: { movementDate: 'DESC', createdAt: 'DESC', id: 'DESC' } });
    expect(repo.find).toHaveBeenCalledWith({ where: { organizationId: 'org-a' }, order: { createdAt: 'DESC' } });
    movements.find.mockResolvedValue([]);
    expect((await controller.list('org-a'))[1].deliveredTo).toBeNull();
  });

  it('normalizes serials, enforces organisation uniqueness and restricts editing', async () => {
    const repo = {
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => ({ ...value, id: 'one' })),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new EquipmentEntriesController(repo as unknown as Repository<EquipmentEntry>,
      {} as EquipmentReportService, audit as unknown as AuditService);
    const entry = await controller.create(details, 'org-a', ctx);
    expect(entry.serialNumber).toBe('S-1');
    expect(repo.create).toHaveBeenCalledWith({ organizationId: 'org-a' });
    const dbError = Object.assign(new Error('duplicate'), { code: '23505', constraint: 'UQ_equipment_org_serial' });
    repo.save.mockRejectedValueOnce(new QueryFailedError('insert', [], dbError));
    await expect(controller.create(details, 'org-a', ctx)).rejects.toThrow('already registered');
    await expect(controller.update('one', details, 'org-b', ctx)).rejects.toThrow();
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'one', organizationId: 'org-b' } });
    expect(Reflect.getMetadata('roles', EquipmentEntriesController)).toEqual(['admin', 'viewer']);
    expect(Reflect.getMetadata('roles', controller.update)).toEqual(['admin']);
    expect(Reflect.getMetadata('roles', controller.remove)).toEqual(['admin']);
  });

  it('validates equipment fields', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: EquipmentEntryDto };
    await expect(pipe.transform(details, metadata)).resolves.toBeInstanceOf(EquipmentEntryDto);
    await expect(pipe.transform({ ...details, serialNumber: '  ' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, dateReceived: '2026-02-30' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, organizationId: 'other' }, metadata)).rejects.toThrow();
  });

  it('scopes equipment reports and omits organisation identifiers', async () => {
    const reports = { list: jest.fn().mockResolvedValue([{ id: 'one', organizationId: 'org-a', name: 'Laptop',
      serialNumber: 'S-1', assetTag: '', brand: '', model: '', dateReceived: '2026-01-01', notes: '',
      createdAt: new Date(), delivered: true, deliveredTo: 'Site' }]) };
    const result = await new ReportsController(reports as unknown as EquipmentReportService).equipmentList('org-a');
    expect(reports.list).toHaveBeenCalledWith('org-a');
    expect(result[0]).toMatchObject({ name: 'Laptop', delivered: true, deliveredTo: 'Site' });
    expect(result[0]).not.toHaveProperty('organizationId');
  });
});
