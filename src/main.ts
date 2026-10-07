import 'dotenv/config';
import * as dns from 'node:dns';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { resolveCardImagesRoot } from './pokemon';
import { resolveStockPhotosRoot } from './utils/stock-photo-path';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

async function bootstrap() {
  const imagesDir = resolveCardImagesRoot();
  mkdirSync(imagesDir, { recursive: true });
  const stockPhotosDir = resolveStockPhotosRoot();
  mkdirSync(stockPhotosDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useBodyParser('json', { limit: '12mb' });
  app.useBodyParser('urlencoded', { limit: '12mb', extended: true });

  app.use(compression());
  app.setGlobalPrefix('pokemon', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  app.useStaticAssets(imagesDir, { prefix: '/card-images/' });
  app.useStaticAssets(stockPhotosDir, { prefix: '/stock-photos/' });

  const frontendOrigin =
    process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const allowedOrigins = frontendOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowOnrender = process.env.CORS_ALLOW_ONRENDER === 'true';

  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        allowedOrigins.includes(origin) ||
        (allowOnrender && /\.onrender\.com$/i.test(origin))
      ) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Owner',
      'X-Tcg',
      'X-Sync-Token',
    ],
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
bootstrap();
