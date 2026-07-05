---
name: fullstack-spec-driven
description: Coordinates one delivery iteration across dittos-army-back and dittos-army-front with paired feature docs (NNN-slug); uses structured agent questions and explicit numbered steps when choices are real; human-approved specs on both sides before code, then implementation and tests together. Use when a change requires Nest API and operational UI in the same increment—not dittos-army-store unless explicitly scoped.
---

# Entrega fullstack (back + panel) en una iteración (Dittos Army)

Ámbito: **`dittos-army-back/`** y **`dittos-army-front/`** en el **mismo** incremento, con trazabilidad en documentación. La tienda pública **`dittos-army-store/`** no entra en esta skill **salvo** que el usuario lo pida explícitamente (entonces combina con **frontend-spec-driven** para la parte store).

Esta skill **orquesta** las reglas de **backend-spec-driven** y **frontend-spec-driven** (superficie panel ya fijada aquí como `dittos-army-front`) y **module-authoring**, sin relajar validación humana ni estados de backlog.

## Selección en interfaz y flujo por pasos

- Usa **pregunta estructurada del agente** cuando haya **elecciones reales** (p. ej. confirmar fullstack sí/no antes de abrir docs).
- Sigue los **pasos 0 → 1 → 2 → 3** de esta skill e **indica el paso actual** (“Paso 1: …”) para orientar al usuario.
- **No inventes** bifurcaciones de diseño solo para interactividad; el contrato API/UI se acuerda con el humano en los `spec-*.md`, sin relleno artificial.

## Principios iterativos

- **Un incremento = un par de carpetas de docs** (mismo `NNN` y mismo `slug-kebab` en `docs/backend/features/` y `docs/frontend/features/`), salvo que el humano acuerde otra convención y lo deje escrito en ambas specs.
- **Specs en las cuatro piezas antes de código**: no tocar código de producto en **`dittos-army-back/`** ni **`dittos-army-front/`** (ni tests de ese comportamiento) hasta que el usuario declare explícitamente que están **aprobados para desarrollo**:
  - `docs/backend/features/<NNN>-<slug>/spec-funcional.md` y `spec-tecnico.md`
  - `docs/frontend/features/<NNN>-<slug>/spec-funcional.md` y `spec-tecnico.md`
- **Pregunta antes que suponer**: contratos API, Mongoose, pantallas del panel, Axios y slug; no inferir alcance. Si falta información, **pregunta** (paso a paso) hasta acotar; no sustituir con suposiciones en specs.
- **Backlog**: dos `backlog.md` (back y front). **No** cambiar estados en ninguno sin instrucción o confirmación humana explícita, igual que en las skills simples.
- **Implementación en una pasada coherente**: tras aprobación de las cuatro specs y acuerdo de tareas `IN_PROGRESS`, el agente puede y debe abordar **API + panel** en el mismo ciclo de trabajo (misma sesión / mismo objetivo de PR), manteniendo contrato alineado entre `spec-tecnico` del back (rutas/DTOs) y el del front (lladas, pantallas).

## Al invocar esta skill (orden estricto)

### 0. Confirmar alcance fullstack

- Confirma con el usuario que el trabajo es **back + panel** (`dittos-army-back` + `dittos-army-front`). Si también afecta **`dittos-army-store`**, acórdalo explícitamente y documenta esa parte con **frontend-spec-driven** (paso 0 “store”) en las specs de front o en una sub-sección del `spec-tecnico` del front.

### 1. Detectar trabajo en curso (pares)

- Lista `docs/backend/features/` y `docs/frontend/features/` (carpetas `^\d{3}-[a-z0-9-]+$`).
- Busca carpetas con el **mismo** `NNN-slug` en ambos árboles con alguna tarea **`IN_PROGRESS`** en cualquiera de los dos `backlog.md`.
- **Si hay un par claro y un solo foco**: lee las **cuatro** specs del par. Si falta aprobación o el mensaje es ambiguo, **pregunta** antes de implementar o de cambiar estados.
- **Si hay varios pares o IN_PROGRESS desalineados** (solo back o solo front con ese id): **pregunta** qué incremento es el activo; no asumas cierres.

### 2. Nuevo incremento fullstack (sin par en curso claro)

1. Lee `docs/backend/architecture.md`, `docs/backend/functionalidades.md`, `docs/frontend/architecture.md`, `docs/frontend/functionalidades.md`.
2. **Pregunta** lo imprescindible: contrato HTTP, modelo de datos, pantallas y flujos del panel, errores esperados, slug del incremento (selección en interfaz solo si hay opciones reales).
3. Calcula **`NNN`** como en [reference.md](reference.md) (un solo consecutivo para el par).
4. Crea **en el mismo turno de documentación** (o en orden inmediato):
   - `docs/backend/features/<NNN>-<slug>/` desde `docs/backend/plantilla/`
   - `docs/frontend/features/<NNN>-<slug>/` desde `docs/frontend/plantilla/`
5. En cada `spec-tecnico.md`, enlaza al otro lado del par (ruta de la carpeta y dependencias: “consume `GET /…` definido en spec back”, “expone … usado por panel en …”).
6. Rellena borradores; **Meta** en `EN_ESPECIFICACION` en **ambos** `backlog.md` hasta validación humana de **las cuatro** specs.
7. Tras aprobación explícita de las cuatro specs, **pregunta** qué tarea(s) pasan a `IN_PROGRESS` en cada backlog (como máximo una `IN_PROGRESS` activa por archivo, salvo acuerdo humano distinto).
8. Actualiza `docs/backend/features/README.md` y `docs/frontend/features/README.md`.

### 3. Implementación (post-aprobación)

- Implementa y prueba **`dittos-army-back`** (Jest donde aplique) y **`dittos-army-front`** en coherencia con los specs aprobados.
- Cruza verificación: el panel debe consumir las rutas, códigos y payloads acordados en el spec técnico del back (ajustar DTOs/nombres si el humano autoriza correcciones puntuales en specs antes de codificar).

## Relación con otras skills

| Skill | Rol cuando usas fullstack-spec-driven |
|-------|----------------------------------------|
| **backend-spec-driven** | Reglas detalladas de carpeta back, estados, plantilla back. |
| **frontend-spec-driven** | Reglas de panel y store; en fullstack, el panel es **`dittos-army-front`** (superficie ya decidida por esta skill). |
| **module-authoring** | Límites de módulo, tests obligatorios en back, estructura limpia en front. |

Si algo contradice entre skills, **gana la restricción más fuerte** (especialmente: no código hasta aprobación de **las cuatro** specs en fullstack).

## Estados permitidos

Igual que en **backend-spec-driven** / **frontend-spec-driven**: tareas `TODO` \| `IN_PROGRESS` \| `DONE` \| `BLOCKED`; incremento `EN_ESPECIFICACION` \| `EN_DESARROLLO` \| `EN_QA` \| `CERRADO` — **por cada** `backlog.md`, con confirmación humana para cambios.

## Plantillas

- Backend: `docs/backend/plantilla/`
- Front (panel): `docs/frontend/plantilla/`

Detalle de emparejamiento `NNN` y checklists: [reference.md](reference.md).
