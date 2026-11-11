import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { ClientsController } from './controllers';
import { Client, Device } from './entities';

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

    await expect(controller.list('org')).resolves.toEqual([
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
    await expect(controller.list('org')).resolves.toEqual([]);
    expect(devices.createQueryBuilder).not.toHaveBeenCalled();
  });
});
