import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoService } from './crypto.service';
import { Device } from './entities';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const snmp = require('net-snmp');

const OIDS = ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.3.0', '1.3.6.1.2.1.1.5.0'];

export interface SnmpResult { status: 'up' | 'down'; info: { sysName?: string; sysDescr?: string; uptime?: string; error?: string } }

/** Reject targets that would let a tenant probe the API host itself. */
export function assertSnmpHost(host: string | null | undefined) {
  const h = (host ?? '').trim().toLowerCase();
  if (!h) throw new BadRequestException('Set the device IP / host to monitor it with SNMP');
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || /^127\./.test(h) || /^169\.254\./.test(h)) {
    throw new BadRequestException('That address cannot be monitored');
  }
}

function formatUptime(ticks: number): string {
  const s = Math.floor(ticks / 100);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

@Injectable()
export class SnmpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SNMP');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectRepository(Device) private devices: Repository<Device>,
    private crypto: CryptoService,
  ) {}

  onModuleInit() {
    if (process.env.SNMP_MONITOR === 'off') return;
    const every = Math.max(30, Number(process.env.SNMP_INTERVAL_SECONDS ?? 120)) * 1000;
    this.timer = setInterval(() => void this.pollAll(), every);
    setTimeout(() => void this.pollAll(), 15000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  query(host: string, community: string, version: string, port: number): Promise<SnmpResult> {
    return new Promise((resolve) => {
      const session = snmp.createSession(host, community, {
        port, retries: 1, timeout: 3000, version: version === '1' ? snmp.Version1 : snmp.Version2c,
      });
      session.on('error', () => {});
      session.get(OIDS, (err: Error | null, vbs: any[]) => {
        session.close();
        if (err) return resolve({ status: 'down', info: { error: err.message } });
        const bad = vbs.find((v) => snmp.isVarbindError(v));
        if (bad) return resolve({ status: 'down', info: { error: snmp.varbindError(bad) } });
        resolve({ status: 'up', info: { sysDescr: String(vbs[0].value), uptime: formatUptime(Number(vbs[1].value)), sysName: String(vbs[2].value) } });
      });
    });
  }

  /** Polls one device and stores the outcome. */
  async check(deviceId: string): Promise<Device | null> {
    const d = await this.devices.createQueryBuilder('d').addSelect('d.snmpCommunityEnc').where('d.id = :id', { id: deviceId }).getOne();
    if (!d) return null;
    if (!d.snmpEnabled) throw new BadRequestException('SNMP monitoring is not enabled for this device');
    assertSnmpHost(d.host);
    let community = 'public';
    try { if (d.snmpCommunityEnc) community = this.crypto.decrypt(d.snmpCommunityEnc); } catch { /* keep default */ }
    const r = await this.query(d.host!, community, d.snmpVersion, d.snmpPort ?? 161);
    await this.devices.update(d.id, { status: r.status, statusInfo: r.info, statusCheckedAt: new Date() });
    return this.devices.findOne({ where: { id: d.id } });
  }

  private async pollAll() {
    if (this.running) return;
    this.running = true;
    try {
      const list = await this.devices.find({ where: { snmpEnabled: true }, select: { id: true } });
      for (let i = 0; i < list.length; i += 10) {
        await Promise.all(list.slice(i, i + 10).map((d) => this.check(d.id).catch((e) => this.logger.debug(`${d.id}: ${e.message}`))));
      }
    } catch (e) {
      this.logger.warn(`poll failed: ${(e as Error).message}`);
    } finally { this.running = false; }
  }
}
