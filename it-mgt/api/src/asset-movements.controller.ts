import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { Ctx, Org, ReqCtx, Roles } from './auth';
import { CreateAssetMovementDto } from './dto';
import { AssetMovement } from './entities';

@Controller('asset-movements')
@Roles('admin', 'viewer')
export class AssetMovementsController {
  constructor(
    @InjectRepository(AssetMovement) private repo: Repository<AssetMovement>,
    private audit: AuditService,
  ) {}

  @Get()
  list(@Org() orgId: string) {
    return this.repo.find({ where: { organizationId: orgId }, order: { createdAt: 'DESC' } });
  }

  @Post() @Roles('admin')
  async create(@Body() dto: CreateAssetMovementDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const movement = await this.repo.save(this.repo.create({ ...dto, organizationId: orgId }));
    await this.audit.log(ctx, 'create', 'asset-movement', movement.id, movement.assetName);
    return movement;
  }

  @Put(':id') @Roles('admin')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateAssetMovementDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const movement = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!movement) throw new NotFoundException();
    await this.repo.save(Object.assign(movement, dto));
    await this.audit.log(ctx, 'update', 'asset-movement', id, movement.assetName);
    return movement;
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const movement = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!movement) throw new NotFoundException();
    await this.repo.remove(movement);
    await this.audit.log(ctx, 'delete', 'asset-movement', id, movement.assetName);
  }
}
