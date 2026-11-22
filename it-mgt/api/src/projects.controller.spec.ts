import { BadRequestException, ExecutionContext, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { RolesGuard } from './auth';
import { ProjectDto } from './dto';
import { Client, Project } from './entities';
import { ProjectsController } from './projects.controller';

const details = {
  name: 'Deployment', clientId: null, clientName: 'Client', lpoNumber: '', referenceNumber: '',
  startDate: '2026-11-20', location: 'Site', clientLead: 'Client lead', companyLead: 'Company lead',
  teamDetails: 'Alex - engineer', clientContacts: 'Contact - 123', status: 'planned' as const,
};
const ctx = { userId: 'u', username: 'admin', ip: null, orgId: 'org-a' };

describe('ProjectsController', () => {
  const projects = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn(), createQueryBuilder: jest.fn() };
  const clients = { findOne: jest.fn() };
  const audit = { log: jest.fn() };
  const controller = new ProjectsController(projects as unknown as Repository<Project>,
    clients as unknown as Repository<Client>, audit as unknown as AuditService);

  beforeEach(() => {
    jest.resetAllMocks();
    projects.create.mockImplementation((value) => value);
    projects.save.mockImplementation(async (value) => ({ ...value, id: value.id ?? 'project' }));
    audit.log.mockResolvedValue(undefined);
  });

  it('scopes projects and validates selected clients in the same organisation', async () => {
    projects.find.mockResolvedValue([]);
    await controller.list('org-a');
    expect(projects.find).toHaveBeenCalledWith({ where: { organizationId: 'org-a' }, order: { createdAt: 'DESC' } });
    await controller.create(details, 'org-a', ctx);
    expect(projects.create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-a', clientName: 'Client', clientId: null }));
    clients.findOne.mockResolvedValueOnce({ id: 'client', name: 'Registered' }).mockResolvedValueOnce(null);
    await controller.create({ ...details, clientId: 'client' }, 'org-a', ctx);
    expect(clients.findOne).toHaveBeenCalledWith({ where: { id: 'client', organizationId: 'org-a' } });
    expect(projects.create).toHaveBeenLastCalledWith(expect.objectContaining({ clientName: 'Registered' }));
    await expect(controller.create({ ...details, clientId: 'client' }, 'org-b', ctx)).rejects.toThrow(BadRequestException);
    projects.update.mockResolvedValue({ affected: 0 });
    await expect(controller.update('project', details, 'org-b', ctx)).rejects.toThrow(NotFoundException);
    projects.update.mockResolvedValue({ affected: 1 });
    projects.findOne.mockResolvedValue({ ...details, id: 'project', reportName: 'report.pdf' });
    const updated = await controller.update('project', { ...details, status: 'completed', completionDate: '2026-11-22' }, 'org-a', ctx);
    expect(updated.reportName).toBe('report.pdf');
    expect(projects.update).toHaveBeenLastCalledWith({ id: 'project', organizationId: 'org-a' },
      expect.not.objectContaining({ reportName: expect.anything() }));
    expect(projects.update).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ completionDate: '2026-11-22' }));
  });

  it('requires a valid completion date for completed projects and accepts existing projects without one', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: ProjectDto };
    await expect(pipe.transform({ ...details, status: 'completed' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, status: 'completed', completionDate: null }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, status: 'completed', completionDate: '2026-02-30' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, status: 'completed', completionDate: '2026-11-22' }, metadata)).resolves.toBeInstanceOf(ProjectDto);
    await expect(pipe.transform({ ...details, completionDate: null }, metadata)).resolves.toBeInstanceOf(ProjectDto);
    await expect(pipe.transform({ ...details, completionDate: 'invalid' }, metadata)).rejects.toThrow();
    projects.update.mockResolvedValue({ affected: 1 });
    projects.findOne.mockResolvedValue({ ...details, id: 'project', completionDate: '2026-11-22' });
    await controller.update('project', details, 'org-a', ctx);
    expect(projects.update.mock.calls[0][1]).not.toHaveProperty('completionDate');
    await controller.update('project', { ...details, completionDate: '2026-11-22' }, 'org-a', ctx);
    expect(projects.update).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ completionDate: '2026-11-22' }));
  });

  it('validates required details, status and optional references', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: ProjectDto };
    await expect(pipe.transform(details, metadata)).resolves.toBeInstanceOf(ProjectDto);
    const { lpoNumber: _lpo, referenceNumber: _reference, ...withoutOptional } = details;
    await expect(pipe.transform(withoutOptional, metadata)).resolves.toBeInstanceOf(ProjectDto);
    await expect(pipe.transform({ ...details, teamDetails: '  ' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, status: 'unknown' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, startDate: '2026-02-30' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...details, organizationId: 'org-b' }, metadata)).rejects.toThrow();
  });

  it('allows report upload only for completed projects and checks size and organisation', async () => {
    const file = { originalname: '../report.pdf', size: 3, buffer: Buffer.from([1, 2, 3]) };
    projects.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'planned' }).mockResolvedValueOnce({ status: 'completed' });
    await expect(controller.uploadReport('id', 'org-b', ctx, file)).rejects.toThrow(NotFoundException);
    await expect(controller.uploadReport('id', 'org-a', ctx, file)).rejects.toThrow('Complete the project');
    await expect(controller.uploadReport('id', 'org-a', ctx, { ...file, size: 25 * 1024 * 1024 + 1 })).rejects.toThrow(BadRequestException);
    projects.update.mockResolvedValue({ affected: 1 });
    await expect(controller.uploadReport('id', 'org-a', ctx, file)).resolves.toEqual({ name: '.._report.pdf', size: 3 });
    expect(projects.update).toHaveBeenCalledWith({ id: 'id', organizationId: 'org-a', status: 'completed' },
      { reportName: '.._report.pdf', reportSize: 3, reportContent: file.buffer });
  });

  it('downloads the report only from the requested organisation', async () => {
    const content = Buffer.from([2, 3]);
    const query = { addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ reportName: 'report.pdf', reportContent: content }) };
    projects.createQueryBuilder.mockReturnValue(query);
    const res = { setHeader: jest.fn(), attachment: jest.fn(), type: jest.fn().mockReturnThis(), send: jest.fn() };
    await expect(controller.downloadReport('id', 'org-b', ctx, res as unknown as Response)).rejects.toThrow(NotFoundException);
    await controller.downloadReport('id', 'org-a', ctx, res as unknown as Response);
    expect(query.where).toHaveBeenLastCalledWith('project.id = :id AND project.organizationId = :orgId', { id: 'id', orgId: 'org-a' });
    expect(res.send).toHaveBeenCalledWith(content);
  });

  it('allows viewers to read and download but prevents changes', () => {
    const guard = new RolesGuard(new Reflector());
    const check = (handler: Function, role: string) => guard.canActivate({
      getHandler: () => handler, getClass: () => ProjectsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as ExecutionContext);
    for (const handler of [controller.create, controller.update, controller.uploadReport]) {
      expect(() => check(handler, 'viewer')).toThrow('Insufficient role');
      expect(check(handler, 'engineer')).toBe(true);
    }
    expect(check(controller.list, 'viewer')).toBe(true);
    expect(check(controller.downloadReport, 'viewer')).toBe(true);
  });
});
