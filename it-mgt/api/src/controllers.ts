import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException,
  Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UnauthorizedException, BadGatewayException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { ILike, In, Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuthUser, Ctx, CurrentUser, Org, PlatformOk, Public, ReqCtx, Roles } from './auth';
import { checkCommand } from './command-policy';
import { CryptoService } from './crypto.service';
import {
  CreateClientDto, CreateCredentialDto, CreateDeviceDto, CreateOrgDto, CreateSnippetDto, CreateUserDto, CreateVmDto, ExecDto, LoginDto,
  SetSuperDto, SetUserOrgsDto, SignupDto, SwitchOrgDto, UpdatePlatformDto, UpdateBrandingDto, UpdateClientDto, UpdateCredentialDto, UpdateDeviceDto, UpdateOrgDto, UpdateProfileDto,
  UpdateSnippetDto, UpdateUserDto, UpdateVmDto,
} from './dto';
import { AppSetting, AuditLog, Client, ConfigSnippet, Credential, Device, Organization, SignupRequest, User, Vm, uniqueSlug } from './entities';
import { SshService } from './ssh.service';
import { SnmpService, assertSnmpHost } from './snmp.service';

const uuid = () => new ParseUUIDPipe();
const strip = (u: User) => ({
  id: u.id, username: u.username, role: u.role, active: u.active, isSuperAdmin: u.isSuperAdmin, createdAt: u.createdAt,
  ...(u.organizations ? { organizations: u.organizations.map((o) => ({ id: o.id, name: o.name })) } : {}),
});
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

// Org-scoping filters: everything hangs off a client, and clients belong to one organisation.
const devScope = (orgId: string) => ({ client: { organizationId: orgId } });
const vmScope = (orgId: string) => ({ device: devScope(orgId) });
const credScope = (orgId: string) => [{ device: devScope(orgId) }, { vm: vmScope(orgId) }];
const requireSuper = (u: AuthUser) => { if (!u.isSuperAdmin) throw new ForbiddenException('Super admin only'); };

@Controller('auth') @PlatformOk()
export class AuthController {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  private orgsFor(u: User): Promise<Organization[]> {
    return u.isSuperAdmin ? this.orgs.find({ order: { name: 'ASC' } }) : Promise.resolve([...u.organizations].sort((a, b) => a.name.localeCompare(b.name)));
  }

