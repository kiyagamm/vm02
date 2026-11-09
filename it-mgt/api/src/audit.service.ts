import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities';
import { ReqCtx } from './auth';

export type AuditAction = 'create' | 'update' | 'delete' | 'reveal-password' | 'command-run' | 'login' | 'login-failed';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private repo: Repository<AuditLog>) {}

  log(ctx: ReqCtx, action: AuditAction, entity: string, entityId?: string | null, details?: string | null) {
    return this.repo.save(
      this.repo.create({
        userId: ctx.userId,
        username: ctx.username,
        ip: ctx.ip,
        action,
        entity,
        entityId: entityId ?? null,
        details: details ?? null,
      }),
    );
  }
}
