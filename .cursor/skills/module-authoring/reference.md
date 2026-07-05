# Referencia rápida: módulo y tests (Dittos Army)

## Backend — NestJS (`dittos-army-back/`)

Código bajo `src/`: `controller/`, `service/`, `repository/`, `schema/`, etc.

```
src/service/store-inventory.service.ts
src/repository/stock.repository.ts
src/controller/stock.controller.ts
src/schema/stock.schema.ts
```

- **Tests**: Jest, archivos `*.spec.ts` junto al código o bajo `test/` según convención ya usada (`npm test` desde `dittos-army-back/`).
- **Mongoose**: esquemas en `schema/`; evitar lógica de negocio gruesa dentro del schema si el repo ya la coloca en servicios.

## Panel — Vite + React + MUI (`dittos-army-front/`)

- Rutas en `src/app.route.tsx`; páginas en `src/pages/<dominio>/`.
- Datos: **Axios** + **TanStack React Query**; conviene centralizar base URL del API.
- **Tests**: el paquete no define `npm test` por defecto; al añadir suite, documentar comando.

## Tienda — Vite + React (`dittos-army-store/`)

- Rutas en `src/App.tsx`; catálogo desde `public/inventory.json` y `public/upcoming.json`.
- Lógica de UI: hooks bajo `src/hooks/`; sin persistencia de negocio propia (eso es back + panel).
- **Tests**: alinear con el gestor del paquete si se añade runner.

## Features documentadas (spec-driven)

Entregas estructuradas: `docs/backend/features/NNN-slug/` y `docs/frontend/features/NNN-slug/` (skills **backend-spec-driven** / **frontend-spec-driven**).

## Nombres

- Carpeta de feature en docs: **NNN-slug-kebab** (tres dígitos).
- Código: seguir **camelCase** / **PascalCase** ya presente en Nest y React del repo.
