import { Controller, Get } from '@nestjs/common';
import { Org } from './auth';
import { EquipmentReportService } from './equipment-report.service';

@Controller('reports')
export class ReportsController {
  constructor(private equipment: EquipmentReportService) {}

  @Get('equipment')
  async equipmentList(@Org() orgId: string) {
    const entries = await this.equipment.list(orgId);
    return entries.map(({ id, name, serialNumber, assetTag, brand, model, dateReceived, notes, createdAt, delivered, deliveredTo }) =>
      ({ id, name, serialNumber, assetTag, brand, model, dateReceived, notes, createdAt, delivered, deliveredTo }));
  }
}