  private async session(u: User, org: Organization | null) {
    const token = await this.jwt.signAsync({ sub: u.id, username: u.username, role: u.role, ...(org ? { org: org.id } : { platform: true }) });
    const organizations = (await this.orgsFor(u)).map((o) => ({ id: o.id, name: o.name }));
    return { token, user: { ...strip(u), ...(org ? { organization: { id: org.id, name: org.name } } : { platform: true }), organizations } };
  }

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Ctx() ctx: ReqCtx) {
    const user = await this.users.findOne({ where: { username: dto.username }, relations: { organizations: true } });
    const ok = user && user.active && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!ok) {
      await this.audit.log({ ...ctx, username: dto.username }, 'login-failed', 'user');
      throw new UnauthorizedException('Invalid credentials');
    }
    // Super admins land in the platform console unless they ask for a specific organisation.
    if (user.isSuperAdmin && !dto.organizationId) {
      await this.audit.log({ ...ctx, userId: user.id, username: user.username }, 'login', 'user', user.id, 'platform console');
      return this.session(user, null);
    }
    const available = await this.orgsFor(user);
    if (available.length === 0) throw new ForbiddenException('This user does not belong to any organisation');
    const org = dto.organizationId ? available.find((o) => o.id === dto.organizationId) : available.length === 1 ? available[0] : undefined;
    if (dto.organizationId && !org) throw new ForbiddenException('You do not have access to that organisation');
    // Several organisations and none chosen yet: let the client pick one and resubmit.
    if (!org) return { organizations: available.map((o) => ({ id: o.id, name: o.name })) };
    await this.audit.log({ ...ctx, userId: user.id, username: user.username, orgId: org.id }, 'login', 'user', user.id);
    return this.session(user, org);
  }

  @Post('switch') @HttpCode(200)
  async switchOrg(@Body() dto: SwitchOrgDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    const user = await this.users.findOneOrFail({ where: { id: me.id }, relations: { organizations: true } });
    const org = (await this.orgsFor(user)).find((o) => o.id === dto.organizationId);
    if (!org) throw new ForbiddenException('You do not have access to that organisation');
    await this.audit.log({ ...ctx, orgId: org.id }, 'login', 'user', user.id, `switched to ${org.name}`);
    return this.session(user, org);
  }

  @Post('platform') @HttpCode(200)
  async platform(@CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    const user = await this.users.findOneOrFail({ where: { id: me.id }, relations: { organizations: true } });
    await this.audit.log({ ...ctx, orgId: null }, 'login', 'user', user.id, 'platform console');
    return this.session(user, null);
  }

  @Get('me') async me(@CurrentUser() me: AuthUser) {
    const user = await this.users.findOneOrFail({ where: { id: me.id }, relations: { organizations: true } });
    const org = me.orgId ? await this.orgs.findOneOrFail({ where: { id: me.orgId } }) : null;
    return (await this.session(user, org)).user;
  }

  @Put('me')
  async updateMe(@Body() dto: UpdateProfileDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    const u = await this.users.findOne({ where: { id: me.id }, relations: { organizations: true } });
    if (!u || !(await bcrypt.compare(dto.currentPassword, u.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.username && dto.username !== u.username) {
      if (await this.users.findOne({ where: { username: dto.username } })) throw new BadRequestException('Username taken');
      u.username = dto.username;
    }
    if (dto.newPassword) u.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.users.save(u);
    await this.audit.log({ ...ctx, username: u.username }, 'update', 'user', u.id, `profile: ${Object.keys(dto).filter((k) => k !== 'currentPassword').join(',')}`);
    const org = me.orgId ? await this.orgs.findOneOrFail({ where: { id: me.orgId } }) : null;
    return (await this.session(u, org)).user;
  }
}

@Controller('signups') @PlatformOk()
export class SignupsController {
  constructor(
    @InjectRepository(SignupRequest) private repo: Repository<SignupRequest>,
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    @InjectRepository(User) private users: Repository<User>,
    private audit: AuditService,
  ) {}

  @Public() @Post() @HttpCode(200)
  async signup(@Body() dto: SignupDto) {
    const name = dto.organizationName.trim();
    const username = dto.username.trim();
    if (!name || !username) throw new BadRequestException('Username and organisation are required');
    if (await this.users.findOne({ where: { username } }) || await this.repo.findOne({ where: { username } })) {
      throw new BadRequestException('Username is already taken or awaiting approval');
    }
    const existing = await this.orgs.findOne({ where: { name: ILike(escapeLike(name)) } });
    if (dto.type === 'new-org' && existing) throw new BadRequestException('An organisation with that name already exists');
    if (dto.type === 'join' && !existing) throw new BadRequestException('Organisation not found. Check the name with your administrator');
    await this.repo.save(this.repo.create({
      username, type: dto.type, organizationName: existing?.name ?? name, passwordHash: await bcrypt.hash(dto.password, 12),
    }));
    return { ok: true };
  }

  @Get() async list(@CurrentUser() me: AuthUser) {
    requireSuper(me);
    const rows = await this.repo.find({ order: { createdAt: 'ASC' } });
    return rows.map((r) => ({ id: r.id, username: r.username, type: r.type, organizationName: r.organizationName, createdAt: r.createdAt }));
  }

  @Post(':id/approve') @HttpCode(200)
  async approve(@Param('id', uuid()) id: string, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException();
    if (await this.users.findOne({ where: { username: r.username } })) throw new BadRequestException('Username is now taken');
    let org = await this.orgs.findOne({ where: { name: r.organizationName } });
    if (r.type === 'new-org') {
      if (org) throw new BadRequestException('An organisation with that name already exists');
      org = await this.orgs.save(this.orgs.create({ name: r.organizationName, slug: await uniqueSlug(this.orgs, r.organizationName) }));
    } else if (!org) throw new BadRequestException('Organisation no longer exists');
    if (r.type === 'join' && org) {
      const used = await this.users.count({ where: { organizations: { id: org.id }, isSuperAdmin: false } });
      if (used >= org.maxUsers) throw new BadRequestException(`${org.name} has reached its user limit (${org.maxUsers}). Raise the limit first.`);
    }
    const user = await this.users.save(this.users.create({
      username: r.username, passwordHash: r.passwordHash, role: r.type === 'new-org' ? 'admin' : 'viewer', organizations: [org],
    }));
    await this.repo.delete(id);
    await this.audit.log(ctx, 'create', 'user', user.id, `signup approved: ${r.username} -> ${org.name}`);
    return { ok: true };
  }

  @Delete(':id') @HttpCode(200)
  async reject(@Param('id', uuid()) id: string, @CurrentUser() me: AuthUser) {
    requireSuper(me);
    await this.repo.delete(id);
    return { ok: true };
  }
}

@Controller('platform') @PlatformOk()
export class PlatformController {
  constructor(
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Client) private clients: Repository<Client>,
    @InjectRepository(Device) private devices: Repository<Device>,
    @InjectRepository(SignupRequest) private signups: Repository<SignupRequest>,
    private audit: AuditService,
  ) {}

  @Get('overview') async overview(@CurrentUser() me: AuthUser) {
    requireSuper(me);
    return {
      organizations: await this.orgs.count(), users: await this.users.count(), clients: await this.clients.count(),
      devices: await this.devices.count(), pendingSignups: await this.signups.count(),
    };
  }

  @Get('users') async listUsers(@CurrentUser() me: AuthUser) {
    requireSuper(me);
    return (await this.users.find({ relations: { organizations: true }, order: { username: 'ASC' } })).map(strip);
  }

  @Put('users/:id/organizations')
  async setOrgs(@Param('id', uuid()) id: string, @Body() dto: SetUserOrgsDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    const u = await this.users.findOne({ where: { id }, relations: { organizations: true } });
    if (!u) throw new NotFoundException();
    const orgs = await this.orgs.find({ where: { id: In(dto.organizationIds) } });
    if (orgs.length !== new Set(dto.organizationIds).size) throw new BadRequestException('Unknown organisation');
    u.organizations = orgs;
    await this.users.save(u);
    await this.audit.log({ ...ctx, orgId: null }, 'update', 'user', id, `${u.username}: organisations ${orgs.map((o) => o.name).join(', ')}`);
    return strip(u);
  }

  @Put('users/:id/super')
  async setSuper(@Param('id', uuid()) id: string, @Body() dto: SetSuperDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    if (id === me.id) throw new BadRequestException('You cannot change your own super-admin status');
    const u = await this.users.findOne({ where: { id }, relations: { organizations: true } });
    if (!u) throw new NotFoundException();
    u.isSuperAdmin = dto.isSuperAdmin;
    await this.users.save(u);
    await this.audit.log({ ...ctx, orgId: null }, 'update', 'user', id, `${u.username}: super admin ${dto.isSuperAdmin}`);
    return strip(u);
  }
}

