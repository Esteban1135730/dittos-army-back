# Ditto Army Back

Backend NestJS (arquitectura monolito modular) con MongoDB.

## Configuración local

1. Copia `.env.example` a `.env`.
2. Define credenciales/variables según tu entorno.

Variables principales:

- `PORT`: puerto del servidor.
- `FRONTEND_ORIGIN`: origen permitido por CORS.
- `MONGODB_URI`: conexión a MongoDB.
- `FACTUS_BASE_URL`: URL base Factus sandbox.
- `FACTUS_API_TOKEN`: token de API Factus.

## Ejecutar local

```bash
npm ci
npm run start:dev
```

## Build y pruebas

```bash
npm run build
npm run test
```

## Endpoints de facturación (Factus)

- `POST /billing/factus/invoice`: crea borrador de factura electrónica.
- `POST /billing/factus/invoice/:id/send`: envía la factura por Factus + adaptador SOAP.
- `GET /billing/factus/invoice/:id/status`: consulta estado sincronizado con Factus.

## Docker y Kubernetes

- Docker Compose desde la raíz del workspace: `docker compose up --build`.
- Manifiestos Kubernetes base en `../k8s/base`.
