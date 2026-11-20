import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { Ctx, Org, ReqCtx, Roles } from './auth';
import { EquipmentEntryDto } from './dto';
import { AssetMovement, EquipmentEntry } from './entities';

const serialKey = (serial: string) => serial.trim().toUpperCase();

@Controller('equipment-entries')
@Roles('admin', 'viewer')
export class EquipmentEntriesController {
  constructor(
    @InjectRepository(EquipmentEntry) private repo: Repository<EquipmentEntry>,
    @InjectRepository(AssetMovement) private movements: Repository<AssetMovement>,
    private audit: AuditService,
  ) {}

  @Get()
  async list(@Org() orgId: string) {
    const [entries, movements] = await Promise.all([
      this.repo.find({ where: { organizationId: orgId }, order: { createdAt: 'DESC' } }),
      this.movements.find({ where: { organizationId: orgId }, order: { movementDate: 'DESC', createdAt: 'DESC', id: 'DESC' } }),
    ]);
    const latest = new Map<string, AssetMovement>();
    for (const movement of movements) {
      for (const asset of [movement, ...(movement.additionalAssets ?? [])]) {
        const serial = serialKey(asset.serialNumber);
        if (serial && !latest.has(serial)) latest.set(serial, movement);
      }
    }
    return entries.map((entry) => {
      const movement = latest.get(serialKey(entry.serialNumber));
      const delivered = movement?.direction === 'outbound';
      return { ...entry, delivered, deliveredTo: delivered ? movement.destination : null };
    });
  }

  private async save(entry: EquipmentEntry, dto: EquipmentEntryDto) {
    const serialNumber = serialKey(dto.serialNumber);
    if (serialNumber.length > 200) throw new BadRequestException('Serial number is too long after normalization.');
    Object.assign(entry, dto, { name: dto.name.trim(), serialNumber });
    try {
      return await this.repo.save(entry);
    } catch (error) {
      if (error instanceof QueryFailedError && error.driverError?.code === '23505'
        && error.driverError?.constraint === 'UQ_equipment_org_serial') {
        throw new ConflictException('This serial number is already registered in this organisation.');
      }
      throw error;
    }
  }

  @Post()
  async create(@Body() dto: EquipmentEntryDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const entry = await this.save(this.repo.create({ organizationId: orgId }), dto);
    await this.audit.log(ctx, 'create', 'equipment-entry', entry.id, entry.name);
    return entry;
  }

  @Put(':id') @Roles('admin')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EquipmentEntryDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const entry = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!entry) throw new NotFoundException();
    await this.save(entry, dto);
    await this.audit.log(ctx, 'update', 'equipment-entry', id, entry.name);
    return entry;
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const entry = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!entry) throw new NotFoundException();
    await this.repo.remove(entry);
    await this.audit.log(ctx, 'delete', 'equipment-entry', id, entry.name);
  }
}
