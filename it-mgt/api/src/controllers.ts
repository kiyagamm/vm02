import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException,
  Param, ParseUUIDPipe, Post, Put, Query, Res, UnauthorizedException, BadGatewayException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { ILike, Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuthUser, Ctx, CurrentUser, Public, ReqCtx, Roles } from './auth';
import { checkCommand } from './command-policy';
import { CryptoService } from './crypto.service';
import {
  CreateClientDto, CreateCredentialDto, CreateDeviceDto, CreateSnippetDto, CreateUserDto, CreateVmDto, ExecDto, LoginDto,
  UpdateBrandingDto, UpdateClientDto, UpdateCredentialDto, UpdateDeviceDto, UpdateProfileDto, UpdateSnippetDto, UpdateUserDto, UpdateVmDto,
} from './dto';
import { AppSetting, AuditLog, Client, ConfigSnippet, Credential, Device, User, Vm } from './entities';
import { SshService } from './ssh.service';

const uuid = () => new ParseUUIDPipe();
const strip = (u: User) => ({ id: u.id, username: u.username, role: u.role, active: u.active, createdAt: u.createdAt });
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Ctx() ctx: ReqCtx) {
    const user = await this.users.findOne({ where: { username: dto.username } });
    const ok = user && user.active && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!ok) {
      await this.audit.log({ ...ctx, username: dto.username }, 'login-failed', 'user');
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.audit.log({ ...ctx, userId: user.id, username: user.username }, 'login', 'user', user.id);
    const token = await this.jwt.signAsync({ sub: user.id, username: user.username, role: user.role });
    return { token, user: strip(user) };
  }

  @Get('me') me(@CurrentUser() u: AuthUser) { return u; }

  @Put('me')
  async updateMe(@Body() dto: UpdateProfileDto, @CurrentUser() me: AuthUser, @Ctx() ctx: ReqCtx) {
    const u = await this.users.findOne({ where: { id: me.id } });
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
    return strip(u);
  }
}

@Controller('settings')
export class SettingsController {
  constructor(@InjectRepository(AppSetting) private repo: Repository<AppSetting>, private audit: AuditService) {}

  @Public() @Get('branding')
  async branding() {
    const rows = await this.repo.find({ where: [{ key: 'logo' }, { key: 'companyName' }] });
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
    return { logo: get('logo'), companyName: get('companyName') };
  }

  @Put('branding') @Roles('admin')
  async updateBranding(@Body() dto: UpdateBrandingDto, @Ctx() ctx: ReqCtx) {
    for (const key of ['logo', 'companyName'] as const) {
      if (dto[key] !== undefined) await this.repo.save({ key, value: dto[key] || null });
    }
    await this.audit.log(ctx, 'update', 'settings', undefined, `branding: ${Object.keys(dto).join(',')}`);
    return this.branding();
  }
}

@Controller('snippets') @Roles('admin', 'engineer')
export class SnippetsController {
  constructor(
    @InjectRepository(ConfigSnippet) private repo: Repository<ConfigSnippet>,
    @InjectRepository(Device) private devices: Repository<Device>,
    private audit: AuditService,
  ) {}

  @Get() list(@Query('clientId') clientId?: string, @Query('deviceId') deviceId?: string) {
    return this.repo.find({
      where: { ...(clientId ? { clientId } : {}), ...(deviceId ? { deviceId } : {}) },
      relations: { client: true, device: true },
      order: { name: 'ASC' },
    });
  }

  @Post()
  async create(@Body() dto: CreateSnippetDto, @Ctx() ctx: ReqCtx) {
    const dev = await this.devices.findOne({ where: { id: dto.deviceId } });
    if (!dev || dev.clientId !== dto.clientId) throw new BadRequestException('Device does not belong to that client');
    const s = await this.repo.save(this.repo.create(dto));
    await this.audit.log(ctx, 'create', 'config-snippet', s.id, `${s.name} (${dev.name})`);
    return s;
  }

