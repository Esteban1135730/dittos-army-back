import 'dotenv/config';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { resolveCardImagesRoot } from './pokemon';

async function bootstrap() {
  const imagesDir = resolveCardImagesRoot();
  mkdirSync(imagesDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // gzip/deflate de respuestas compresibles (JSON grandes como /stock); las PNG se omiten por tipo.
  app.use(compression());
  // Product API under /pokemon; health (Render) and static /card-images/ stay at root.
  app.setGlobalPrefix('pokemon', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useStaticAssets(imagesDir, { prefix: '/card-images/' });

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
