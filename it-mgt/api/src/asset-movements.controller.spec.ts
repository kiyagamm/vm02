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
    expect(Reflect.getMetadata('roles', controller.create)).toEqual(['admin', 'engineer']);
  });

  it('rejects whitespace-only required fields, invalid dates and a supplied organisation', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: CreateAssetMovementDto };
    await expect(pipe.transform(details, metadata)).resolves.toBeInstanceOf(CreateAssetMovementDto);
    await expect(pipe.transform({ ...details, destination: '   ' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, movementDate: '2026-02-30' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, organizationId: 'org-b' }, metadata)).rejects.toThrow();
  });
});
