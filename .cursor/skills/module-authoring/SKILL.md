---
name: module-authoring
description: Creates production-grade application modules with mandatory tests and clear boundaries; uses structured questions and clear steps when clarifying scope with the human. Use when adding a Nest module, React feature area, or extending functionality in this repo.
---

# Autoría de módulos (Dittos Army)

## Aclaraciones con el humano

- Si hace falta elegir **entre alternativas reales** (p. ej. dos sitios ya usados en el repo para el mismo tipo de código), puedes usar **pregunta estructurada del agente** u opciones numeradas. **No** inventes variantes solo para rellenar opciones.
- No sustituye **specs aprobadas** ni backlog cuando la feature esté bajo **frontend-spec-driven** / **backend-spec-driven** / **fullstack-spec-driven** / **mobile-spec-driven**.

## Antes de escribir código

1. Si el cambio pertenece a una feature con carpeta en `docs/frontend/features/`, `docs/backend/features/` o `docs/mobile/features/`, cumple la skill correspondiente (**frontend-spec-driven**, **backend-spec-driven**, **mobile-spec-driven**): **no implementes** hasta validación humana explícita de `spec-funcional.md` y `spec-tecnico.md`, y sin asumir estados en `backlog.md` (ver `AGENTS.md`).
2. Revisar estructura existente: `dittos-army-back/src/`, **`dittos-army-front/src/`** (panel: `pages/`, `components/`), `dittos-army-store/src/` (tienda), `dittos-army-mobile/src/` (app Expo), `docs/frontend/features/`, `docs/backend/features/`, `docs/mobile/features/`, convenciones ya usadas.
3. Identificar el **límite del módulo**: qué expone al resto de la app y qué queda interno.
4. Confirmar stack de tests: en backend **Jest** (`*.spec.ts`); en store, el comando que exista o acordar uno mínimo.

## No negociable (producción)

- **Tests**: cada módulo o comportamiento nuevo en backend incluye tests que fallen si la lógica principal se rompe. Sin tests que cubran el comportamiento nuevo, el trabajo no se considera terminado donde Jest ya sea el estándar del paquete.
- **API pública explícita**: un solo punto de entrada documentado (`index.ts`, barrel del módulo Nest, etc.) con exports intencionales; evitar barril gigante de todo el repo.
- **Errores y límites**: errores tipados o categorías claras; sin tragar excepciones vacías; validar entradas en el borde (controller / DTO / UI).
- **Sin secretos ni datos sensibles** en código o fixtures versionadas.
- **Observabilidad mínima**: donde aplique, logging en puntos de fallo o transacciones críticas, sin ruido excesivo.

## Estructura orientativa (adaptar al repo)

- **Backend (Nest)**: cohesión por dominio en `service/`, `repository/`, `schema/`, `controller/`; registrar en `app.module.ts` o en un `*.module.ts` dedicado si el proyecto introduce submódulos.
- **Panel (`dittos-army-front`)**: páginas por dominio bajo `src/pages/`; layout en `src/components/`; llamadas HTTP con Axios al Nest.
- **Tienda (`dittos-army-store`)**: rutas en `src/App.tsx`, hooks y servicios para JSON estáticos o TCGdex en cliente.
- **App móvil (`dittos-army-mobile`)**: features bajo `src/features/`; DB en `src/db/`; sync en `src/sync/`; rutas Expo Router en `app/`.

Si el repo ya tiene un patrón distinto, **seguir ese patrón** en lugar de introducir uno nuevo.

## Tests obligatorios: qué incluir

| Ámbito | Objetivo mínimo |
|--------|-----------------|
| Lógica pura / servicios Nest | Casos felices + al menos un borde (vacío, inválido, límite). |
| Repositorios / Mongoose | Mock de modelo o DB; verificar mapeo y errores cuando sea viable. |
| UI (store) | Prueba de componente o contrato de props/eventos según tooling acordado en el equipo. |

Ejecutar tests del paquete afectado antes de cerrar (p. ej. `npm test` dentro de `dittos-army-back/`).

## Checklist de entrega

```
- [ ] API pública del módulo definida y estable
- [ ] Implementación acotada; sin dependencias circulares nuevas
- [ ] Tests añadidos y pasando (donde aplique Jest en backend)
- [ ] README o comentario breve solo si el módulo no es obvio
- [ ] Lint/format del proyecto respetado
```

## Qué evitar

- Módulos “basura” con mezcla de responsabilidades no relacionadas.
- Tests que solo aserten “no lanza” sin comprobar resultado.
- Duplicar configuración global (clients HTTP, conexión DB) por módulo sin necesidad.

## Profundidad adicional

Para rutas y ejemplos por paquete, ver [reference.md](reference.md).