@Controller('organizations') @PlatformOk()
export class OrganizationsController {
  constructor(
    @InjectRepository(Organization) private repo: Repository<Organization>,
    @InjectRepository(Client) private clients: Repository<Client>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Device) private devices: Repository<Device>,
    private audit: AuditService,
  ) {}

  @Get() async list(@CurrentUser() me: AuthUser) {
    requireSuper(me);
    const rows = await this.repo.find({ order: { name: 'ASC' } });
    return Promise.all(rows.map(async (o) => ({
      id: o.id, name: o.name, slug: o.slug, createdAt: o.createdAt, maxUsers: o.maxUsers, maxDevices: o.maxDevices,
      deviceCount: await this.devices.count({ where: devScope(o.id) }),
      clientCount: await this.clients.count({ where: { organizationId: o.id } }),
      userCount: await this.users.count({ where: { organizations: { id: o.id }, isSuperAdmin: false } }),
    })));
  }

  @Post() async create(@Body() dto: CreateOrgDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (await this.repo.findOne({ where: { name } })) throw new BadRequestException('Organisation name already exists');
    const o = await this.repo.save(this.repo.create({ name, logo: null, slug: await uniqueSlug(this.repo, name) }));
    const u = await this.users.findOneOrFail({ where: { id: me.id }, relations: { organizations: true } });
    u.organizations.push(o);
    await this.users.save(u);
    await this.audit.log(ctx, 'create', 'organization', o.id, o.name);
    return { id: o.id, name: o.name };
  }

  @Put(':id') async update(@Param('id', uuid()) id: string, @Body() dto: UpdateOrgDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    const o = await this.repo.findOne({ where: { id } });
    if (!o) throw new NotFoundException();
    const name = dto.name?.trim();
    if (dto.maxUsers !== undefined) o.maxUsers = dto.maxUsers;
    if (dto.maxDevices !== undefined) o.maxDevices = dto.maxDevices;
    if (name && name !== o.name) {
      if (await this.repo.findOne({ where: { name } })) throw new BadRequestException('Organisation name already exists');
      o.name = name;
    }
    await this.repo.save(o);
    await this.audit.log(ctx, 'update', 'organization', id, `${o.name}: limits ${o.maxUsers} users / ${o.maxDevices} devices`);
    return { id: o.id, name: o.name, maxUsers: o.maxUsers, maxDevices: o.maxDevices };
  }

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    if (id === me.orgId) throw new BadRequestException('Switch to another organisation before deleting this one');
    const o = await this.repo.findOne({ where: { id } });
    if (!o) throw new NotFoundException();
    if (await this.clients.exist({ where: { organizationId: id } })) throw new BadRequestException('Delete or move this organisation\'s clients first');
    await this.repo.remove(o);
    await this.audit.log(ctx, 'delete', 'organization', id, o.name);
  }
}

