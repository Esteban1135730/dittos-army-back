import 'dotenv/config';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { resolveCardImagesRoot } from './pokemon';
import { resolveStockPhotosRoot } from './utils/stock-photo-path';

async function bootstrap() {
  const imagesDir = resolveCardImagesRoot();
  mkdirSync(imagesDir, { recursive: true });
  const stockPhotosDir = resolveStockPhotosRoot();
  mkdirSync(stockPhotosDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Fotos inventario van en JSON base64; el default de Express (~100kb) devuelve 413.
  app.useBodyParser('json', { limit: '12mb' });
  app.useBodyParser('urlencoded', { limit: '12mb', extended: true });

  // gzip/deflate de respuestas compresibles (JSON grandes como /stock); las PNG se omiten por tipo.
  app.use(compression());
  // Product API under /pokemon; health (Render) y static /card-images/ stay at root.
  app.setGlobalPrefix('pokemon', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  app.useStaticAssets(imagesDir, { prefix: '/card-images/' });
  app.useStaticAssets(stockPhotosDir, { prefix: '/stock-photos/' });

  // Configurar CORS
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir sin origin (p.ej. Postman, misma origen) o cualquier localhost
      if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // en desarrollo permitir todo; en prod restringir
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
