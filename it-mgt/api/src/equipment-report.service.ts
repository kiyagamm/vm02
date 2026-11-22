import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetMovement, EquipmentEntry } from './entities';

@Injectable()
export class EquipmentReportService {
  constructor(
    @InjectRepository(EquipmentEntry) private repo: Repository<EquipmentEntry>,
    @InjectRepository(AssetMovement) private movements: Repository<AssetMovement>,
  ) {}

  async list(orgId: string) {
    const [entries, movements] = await Promise.all([
      this.repo.find({ where: { organizationId: orgId }, order: { createdAt: 'DESC' } }),
      this.movements.find({ where: { organizationId: orgId }, order: { movementDate: 'DESC', createdAt: 'DESC', id: 'DESC' } }),
    ]);
    const latest = new Map<string, AssetMovement>();
    for (const movement of movements) {
      for (const asset of [movement, ...(movement.additionalAssets ?? [])]) {
        const serial = asset.serialNumber.trim().toUpperCase();
        if (serial && !latest.has(serial)) latest.set(serial, movement);
      }
    }
    return entries.map((entry) => {
      const movement = latest.get(entry.serialNumber.trim().toUpperCase());
      const delivered = movement?.direction === 'outbound';
      return { ...entry, delivered, deliveredTo: delivered ? movement.destination : null };
    });
  }
}