@Controller('settings')
export class SettingsController {
  constructor(
    @InjectRepository(AppSetting) private appSettings: Repository<AppSetting>,
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  /** Platform (super-admin) branding shown on the landing, login and signup pages. */
  @Public() @Get('platform')
  platform() { return this.readPlatform(); }

  @Put('platform') @PlatformOk()
  async updatePlatform(@Body() dto: UpdatePlatformDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    for (const [k, v] of Object.entries(dto)) {
      const key = `platform.${k}`;
      if (v === null || v === '') await this.appSettings.delete({ key });
      else await this.appSettings.save({ key, value: String(v).trim() });
    }
    await this.audit.log({ ...ctx, orgId: null }, 'update', 'settings', undefined, `platform: ${Object.keys(dto).join(',')}`);
    return this.readPlatform();
  }

  private async readPlatform() {
    const rows = await this.appSettings.find({ where: { key: In(['platform.name', 'platform.tagline', 'platform.logo', 'platform.accent', 'platform.theme']) } });
    const g = (k: string) => rows.find((r) => r.key === `platform.${k}`)?.value ?? null;
    return { name: g('name') || 'NETFETURE', tagline: g('tagline'), logo: g('logo'), accent: g('accent') || '#1d2433', theme: g('theme') === 'dark' ? 'dark' : 'light' };
  }

  /** Public branding for an organisation's own landing/login page (path /o/:slug or subdomain). */
  @Public() @Get('org/:slug')
  async orgBySlug(@Param('slug') slug: string) {
    const org = await this.orgs.findOne({ where: { slug: slug.toLowerCase() } });
    if (!org) throw new NotFoundException('Organisation not found');
    return { id: org.id, name: org.name, slug: org.slug, logo: org.logo };
  }

  /** Public so the login page can show a logo; uses the caller's organisation when a valid token is sent. */
  @Public() @Get('branding')
  async branding(@Req() req: Request) {
    const header = req.headers['authorization'] ?? '';
    let orgId: string | undefined;
    if (header.startsWith('Bearer ')) {
      try { orgId = (await this.jwt.verifyAsync<{ org?: string }>(header.slice(7))).org; } catch { /* anonymous */ }
    }
    const org = (orgId && (await this.orgs.findOne({ where: { id: orgId } }))) || (await this.orgs.find({ order: { createdAt: 'ASC' }, take: 1 }))[0];
    return { logo: org?.logo ?? null, companyName: org?.name ?? null };
  }

  @Put('branding') @Roles('admin')
  async updateBranding(@Body() dto: UpdateBrandingDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const org = await this.orgs.findOneOrFail({ where: { id: orgId } });
    if (dto.logo !== undefined) org.logo = dto.logo || null;
    const name = dto.companyName?.trim();
    if (name && name !== org.name) {
      if (await this.orgs.findOne({ where: { name } })) throw new BadRequestException('Organisation name already exists');
      org.name = name;
    }
    await this.orgs.save(org);
    await this.audit.log(ctx, 'update', 'settings', undefined, `branding: ${Object.keys(dto).join(',')}`);
    return { logo: org.logo, companyName: org.name };
  }
}

@Controller('snippets') @Roles('admin', 'engineer')
export class SnippetsController {
  constructor(
    @InjectRepository(ConfigSnippet) private repo: Repository<ConfigSnippet>,
    @InjectRepository(Device) private devices: Repository<Device>,
    private audit: AuditService,
  ) {}

  @Get() list(@Org() orgId: string, @Query('clientId') clientId?: string, @Query('deviceId') deviceId?: string) {
    return this.repo.find({
      where: { client: { organizationId: orgId }, ...(clientId ? { clientId } : {}), ...(deviceId ? { deviceId } : {}) },
      relations: { client: true, device: true },
      order: { name: 'ASC' },
    });
  }

  @Post()
  async create(@Body() dto: CreateSnippetDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const dev = await this.devices.findOne({ where: { id: dto.deviceId, ...devScope(orgId) } });
    if (!dev || dev.clientId !== dto.clientId) throw new BadRequestException('Device does not belong to that client');
    const s = await this.repo.save(this.repo.create(dto));
    await this.audit.log(ctx, 'create', 'config-snippet', s.id, `${s.name} (${dev.name})`);
    return s;
  }

  @Put(':id')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateSnippetDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const s = await this.repo.findOne({ where: { id, client: { organizationId: orgId } } });
    if (!s) throw new NotFoundException();
    if (dto.deviceId) {
      const dev = await this.devices.findOne({ where: { id: dto.deviceId, ...devScope(orgId) } });
      if (!dev || dev.clientId !== s.clientId) throw new BadRequestException('Device does not belong to the snippet client');
    }
    await this.repo.save(Object.assign(s, dto));
    await this.audit.log(ctx, 'update', 'config-snippet', id, s.name);
    return s;
  }

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const s = await this.repo.findOne({ where: { id, client: { organizationId: orgId } } });
    if (!s) throw new NotFoundException();
    await this.repo.remove(s);
    await this.audit.log(ctx, 'delete', 'config-snippet', id, s.name);
  }
}

