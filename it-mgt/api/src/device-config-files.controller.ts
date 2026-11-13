import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { Ctx, Org, ReqCtx, Roles } from './auth';
import { Device, DeviceConfigFile } from './entities';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
interface UploadedConfigFile { originalname: string; size: number; buffer: Buffer }

@Controller('devices/:deviceId/config-files')
@Roles('admin', 'engineer')
export class DeviceConfigFilesController {
  constructor(
    @InjectRepository(Device) private devices: Repository<Device>,
    @InjectRepository(DeviceConfigFile) private files: Repository<DeviceConfigFile>,
    private audit: AuditService,
  ) {}

  private async requireDevice(deviceId: string, orgId: string) {
    if (!(await this.devices.exist({ where: { id: deviceId, client: { organizationId: orgId } } }))) {
      throw new NotFoundException('Device not found');
    }
  }

  @Get()
  async list(@Param('deviceId', new ParseUUIDPipe()) deviceId: string, @Org() orgId: string) {
    await this.requireDevice(deviceId, orgId);
    return this.files.find({ where: { deviceId }, order: { createdAt: 'DESC' } });
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE, files: 1 } }))
  async upload(
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Org() orgId: string,
    @Ctx() ctx: ReqCtx,
    @UploadedFile() file?: UploadedConfigFile,
  ) {
    await this.requireDevice(deviceId, orgId);
    if (!file || !file.originalname || !file.size || file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Select a non-empty configuration file up to 25 MB');
    }
    const name = file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 255);
    const saved = await this.files.save(this.files.create({ deviceId, name, size: file.size, content: file.buffer }));
    await this.audit.log(ctx, 'create', 'device-config-file', saved.id, name);
    return { id: saved.id, deviceId: saved.deviceId, name: saved.name, size: saved.size, createdAt: saved.createdAt };
  }

  @Get(':fileId')
  async download(
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Org() orgId: string,
    @Ctx() ctx: ReqCtx,
    @Res() res: Response,
  ) {
    await this.requireDevice(deviceId, orgId);
    const file = await this.files.createQueryBuilder('file')
      .addSelect('file.content')
      .where('file.id = :fileId AND file.deviceId = :deviceId', { fileId, deviceId })
      .getOne();
    if (!file) throw new NotFoundException('Configuration file not found');
    await this.audit.log(ctx, 'download', 'device-config-file', file.id, file.name);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.attachment(file.name);
    res.type('application/octet-stream').send(file.content);
  }
}
