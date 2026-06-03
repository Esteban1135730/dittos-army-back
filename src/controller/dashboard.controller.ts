import { Controller, Get } from '@nestjs/common';
import { DashboardOverviewService } from '../service/dashboard-overview.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardOverviewService: DashboardOverviewService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.dashboardOverviewService.getOverview();
  }
}
