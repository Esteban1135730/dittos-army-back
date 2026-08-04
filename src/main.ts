import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

function resolveLocalImagesDir(): string | undefined {
  const fromEnv = process.env.TCGDEX_LOCAL_IMAGES_DIR?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const winDefault = 'D:\\TcgDex images';
  if (process.platform === 'win32' && existsSync(winDefault)) return winDefault;
  const posixDefault = join(process.cwd(), 'data', 'tcgdex-images');
  if (existsSync(posixDefault)) return posixDefault;
  return fromEnv || (process.platform === 'win32' ? winDefault : posixDefault);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const imagesDir = resolveLocalImagesDir();
  if (imagesDir && existsSync(imagesDir)) {
    app.useStaticAssets(imagesDir, { prefix: '/card-images/' });
  }

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
