import 'dotenv/config';
import * as dns from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** Reduce timeouts DNS/SRV con Atlas en algunos equipos Windows/redes con IPv6 mal configurado */
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  
  // Configurar CORS
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
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
