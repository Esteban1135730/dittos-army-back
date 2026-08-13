import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { MetricsAnalyticsService } from '../service/metrics-analytics.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsAnalyticsService: MetricsAnalyticsService,
  ) {}

  @Get('analytics')
  getAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metricsAnalyticsService.getAnalytics({ from, to });
  }
}
