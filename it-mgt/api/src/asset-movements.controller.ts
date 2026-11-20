import { Body, Controller, Get, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { Ctx, Org, ReqCtx, Roles } from './auth';
import { CreateAssetMovementDto } from './dto';
import { AssetMovement } from './entities';

@Controller('asset-movements')
export class AssetMovementsController {
  constructor(
    @InjectRepository(AssetMovement) private repo: Repository<AssetMovement>,
    private audit: AuditService,
  ) {}

  @Get()
  list(@Org() orgId: string) {
    return this.repo.find({ where: { organizationId: orgId }, order: { createdAt: 'DESC' } });
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateAssetMovementDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const movement = await this.repo.save(this.repo.create({ ...dto, organizationId: orgId }));
    await this.audit.log(ctx, 'create', 'asset-movement', movement.id, movement.assetName);
    return movement;
  }
}