  @Put(':id')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateSnippetDto, @Ctx() ctx: ReqCtx) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException();
    if (dto.deviceId) {
      const dev = await this.devices.findOne({ where: { id: dto.deviceId } });
      if (!dev || dev.clientId !== s.clientId) throw new BadRequestException('Device does not belong to the snippet client');
    }
    await this.repo.save(Object.assign(s, dto));
    await this.audit.log(ctx, 'update', 'config-snippet', id, s.name);
    return s;
  }

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException();
    await this.repo.remove(s);
    await this.audit.log(ctx, 'delete', 'config-snippet', id, s.name);
  }
}

@Controller('users') @Roles('admin')
export class UsersController {
  constructor(@InjectRepository(User) private repo: Repository<User>, private audit: AuditService) {}

  @Get() async list() { return (await this.repo.find({ order: { username: 'ASC' } })).map(strip); }

  @Post() async create(@Body() dto: CreateUserDto, @Ctx() ctx: ReqCtx) {
    if (await this.repo.findOne({ where: { username: dto.username } })) throw new BadRequestException('Username taken');
    const u = await this.repo.save(this.repo.create({
      username: dto.username, role: dto.role as User['role'], passwordHash: await bcrypt.hash(dto.password, 12),
    }));
    await this.audit.log(ctx, 'create', 'user', u.id, `${u.username} (${u.role})`);
    return strip(u);
  }

