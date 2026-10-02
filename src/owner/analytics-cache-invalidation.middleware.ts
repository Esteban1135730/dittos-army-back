import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DashboardOverviewService } from '../service/dashboard-overview.service';
import { MetricsAnalyticsService } from '../service/metrics-analytics.service';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Tras cualquier petición mutante terminada con éxito (status < 400) vacía las
 * cachés de dashboard y métricas de todos los owners: algunas escrituras cruzan
 * owners y recalcular es barato frente a mostrar datos viejos.
 */
@Injectable()
export class AnalyticsCacheInvalidationMiddleware implements NestMiddleware {
  constructor(
    private readonly dashboardOverviewService: DashboardOverviewService,
    private readonly metricsAnalyticsService: MetricsAnalyticsService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (!READ_ONLY_METHODS.has(String(req.method).toUpperCase())) {
      res.once('finish', () => {
        if (res.statusCode < 400) {
          this.dashboardOverviewService.invalidateCache();
          this.metricsAnalyticsService.invalidateCache();
        }
      });
    }
    next();
  }
}
