import {
  CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization, Role, User } from './entities';

export interface AuthUser { id: string; username: string; role: Role; isSuperAdmin: boolean; orgId: string | null }
export interface ReqCtx { userId: string | null; username: string | null; ip: string | null; orgId: string | null }

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('public', true);
/** Endpoints reachable from the platform console, i.e. with a super-admin token that is not tied to an organisation. */
export const PlatformOk = () => SetMetadata('platform', true);

export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): ReqCtx => {
  const req = ec.switchToHttp().getRequest();
  return { userId: req.user?.id ?? null, username: req.user?.username ?? null, ip: req.ip ?? null, orgId: req.user?.orgId ?? null };
});

/** The organisation the caller is signed in to; every query must be scoped to it. */
export const Org = createParamDecorator((_: unknown, ec: ExecutionContext): string => ec.switchToHttp().getRequest().user.orgId);

export const CurrentUser = createParamDecorator(
  (_: unknown, ec: ExecutionContext): AuthUser => ec.switchToHttp().getRequest().user,
);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Organization) private orgs: Repository<Organization>,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('public', [ec.getHandler(), ec.getClass()])) return true;
    const req = ec.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    let payload: { sub: string; org?: string; platform?: boolean };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (!payload.org && !payload.platform) throw new UnauthorizedException();
    // Reload so role/membership changes and deactivation take effect immediately.
    const user = await this.users.findOne({ where: { id: payload.sub }, relations: { organizations: true } });
    if (!user || !user.active) throw new UnauthorizedException();
    if (!payload.org) {
      if (!user.isSuperAdmin) throw new UnauthorizedException();
      if (!this.reflector.getAllAndOverride<boolean>('platform', [ec.getHandler(), ec.getClass()])) {
        throw new ForbiddenException('Open an organisation to use this');
      }
      req.user = { id: user.id, username: user.username, role: user.role, isSuperAdmin: true, orgId: null } as AuthUser;
      return true;
    }
    const allowed = user.isSuperAdmin
      ? await this.orgs.exist({ where: { id: payload.org } })
      : user.organizations.some((o) => o.id === payload.org);
    if (!allowed) throw new UnauthorizedException();
    req.user = { id: user.id, username: user.username, role: user.role, isSuperAdmin: user.isSuperAdmin, orgId: payload.org } as AuthUser;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ec: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [ec.getHandler(), ec.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user: AuthUser | undefined = ec.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
