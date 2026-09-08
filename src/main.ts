import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { resolveCardImagesRoot } from './service/tcgdex/local-card-images.service';

async function bootstrap() {
  const imagesDir = resolveCardImagesRoot();
  mkdirSync(imagesDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Owner'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
