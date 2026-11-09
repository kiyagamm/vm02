import {
  CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, User } from './entities';

export interface AuthUser { id: string; username: string; role: Role }
export interface ReqCtx { userId: string | null; username: string | null; ip: string | null }

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('public', true);

export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): ReqCtx => {
  const req = ec.switchToHttp().getRequest();
  return { userId: req.user?.id ?? null, username: req.user?.username ?? null, ip: req.ip ?? null };
});

export const CurrentUser = createParamDecorator(
  (_: unknown, ec: ExecutionContext): AuthUser => ec.switchToHttp().getRequest().user,
);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('public', [ec.getHandler(), ec.getClass()])) return true;
    const req = ec.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    // Reload so role changes / deactivation take effect immediately.
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.active) throw new UnauthorizedException();
    req.user = { id: user.id, username: user.username, role: user.role } as AuthUser;
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