@Controller('users') @Roles('admin')
export class UsersController {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    private audit: AuditService,
  ) {}

  private async member(id: string, orgId: string, me: AuthUser) {
    const u = await this.repo.findOne({ where: { id, organizations: { id: orgId } } });
    if (!u) throw new NotFoundException();
    if (u.isSuperAdmin && !me.isSuperAdmin) throw new ForbiddenException('Only a super admin can modify a super admin');
    return this.repo.findOneOrFail({ where: { id }, relations: { organizations: true } });
  }

  @Get() async list(@Org() orgId: string) {
    const rows = await this.repo.find({ where: { organizations: { id: orgId } }, order: { username: 'ASC' } });
    const full = await this.repo.find({ where: { id: In(rows.map((r) => r.id)) }, relations: { organizations: true }, order: { username: 'ASC' } });
    return full.map(strip);
  }

  @Post() async create(@Body() dto: CreateUserDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    if (await this.repo.findOne({ where: { username: dto.username } })) throw new BadRequestException('Username taken');
    const org = await this.orgs.findOneOrFail({ where: { id: orgId } });
    const used = await this.repo.count({ where: { organizations: { id: orgId }, isSuperAdmin: false } });
    if (used >= org.maxUsers) throw new ForbiddenException(`User limit reached (${org.maxUsers}). Ask the platform administrator to raise it.`);
    const u = await this.repo.save(this.repo.create({
      username: dto.username, role: dto.role as User['role'], passwordHash: await bcrypt.hash(dto.password, 12), organizations: [org],
    }));
    await this.audit.log(ctx, 'create', 'user', u.id, `${u.username} (${u.role})`);
    return strip(u);
  }

  @Put(':id/organizations')
  async setOrgs(@Param('id', uuid()) id: string, @Body() dto: SetUserOrgsDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    requireSuper(me);
    const u = await this.repo.findOne({ where: { id }, relations: { organizations: true } });
    if (!u) throw new NotFoundException();
    const orgs = await this.orgs.find({ where: { id: In(dto.organizationIds) } });
    if (orgs.length !== new Set(dto.organizationIds).size) throw new BadRequestException('Unknown organisation');
    u.organizations = orgs;
    await this.repo.save(u);
    await this.audit.log(ctx, 'update', 'user', id, `${u.username}: organisations ${orgs.map((o) => o.name).join(', ')}`);
    return strip(u);
  }

  @Put(':id') async update(@Param('id', uuid()) id: string, @Body() dto: UpdateUserDto, @Org() orgId: string, @Ctx() ctx: ReqCtx, @CurrentUser() me: AuthUser) {
    const u = await this.member(id, orgId, me);
    if (id === me.id && (dto.active === false || (dto.role && dto.role !== 'admin'))) {
      throw new BadRequestException('You cannot demote or deactivate yourself');
    }
    if (dto.username && dto.username !== u.username) {
      if (await this.repo.findOne({ where: { username: dto.username } })) throw new BadRequestException('Username taken');
      u.username = dto.username;
    }
    if (dto.role) u.role = dto.role as User['role'];
    if (dto.active !== undefined) u.active = dto.active;
    if (dto.password) u.passwordHash = await bcrypt.hash(dto.password, 12);
    await this.repo.save(u);
    await this.audit.log(ctx, 'update', 'user', id, `${u.username}: ${Object.keys(dto).join(',')}`);
    return strip(u);
  }

  /** Removes the user from this organisation; the account itself is deleted once it belongs to none. */
  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx, @CurrentUser() me: AuthUser) {
    if (id === me.id) throw new BadRequestException('You cannot delete yourself');
    const u = await this.member(id, orgId, me);
    u.organizations = u.organizations.filter((o) => o.id !== orgId);
    if (u.organizations.length > 0 || u.isSuperAdmin) {
      await this.repo.save(u);
      await this.audit.log(ctx, 'update', 'user', id, `${u.username}: removed from organisation`);
      return;
    }
    await this.repo.remove(u);
    await this.audit.log(ctx, 'delete', 'user', id, u.username);
  }
}

@Controller('clients')
export class ClientsController {
  constructor(
    @InjectRepository(Client) private repo: Repository<Client>,
    @InjectRepository(Device) private devices: Repository<Device>,
    private audit: AuditService,
  ) {}

