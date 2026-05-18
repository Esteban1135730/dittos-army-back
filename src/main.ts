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
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir sin origin (p.ej. Postman, misma origen) o cualquier localhost
      if (
        !origin ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        origin === frontendOrigin
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
