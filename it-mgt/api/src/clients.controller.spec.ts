import { Repository } from 'typeorm';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from './audit.service';
import { RolesGuard } from './auth';
import { AssetMovementsController } from './asset-movements.controller';
import { EquipmentEntriesController } from './equipment-entries.controller';
import { ClientsController, CredentialsController, DevicesController, SearchController, VmsController } from './controllers';
import { Client, Device } from './entities';

const admin = { id: 'admin', username: 'admin', role: 'admin' as const, isSuperAdmin: false, orgId: 'org' };
const viewer = { ...admin, role: 'viewer' as const };

describe('ClientsController list', () => {
  it('groups device types and VM counts by client without including other organisations', async () => {
    const clients = [{ id: 'one', name: 'One', deviceCount: 5 }, { id: 'empty', name: 'Empty', deviceCount: 0 }];
    const clientQuery = {
      where: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(clients),
    };
    const deviceQuery = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { clientId: 'one', type: 'hypervisor', deviceCount: '1', vmCount: '3' },
        { clientId: 'one', type: 'switch', deviceCount: '4', vmCount: '0' },
      ]),
    };
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(clientQuery) };
    const devices = { createQueryBuilder: jest.fn().mockReturnValue(deviceQuery) };
    const controller = new ClientsController(
      repo as unknown as Repository<Client>, devices as unknown as Repository<Device>, {} as AuditService,
    );

    await expect(controller.list('org', admin)).resolves.toEqual([
      { ...clients[0], vmCount: 3, deviceTypeCounts: [{ type: 'hypervisor', count: 1 }, { type: 'switch', count: 4 }] },
      { ...clients[1], vmCount: 0, deviceTypeCounts: [] },
    ]);
    expect(clientQuery.where).toHaveBeenCalledWith('c.organizationId = :orgId', { orgId: 'org' });
    expect(deviceQuery.where).toHaveBeenCalledWith('d.clientId IN (:...clientIds)', { clientIds: ['one', 'empty'] });
    expect(deviceQuery.addSelect).toHaveBeenCalledWith('COUNT(DISTINCT d.id)', 'deviceCount');
    expect(deviceQuery.leftJoin).toHaveBeenCalledWith('d.vms', 'vm');
  });

  it('skips the aggregation query when there are no clients', async () => {
    const clientQuery = {
      where: jest.fn().mockReturnThis(), loadRelationCountAndMap: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]),
    };
    const devices = { createQueryBuilder: jest.fn() };
    const controller = new ClientsController(
      { createQueryBuilder: jest.fn().mockReturnValue(clientQuery) } as unknown as Repository<Client>,
      devices as unknown as Repository<Device>, {} as AuditService,
    );
    await expect(controller.list('org', admin)).resolves.toEqual([]);
    expect(devices.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns only client names and equipment counts to viewers', async () => {
    const query = {
      where: jest.fn().mockReturnThis(), loadRelationCountAndMap: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'one', name: 'Client', deviceCount: 2, contact: 'Private', notes: 'Private' }]),
    };
    const devices = { createQueryBuilder: jest.fn() };
    const controller = new ClientsController(
      { createQueryBuilder: jest.fn().mockReturnValue(query) } as unknown as Repository<Client>,
      devices as unknown as Repository<Device>, {} as AuditService,
    );
    await expect(controller.list('org', viewer)).resolves.toEqual([{ id: 'one', name: 'Client', deviceCount: 2 }]);
    expect(devices.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('enforces viewer restrictions through the roles guard', () => {
    const guard = new RolesGuard(new Reflector());
    const check = (handler: Function, controller: Function, user: typeof viewer | typeof admin) =>
      guard.canActivate({
        getHandler: () => handler, getClass: () => controller,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      } as ExecutionContext);
    for (const [handler, controller] of [
      [ClientsController.prototype.one, ClientsController],
      [DevicesController.prototype.list, DevicesController],
      [DevicesController.prototype.one, DevicesController],
      [DevicesController.prototype.check, DevicesController],
      [VmsController.prototype.list, VmsController],
      [CredentialsController.prototype.list, CredentialsController],
      [SearchController.prototype.search, SearchController],
      [AssetMovementsController.prototype.create, AssetMovementsController],
    ]) {
      expect(() => check(handler, controller, viewer)).toThrow('Insufficient role');
      expect(check(handler, controller, admin)).toBe(true);
    }
    expect(check(AssetMovementsController.prototype.list, AssetMovementsController, viewer)).toBe(true);
    expect(check(EquipmentEntriesController.prototype.create, EquipmentEntriesController, viewer)).toBe(true);
    expect(() => check(EquipmentEntriesController.prototype.update, EquipmentEntriesController, viewer)).toThrow('Insufficient role');
    expect(() => check(EquipmentEntriesController.prototype.remove, EquipmentEntriesController, viewer)).toThrow('Insufficient role');
  });
});