  @Get() async list(@Org() orgId: string) {
    const rows = await this.repo.createQueryBuilder('c')
      .where('c.organizationId = :orgId', { orgId })
      .loadRelationCountAndMap('c.deviceCount', 'c.devices').orderBy('c.name').getMany();
    const counts = rows.length
      ? await this.devices.createQueryBuilder('d')
        .select('d.clientId', 'clientId')
        .addSelect('d.type', 'type')
        .addSelect('COUNT(DISTINCT d.id)', 'deviceCount')
        .addSelect('COUNT(vm.id)', 'vmCount')
        .leftJoin('d.vms', 'vm')
        .where('d.clientId IN (:...clientIds)', { clientIds: rows.map((client) => client.id) })
        .groupBy('d.clientId')
        .addGroupBy('d.type')
        .orderBy('d.type')
        .getRawMany<{ clientId: string; type: string; deviceCount: string; vmCount: string }>()
      : [];
    const countsByClient = new Map<string, { vmCount: number; deviceTypeCounts: { type: string; count: number }[] }>();
    for (const { clientId, type, deviceCount, vmCount } of counts) {
      let summary = countsByClient.get(clientId);
      if (!summary) {
        summary = { vmCount: 0, deviceTypeCounts: [] };
        countsByClient.set(clientId, summary);
      }
      summary.vmCount += Number(vmCount);
      summary.deviceTypeCounts.push({ type, count: Number(deviceCount) });
    }
    return rows.map((client) => ({
      ...client,
      vmCount: countsByClient.get(client.id)?.vmCount ?? 0,
      deviceTypeCounts: countsByClient.get(client.id)?.deviceTypeCounts ?? [],
    }));
  }

  @Get(':id') async one(@Param('id', uuid()) id: string, @Org() orgId: string) {
    const c = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!c) throw new NotFoundException();
    const devices = await this.devices.find({ where: { clientId: id }, relations: { vms: true }, order: { name: 'ASC' } });
    return { ...c, devices };
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateClientDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.save(this.repo.create({ ...dto, organizationId: orgId }));
    await this.audit.log(ctx, 'create', 'client', c.id, c.name);
    return c;
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateClientDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!c) throw new NotFoundException();
    await this.repo.save(Object.assign(c, dto));
    await this.audit.log(ctx, 'update', 'client', id, c.name);
    return c;
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.findOne({ where: { id, organizationId: orgId } });
    if (!c) throw new NotFoundException();
    await this.repo.remove(c);
    await this.audit.log(ctx, 'delete', 'client', id, c.name);
  }
}

@Controller('devices')
export class DevicesController {
  constructor(
    @InjectRepository(Device) private repo: Repository<Device>,
    @InjectRepository(Client) private clients: Repository<Client>,
    @InjectRepository(Organization) private orgs: Repository<Organization>,
    private snmp: SnmpService,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  @Get() list(@Org() orgId: string, @Query('clientId') clientId?: string) {
    return this.repo.find({ where: { ...(clientId ? { clientId } : {}), ...devScope(orgId) }, relations: { vms: true }, order: { name: 'ASC' } });
  }

  @Get(':id') async one(@Param('id', uuid()) id: string, @Org() orgId: string) {
    const d = await this.repo.findOne({ where: { id, ...devScope(orgId) }, relations: { vms: true } });
    if (!d) throw new NotFoundException();
    return d;
  }

  @Post(':id/check') @HttpCode(200)
  async check(@Param('id', uuid()) id: string, @Org() orgId: string) {
    if (!(await this.repo.exist({ where: { id, ...devScope(orgId) } }))) throw new NotFoundException();
    return this.snmp.check(id);
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateDeviceDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    if (!(await this.clients.exist({ where: { id: dto.clientId, organizationId: orgId } }))) throw new BadRequestException('Unknown client');
    const org = await this.orgs.findOneOrFail({ where: { id: orgId } });
    if ((await this.repo.count({ where: devScope(orgId) })) >= org.maxDevices) {
      throw new ForbiddenException(`Device limit reached (${org.maxDevices}). Ask the platform administrator to raise it.`);
    }
    const { snmpCommunity, ...rest } = dto;
    if (rest.snmpEnabled) assertSnmpHost(rest.host);
    const d = await this.repo.save(this.repo.create({ ...rest, ...(snmpCommunity ? { snmpCommunityEnc: this.crypto.encrypt(snmpCommunity) } : {}) }));
    delete (d as Partial<Device>).snmpCommunityEnc;
    await this.audit.log(ctx, 'create', 'device', d.id, `${d.name} (${d.type})`);
    return d;
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateDeviceDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const d = await this.repo.findOne({ where: { id, ...devScope(orgId) } });
    if (!d) throw new NotFoundException();
    const { clientId: _ignored, snmpCommunity, ...rest } = dto;
    Object.assign(d, rest);
    if (snmpCommunity) d.snmpCommunityEnc = this.crypto.encrypt(snmpCommunity);
    if (d.snmpEnabled) assertSnmpHost(d.host);
    else { d.status = null; d.statusInfo = null; d.statusCheckedAt = null; }
    await this.repo.save(d);
    delete (d as Partial<Device>).snmpCommunityEnc;
    await this.audit.log(ctx, 'update', 'device', id, d.name);
    return d;
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const d = await this.repo.findOne({ where: { id, ...devScope(orgId) } });
    if (!d) throw new NotFoundException();
    await this.repo.remove(d);
    await this.audit.log(ctx, 'delete', 'device', id, d.name);
  }
}

@Controller('vms')
export class VmsController {
  constructor(
    @InjectRepository(Vm) private repo: Repository<Vm>,
    @InjectRepository(Device) private devices: Repository<Device>,
    private audit: AuditService,
  ) {}

