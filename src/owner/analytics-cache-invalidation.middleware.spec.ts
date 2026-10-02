import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  Patch,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AnalyticsCacheInvalidationMiddleware } from './analytics-cache-invalidation.middleware';
import { DashboardOverviewService } from '../service/dashboard-overview.service';
import { MetricsAnalyticsService } from '../service/metrics-analytics.service';

@Controller('items')
class ItemsTestController {
  @Get()
  list() {
    return [];
  }

  @Post()
  create() {
    return { ok: true };
  }

  @Patch()
  update() {
    return { ok: true };
  }

  @Delete()
  remove() {
    return { ok: true };
  }

  @Post('invalid')
  invalid() {
    throw new BadRequestException('nope');
  }
}

describe('AnalyticsCacheInvalidationMiddleware', () => {
  const dashboard = { invalidateCache: jest.fn() };
  const metrics = { invalidateCache: jest.fn() };
  let app: INestApplication<App>;

  const flushFinish = () => new Promise((r) => setImmediate(r));

  beforeAll(async () => {
    @Module({
      controllers: [ItemsTestController],
      providers: [
        { provide: DashboardOverviewService, useValue: dashboard },
        { provide: MetricsAnalyticsService, useValue: metrics },
      ],
    })
    class TestModule implements NestModule {
      configure(consumer: MiddlewareConsumer) {
        consumer.apply(AnalyticsCacheInvalidationMiddleware).forRoutes('*');
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it.each(['post', 'patch', 'delete'] as const)(
    '%s exitoso vacía ambas cachés',
    async (method) => {
      await request(app.getHttpServer())
        [method]('/items')
        .expect((res) => {
          expect(res.status).toBeLessThan(400);
        });
      await flushFinish();
      expect(dashboard.invalidateCache).toHaveBeenCalledTimes(1);
      expect(metrics.invalidateCache).toHaveBeenCalledTimes(1);
    },
  );

  it('GET no vacía las cachés', async () => {
    await request(app.getHttpServer()).get('/items').expect(200);
    await flushFinish();
    expect(dashboard.invalidateCache).not.toHaveBeenCalled();
    expect(metrics.invalidateCache).not.toHaveBeenCalled();
  });

  it('petición mutante fallida (4xx) no vacía las cachés', async () => {
    await request(app.getHttpServer()).post('/items/invalid').expect(400);
    await flushFinish();
    expect(dashboard.invalidateCache).not.toHaveBeenCalled();
    expect(metrics.invalidateCache).not.toHaveBeenCalled();
  });
});
