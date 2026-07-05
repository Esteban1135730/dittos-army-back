---
name: backend-spec-driven
description: Drives dittos-army-back delivery with numbered feature folders (NNN-slug); uses structured agent questions and a clear step-by-step flow when choices are real; human-validated specs before implementation; backlog states only with explicit confirmation. Use for API/Nest/Mongoose features, specs, or when the user invokes this workflow.
---

# Entrega backend con spec y backlog (Dittos Army)

Ámbito de implementación: **`dittos-army-back/`** (NestJS, Mongoose, Jest). Documentación: **`docs/backend/features/`**.

## Selección en interfaz y flujo por pasos

- **Interfaz**: si la decisión es **cerrada y real** (p. ej. qué tarea pasa a `IN_PROGRESS`, sí/no sobre compatibilidad con el panel), usar **pregunta estructurada del agente** o opciones numeradas.
- **Pasos**: este documento ya va en orden **1 → 2 → …**; **indica el paso actual** al interactuar con el usuario.
- **Sin opciones inventadas**: si no hay varias alternativas genuinas, pregunta **abierta** o pide **un dato**; no rellenes `spec-*.md` con escenarios ficticios solo para tener botones.

## Principios iterativos

- **Pregunta antes que suponer**: contratos HTTP, datos, auth, colecciones Mongoose y slug deben estar **acordados o confirmados** con el usuario.
- **Validación humana de specs**: no escribir ni modificar código de producto en `dittos-army-back/` (ni tests de ese comportamiento) hasta que el usuario declare explícitamente que **`spec-funcional.md` y `spec-tecnico.md` están aprobados** para desarrollo.
- **Estados en `backlog.md`**: no cambiar estados sin instrucción o confirmación explícita del humano; propón cambios y espera conformidad.

## Al invocar esta skill (orden estricto)

### 1. Detectar trabajo en curso

- Listar `docs/backend/features/` y considerar solo carpetas con nombre `^\d{3}-[a-z0-9-]+$`.
- Abrir cada `backlog.md` y buscar el estado **`IN_PROGRESS`** en las tablas de tareas.
- **Si hay exactamente una carpeta con alguna tarea `IN_PROGRESS`**: **candidata** a contexto activo. Lee `spec-funcional.md` y `spec-tecnico.md`. Si falta aprobación de specs o el foco no está claro, **pregunta** antes de implementar o de cambiar estados.
- **Si hay más de una carpeta con `IN_PROGRESS`**: detente; **pregunta** qué incremento queda activo.
- **Si no hay `IN_PROGRESS`**: paso 2.

### 2. Nueva funcionalidad (sin tarea en curso)

1. Lee `docs/backend/architecture.md` y `docs/backend/functionalidades.md`.
2. **Pregunta** lo imprescindible si falta contexto: rutas REST, DTOs, auth, impacto en esquemas Mongoose, compatibilidad con `dittos-army-front` / `dittos-army-store`, slug. No crees carpeta hasta **slug y alcance mínimo** acordados.
3. **Siguiente consecutivo**: máximo `NNN` entre carpetas `NNN-*` + 1 (tres dígitos).
4. Crea `docs/backend/features/<NNN>-<slug-kebab>/` con slug **acordado con el usuario**.
5. Copia desde `docs/backend/plantilla/` → `spec-funcional.md`, `spec-tecnico.md`, `backlog.md`.
6. Rellena borradores; **Meta** en `EN_ESPECIFICACION` hasta validación humana de ambas specs. Tras aprobación, **pregunta** qué tarea pasa a `IN_PROGRESS`; como máximo una a la vez.
7. Actualiza `docs/backend/features/README.md` (tabla índice).

### Ficheros obligatorios por carpeta

| Fichero | Contenido |
|---------|-----------|
| `spec-funcional.md` | Qué debe cumplir el sistema (consumidores, reglas de negocio, errores esperados). |
| `spec-tecnico.md` | Rutas Nest, módulos bajo `dittos-army-back/src/`, Mongoose (schemas, índices), validación, códigos HTTP, riesgos. |
| `backlog.md` | Historias, CA, casos borde, tareas con **Estado**, **Meta del incremento**, **Registro de estados de tareas** (ver [reference.md](reference.md)). |

**Estado de tareas:** `backlog.md` es la fuente de verdad. Tras **autorización humana**, actualiza tabla de historia, **Registro de estados de tareas** y **Estado del incremento** en Meta.

## Estados permitidos

Tareas: `TODO` | `IN_PROGRESS` | `DONE` | `BLOCKED` (motivo si `BLOCKED`).

Incremento (Meta): `EN_ESPECIFICACION` | `EN_DESARROLLO` | `EN_QA` | `CERRADO`.

## Coherencia global

Si cambia arquitectura de API o el mapa de capacidades, actualiza `docs/backend/architecture.md` y/o `docs/backend/functionalidades.md`.

## Implementación en código

Solo después de **validación humana explícita** de ambas specs y con estados del backlog acordados. Alineado con **module-authoring**.

## Plantilla

`docs/backend/plantilla/` y [reference.md](reference.md).