  @Get() list(@Org() orgId: string, @Query('deviceId') deviceId?: string) {
    return this.repo.find({ where: { ...(deviceId ? { deviceId } : {}), ...vmScope(orgId) }, order: { name: 'ASC' } });
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateVmDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const host = await this.devices.findOne({ where: { id: dto.deviceId, ...devScope(orgId) } });
    if (!host) throw new BadRequestException('Unknown hypervisor');
    if (host.type !== 'hypervisor') throw new BadRequestException('VMs can only belong to a hypervisor');
    const v = await this.repo.save(this.repo.create(dto));
    await this.audit.log(ctx, 'create', 'vm', v.id, v.name);
    return v;
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateVmDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const v = await this.repo.findOne({ where: { id, ...vmScope(orgId) } });
    if (!v) throw new NotFoundException();
    const { deviceId: _ignored, ...rest } = dto;
    await this.repo.save(Object.assign(v, rest));
    await this.audit.log(ctx, 'update', 'vm', id, v.name);
    return v;
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const v = await this.repo.findOne({ where: { id, ...vmScope(orgId) } });
    if (!v) throw new NotFoundException();
    await this.repo.remove(v);
    await this.audit.log(ctx, 'delete', 'vm', id, v.name);
  }
}

const maskCred = (c: Credential) => {
  const { passwordEnc, ...rest } = c;
  return { ...rest, password: '••••••••' };
};

@Controller('credentials')
export class CredentialsController {
  constructor(
    @InjectRepository(Credential) private repo: Repository<Credential>,
    @InjectRepository(Device) private devices: Repository<Device>,
    @InjectRepository(Vm) private vms: Repository<Vm>,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  @Get() list(@Org() orgId: string, @Query('deviceId') deviceId?: string, @Query('vmId') vmId?: string) {
    if (!deviceId && !vmId) throw new BadRequestException('deviceId or vmId required');
    const target = deviceId ? { deviceId } : { vmId };
    return this.repo.find({ where: credScope(orgId).map((s) => ({ ...target, ...s })), order: { username: 'ASC' } }).then((r) => r.map(maskCred));
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateCredentialDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    if (!!dto.deviceId === !!dto.vmId) throw new BadRequestException('Provide exactly one of deviceId or vmId');
    const exists = dto.deviceId
      ? await this.devices.exist({ where: { id: dto.deviceId, ...devScope(orgId) } })
      : await this.vms.exist({ where: { id: dto.vmId, ...vmScope(orgId) } });
    if (!exists) throw new BadRequestException('Unknown target');
    const c = await this.repo.save(this.repo.create({
      deviceId: dto.deviceId ?? null, vmId: dto.vmId ?? null, username: dto.username,
      type: dto.type, notes: dto.notes ?? null, passwordEnc: this.crypto.encrypt(dto.password),
    }));
    await this.audit.log(ctx, 'create', 'credential', c.id, `${c.username} (${c.type})`);
    return maskCred(c);
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateCredentialDto, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.findOne({ where: credScope(orgId).map((s) => ({ id, ...s })) });
    if (!c) throw new NotFoundException();
    const { password, ...rest } = dto;
    Object.assign(c, rest);
    if (password) c.passwordEnc = this.crypto.encrypt(password);
    await this.repo.save(c);
    await this.audit.log(ctx, 'update', 'credential', id, `${c.username}${password ? ' (password changed)' : ''}`);
    return maskCred(c);
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.findOne({ where: credScope(orgId).map((s) => ({ id, ...s })) });
    if (!c) throw new NotFoundException();
    await this.repo.remove(c);
    await this.audit.log(ctx, 'delete', 'credential', id, c.username);
  }

  @Post(':id/reveal') @Roles('admin', 'engineer') @HttpCode(200)
  async reveal(@Param('id', uuid()) id: string, @Org() orgId: string, @Ctx() ctx: ReqCtx, @Res({ passthrough: true }) res: Response) {
    const c = await this.repo.findOne({ where: credScope(orgId).map((s) => ({ id, ...s })) });
    if (!c) throw new NotFoundException();
    await this.audit.log(ctx, 'reveal-password', 'credential', id, c.username);
    res.setHeader('Cache-Control', 'no-store');
    return { password: this.crypto.decrypt(c.passwordEnc) };
  }
}

@Controller('exec') @Roles('admin', 'engineer')
export class ExecController {
  constructor(
    @InjectRepository(Credential) private creds: Repository<Credential>,
    @InjectRepository(Device) private devices: Repository<Device>,
    @InjectRepository(Vm) private vms: Repository<Vm>,
    private crypto: CryptoService,
    private ssh: SshService,
    private audit: AuditService,
  ) {}