  @Put(':id') async update(@Param('id', uuid()) id: string, @Body() dto: UpdateUserDto, @Ctx() ctx: ReqCtx, @CurrentUser() me: AuthUser) {
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException();
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

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx, @CurrentUser() me: AuthUser) {
    if (id === me.id) throw new BadRequestException('You cannot delete yourself');
    const u = await this.repo.findOne({ where: { id } });
    if (!u) throw new NotFoundException();
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

  @Get() async list() {
    const rows = await this.repo.createQueryBuilder('c')
      .loadRelationCountAndMap('c.deviceCount', 'c.devices').orderBy('c.name').getMany();
    return rows;
  }

  @Get(':id') async one(@Param('id', uuid()) id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException();
    const devices = await this.devices.find({ where: { clientId: id }, relations: { vms: true }, order: { name: 'ASC' } });
    return { ...c, devices };
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateClientDto, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.save(this.repo.create(dto));
    await this.audit.log(ctx, 'create', 'client', c.id, c.name);
    return c;
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateClientDto, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException();
    await this.repo.save(Object.assign(c, dto));
    await this.audit.log(ctx, 'update', 'client', id, c.name);
    return c;
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.findOne({ where: { id } });
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
    private audit: AuditService,
  ) {}

  @Get() list(@Query('clientId') clientId?: string) {
    return this.repo.find({ where: clientId ? { clientId } : {}, relations: { vms: true }, order: { name: 'ASC' } });
  }

  @Get(':id') async one(@Param('id', uuid()) id: string) {
    const d = await this.repo.findOne({ where: { id }, relations: { vms: true } });
    if (!d) throw new NotFoundException();
    return d;
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateDeviceDto, @Ctx() ctx: ReqCtx) {
    if (!(await this.clients.exist({ where: { id: dto.clientId } }))) throw new BadRequestException('Unknown client');
    const d = await this.repo.save(this.repo.create(dto));
    await this.audit.log(ctx, 'create', 'device', d.id, `${d.name} (${d.type})`);
    return d;
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateDeviceDto, @Ctx() ctx: ReqCtx) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException();
    const { clientId: _ignored, ...rest } = dto;
    await this.repo.save(Object.assign(d, rest));
    await this.audit.log(ctx, 'update', 'device', id, d.name);
    return d;
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    const d = await this.repo.findOne({ where: { id } });
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

  @Get() list(@Query('deviceId') deviceId?: string) {
    return this.repo.find({ where: deviceId ? { deviceId } : {}, order: { name: 'ASC' } });
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateVmDto, @Ctx() ctx: ReqCtx) {
    const host = await this.devices.findOne({ where: { id: dto.deviceId } });
    if (!host) throw new BadRequestException('Unknown hypervisor');
    if (host.type !== 'hypervisor') throw new BadRequestException('VMs can only belong to a hypervisor');
    const v = await this.repo.save(this.repo.create(dto));
    await this.audit.log(ctx, 'create', 'vm', v.id, v.name);
    return v;
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateVmDto, @Ctx() ctx: ReqCtx) {
    const v = await this.repo.findOne({ where: { id } });
    if (!v) throw new NotFoundException();
    const { deviceId: _ignored, ...rest } = dto;
    await this.repo.save(Object.assign(v, rest));
    await this.audit.log(ctx, 'update', 'vm', id, v.name);
    return v;
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    const v = await this.repo.findOne({ where: { id } });
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

  @Get() list(@Query('deviceId') deviceId?: string, @Query('vmId') vmId?: string) {
    if (!deviceId && !vmId) throw new BadRequestException('deviceId or vmId required');
    return this.repo.find({ where: deviceId ? { deviceId } : { vmId }, order: { username: 'ASC' } }).then((r) => r.map(maskCred));
  }

  @Post() @Roles('admin', 'engineer')
  async create(@Body() dto: CreateCredentialDto, @Ctx() ctx: ReqCtx) {
    if (!!dto.deviceId === !!dto.vmId) throw new BadRequestException('Provide exactly one of deviceId or vmId');
    const exists = dto.deviceId
      ? await this.devices.exist({ where: { id: dto.deviceId } })
      : await this.vms.exist({ where: { id: dto.vmId } });
    if (!exists) throw new BadRequestException('Unknown target');
    const c = await this.repo.save(this.repo.create({
      deviceId: dto.deviceId ?? null, vmId: dto.vmId ?? null, username: dto.username,
      type: dto.type, notes: dto.notes ?? null, passwordEnc: this.crypto.encrypt(dto.password),
    }));
    await this.audit.log(ctx, 'create', 'credential', c.id, `${c.username} (${c.type})`);
    return maskCred(c);
  }

  @Put(':id') @Roles('admin', 'engineer')
  async update(@Param('id', uuid()) id: string, @Body() dto: UpdateCredentialDto, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException();
    const { password, ...rest } = dto;
    Object.assign(c, rest);
    if (password) c.passwordEnc = this.crypto.encrypt(password);
    await this.repo.save(c);
    await this.audit.log(ctx, 'update', 'credential', id, `${c.username}${password ? ' (password changed)' : ''}`);
    return maskCred(c);
  }

  @Delete(':id') @Roles('admin') @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException();
    await this.repo.remove(c);
    await this.audit.log(ctx, 'delete', 'credential', id, c.username);
  }

  @Post(':id/reveal') @Roles('admin', 'engineer') @HttpCode(200)
  async reveal(@Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx, @Res({ passthrough: true }) res: Response) {
    const c = await this.repo.findOne({ where: { id } });
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
    const cred = await this.creds.findOne({ where: { id: dto.credentialId } });
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

  @Get() async list(@Query('action') action?: string, @Query('limit') limit = '100', @Query('offset') offset = '0') {
    const [items, total] = await this.repo.findAndCount({
      where: action ? { action } : {},
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

  @Get() async search(@Query('q') q = '') {
    q = q.trim();
    if (q.length < 2) return [];
    const like = ILike(`%${escapeLike(q)}%`);
    const [cs, ds, vs] = await Promise.all([
      this.clients.find({ where: [{ name: like }, { contact: like }], take: 10 }),
      this.devices.find({ where: [{ name: like }, { host: like }, { os: like }], take: 20 }),
      this.vms.find({ where: [{ name: like }, { ip: like }, { purpose: like }], relations: { device: true }, take: 20 }),
    ]);
    return [
      ...cs.map((c) => ({ type: 'client', id: c.id, name: c.name, clientId: c.id, detail: c.contact })),
      ...ds.map((d) => ({ type: 'device', id: d.id, name: d.name, clientId: d.clientId, detail: `${d.type} ${d.host ?? ''}` })),
      ...vs.map((v) => ({ type: 'vm', id: v.id, name: v.name, clientId: v.device.clientId, detail: `${v.ip ?? ''} ${v.purpose ?? ''}` })),
    ];
  }
}
