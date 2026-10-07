import { Controller, Get, Query } from '@nestjs/common';
import { MetricsAnalyticsService } from '../service/metrics-analytics.service';
import { StockPvpBenchmarkService } from '../service/stock-pvp-benchmark.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsAnalyticsService: MetricsAnalyticsService,
    private readonly stockPvpBenchmarkService: StockPvpBenchmarkService,
  ) {}

  @Get('analytics')
  getAnalytics(@Query('from') from?: string, @Query('to') to?: string) {
    return this.metricsAnalyticsService.getAnalytics({ from, to });
  }

  /** Stock del owner activo vs ventas (Pablo+Esteban en Pokémon) y PVP cruzado. */
  @Get('stock-pvp-benchmark')
  getStockPvpBenchmark(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.stockPvpBenchmarkService.getBenchmark({ from, to });
  }
}