  @Post() @HttpCode(200)
  async run(@Body() dto: ExecDto, @Ctx() ctx: ReqCtx, @CurrentUser() user: AuthUser) {
    const cred = await this.creds.findOne({ where: credScope(user.orgId!).map((s) => ({ id: dto.credentialId, ...s })) });
    if (!cred) throw new NotFoundException('Credential not found');
    let host: string | null = null;
    let port = 22;
    let label: string;
    if (cred.vmId) {
      const vm = await this.vms.findOneOrFail({ where: { id: cred.vmId } });
      host = vm.ip; label = `vm:${vm.name}`;
    } else {
      const dev = await this.devices.findOneOrFail({ where: { id: cred.deviceId! } });
      host = dev.host; label = `device:${dev.name}`;
      if (cred.type === 'ssh' && dev.port) port = dev.port;
    }
    if (!host) throw new BadRequestException('Target has no IP/host');

    const verdict = checkCommand(user.role, dto.command);
    if (!verdict.allowed) {
      await this.audit.log(ctx, 'command-run', 'credential', cred.id, `DENIED on ${label}: ${dto.command}`);
      throw new ForbiddenException(verdict.reason);
    }
    await this.audit.log(ctx, 'command-run', 'credential', cred.id, `on ${label}: ${dto.command}`);
    try {
      const result = await this.ssh.run(
        { host, port, username: cred.username, password: this.crypto.decrypt(cred.passwordEnc) },
        dto.command,
      );
      return { target: label, ...result };
    } catch (e) {
      throw new BadGatewayException(`SSH failed: ${(e as Error).message}`);
    }
  }
}

@Controller('audit') @Roles('admin')
export class AuditController {
  constructor(@InjectRepository(AuditLog) private repo: Repository<AuditLog>) {}

  @Get() async list(@Org() orgId: string, @Query('action') action?: string, @Query('limit') limit = '100', @Query('offset') offset = '0') {
    const [items, total] = await this.repo.findAndCount({
      where: { organizationId: orgId, ...(action ? { action } : {}) },
      order: { timestamp: 'DESC' },
      take: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500),
      skip: Math.max(parseInt(offset, 10) || 0, 0),
    });
    return { items, total };
  }
}

@Controller('search')
export class SearchController {
  constructor(
    @InjectRepository(Client) private clients: Repository<Client>,
    @InjectRepository(Device) private devices: Repository<Device>,
    @InjectRepository(Vm) private vms: Repository<Vm>,
  ) {}

  @Get() async search(@Org() orgId: string, @Query('q') q = '') {
    q = q.trim();
    if (q.length < 2) return [];
    const like = ILike(`%${escapeLike(q)}%`);
    const [cs, ds, vs] = await Promise.all([
      this.clients.find({ where: [{ name: like }, { contact: like }].map((w) => ({ ...w, organizationId: orgId })), take: 10 }),
      this.devices.find({ where: [{ name: like }, { host: like }, { os: like }].map((w) => ({ ...w, ...devScope(orgId) })), take: 20 }),
      this.vms.find({ where: [{ name: like }, { ip: like }, { purpose: like }].map((w) => ({ ...w, ...vmScope(orgId) })), relations: { device: true }, take: 20 }),
    ]);
    return [
      ...cs.map((c) => ({ type: 'client', id: c.id, name: c.name, clientId: c.id, detail: c.contact })),
      ...ds.map((d) => ({ type: 'device', id: d.id, name: d.name, clientId: d.clientId, detail: `${d.type} ${d.host ?? ''}` })),
      ...vs.map((v) => ({ type: 'vm', id: v.id, name: v.name, clientId: v.device.clientId, detail: `${v.ip ?? ''} ${v.purpose ?? ''}` })),
    ];
  }
}
