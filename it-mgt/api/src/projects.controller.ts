import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { Ctx, Org, ReqCtx, Roles } from './auth';
import { ProjectDto } from './dto';
import { Client, Project } from './entities';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
interface UploadedReport { originalname: string; size: number; buffer: Buffer }

@Controller('projects')
export class ProjectsController {
  constructor(
    @InjectRepository(Project) private projects: Repository<Project>,
    @InjectRepository(Client) private clients: Repository<Client>,
    private audit: AuditService,
  ) {}

  @Get()
  list(@Org() orgId: string) {
    return this.projects.find({ where: { organizationId: orgId }, order: { createdAt: 'DESC' } });
  }

  private async details(dto: ProjectDto, orgId: string) {
    let clientName = dto.clientName.trim();
    if (dto.clientId) {
      const client = await this.clients.findOne({ where: { id: dto.clientId, organizationId: orgId } });
      if (!client) throw new BadRequestException('Unknown client');
      clientName = client.name;
    }
    return { ...dto, clientId: dto.clientId || null, clientName,
      name: dto.name.trim(), lpoNumber: dto.lpoNumber?.trim() ?? '', referenceNumber: dto.referenceNumber?.trim() ?? '',
      location: dto.location.trim(), clientLead: dto.clientLead.trim(), companyLead: dto.companyLead.trim(),
      teamDetails: dto.teamDetails.trim(), clientContacts: dto.clientContacts.trim(),
      ...(dto.completionDate !== undefined ? { completionDate: dto.completionDate || null } : {}) };
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: ProjectDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const project = await this.projects.save(this.projects.create({ ...await this.details(dto, orgId), organizationId: orgId }));
    await this.audit.log(ctx, 'create', 'project', project.id, project.name);
    return project;
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ProjectDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const project = await this.projects.update({ id, organizationId: orgId }, await this.details(dto, orgId));
    if (!project.affected) throw new NotFoundException('Project not found');
    const updated = await this.projects.findOne({ where: { id, organizationId: orgId } });
    if (!updated) throw new NotFoundException('Project not found');
    await this.audit.log(ctx, 'update', 'project', id, updated.name);
    return updated;
  }

  @Post(':id/completion-report') @Roles('admin', 'engineer')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE, files: 1 } }))
  async uploadReport(
    @Param('id', new ParseUUIDPipe()) id: string, @Org() orgId: string,
    @Ctx() ctx: ReqCtx, @UploadedFile() file?: UploadedReport,
  ) {
    if (!file || !file.originalname || !file.size || file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Select a non-empty completion report up to 25 MB');
    }
    const project = await this.projects.findOne({ where: { id, organizationId: orgId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.status !== 'completed') throw new BadRequestException('Complete the project before uploading a report');
    const name = file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 255);
    const result = await this.projects.update({ id, organizationId: orgId, status: 'completed' },
      { reportName: name, reportSize: file.size, reportContent: file.buffer });
    if (!result.affected) throw new BadRequestException('Project is no longer completed or no longer exists');
    await this.audit.log(ctx, 'update', 'project-report', id, name);
    return { name, size: file.size };
  }

  @Get(':id/completion-report')
  async downloadReport(@Param('id', new ParseUUIDPipe()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx, @Res() res: Response) {
    const project = await this.projects.createQueryBuilder('project')
      .addSelect('project.reportContent')
      .where('project.id = :id AND project.organizationId = :orgId', { id, orgId }).getOne();
    if (!project?.reportName || !project.reportContent) throw new NotFoundException('Completion report not found');
    await this.audit.log(ctx, 'download', 'project-report', id, project.reportName);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.attachment(project.reportName);
    res.type('application/octet-stream').send(project.reportContent);
  }
}
