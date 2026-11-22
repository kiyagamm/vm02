import { ValidationPipe } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AssetMovementsController } from './asset-movements.controller';
import { AuditService } from './audit.service';
import { CreateAssetMovementDto } from './dto';
import { AssetMovement } from './entities';

const details = {
  assetName: 'Laptop', assetTag: 'A-1', serialNumber: 'S-1', moverName: 'Alex',
  moverContact: '', origin: 'Office', destination: 'Warehouse', movementDate: '2026-11-20', notes: '',
};

describe('AssetMovementsController', () => {
  it('scopes reads and writes to the authenticated organisation', async () => {
    const repo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'movement' })),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new AssetMovementsController(repo as unknown as Repository<AssetMovement>, audit as unknown as AuditService);
    const ctx = { orgId: 'org-a', userId: 'user', username: 'alex', ip: null };
    await controller.list('org-a');
    expect(repo.find).toHaveBeenCalledWith({ where: { organizationId: 'org-a' }, order: { createdAt: 'DESC' } });
    await controller.create(details, 'org-a', ctx);
    expect(repo.create).toHaveBeenCalledWith({ ...details, organizationId: 'org-a' });
    expect(audit.log).toHaveBeenCalledWith(ctx, 'create', 'asset-movement', 'movement', 'Laptop');
    expect(Reflect.getMetadata('roles', AssetMovementsController)).toEqual(['admin', 'viewer']);
    expect(Reflect.getMetadata('roles', controller.update)).toEqual(['admin']);
    expect(Reflect.getMetadata('roles', controller.remove)).toEqual(['admin']);
  });

  it('rejects whitespace-only required fields, invalid dates and a supplied organisation', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: CreateAssetMovementDto };
    await expect(pipe.transform(details, metadata)).resolves.toBeInstanceOf(CreateAssetMovementDto);
    await expect(pipe.transform({ ...details, destination: '   ' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, movementDate: '2026-02-30' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, direction: null }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, organizationId: 'org-b' }, metadata)).rejects.toThrow();
  });

  it('only edits and deletes movement forms within the current organisation', async () => {
    const movement = { ...details, id: 'one', organizationId: 'org-a' };
    const repo = {
      findOne: jest.fn().mockResolvedValueOnce(movement).mockResolvedValueOnce(null).mockResolvedValueOnce(movement),
      save: jest.fn(async (value) => value),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new AssetMovementsController(repo as unknown as Repository<AssetMovement>, audit as unknown as AuditService);
    const ctx = { orgId: 'org-a', userId: 'user', username: 'alex', ip: null };
    await controller.update('one', { ...details, destination: 'New site', direction: 'inbound' }, 'org-a', ctx);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ destination: 'New site', direction: 'inbound' }));
    await expect(controller.remove('one', 'org-b', ctx)).rejects.toThrow();
    await controller.remove('one', 'org-a', ctx);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'one', organizationId: 'org-a' } });
    expect(repo.remove).toHaveBeenCalledTimes(1);
  });

  it('validates and saves additional assets while accepting legacy single-item forms', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: CreateAssetMovementDto };
    const additionalAssets = [{ assetName: 'Monitor', assetTag: 'A-2', serialNumber: 'S-2' }];
    const dto = await pipe.transform({ ...details, additionalAssets }, metadata);
    const repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'movement' })),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new AssetMovementsController(repo as unknown as Repository<AssetMovement>, audit as unknown as AuditService);
    const saved = await controller.create(dto, 'org-a', { orgId: 'org-a', userId: 'user', username: 'alex', ip: null });
    expect(saved.additionalAssets).toEqual(additionalAssets);
    await expect(pipe.transform(details, metadata)).resolves.toBeInstanceOf(CreateAssetMovementDto);
    await expect(pipe.transform({ ...details, additionalAssets: [{ ...additionalAssets[0], assetName: '  ' }] }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, additionalAssets: [{ ...additionalAssets[0], organizationId: 'other' }] }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, additionalAssets: 'invalid' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, additionalAssets: [additionalAssets] }, metadata)).rejects.toThrow();
  });

  it('accepts manual asset details with optional serials and validates their entry mode', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: CreateAssetMovementDto };
    const manual = { ...details, assetName: 'Projector', serialNumber: '', manualEntry: true,
      additionalAssets: [{ assetName: 'Cable', assetTag: '', serialNumber: '', manualEntry: true }] };
    const dto = await pipe.transform(manual, metadata);
    expect(dto).toMatchObject(manual);
    await expect(pipe.transform({ ...manual, manualEntry: null }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...manual, additionalAssets: [{ ...manual.additionalAssets[0], manualEntry: 'true' }] }, metadata)).rejects.toThrow();
  });
});
