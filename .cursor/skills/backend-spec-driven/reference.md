# Referencia: backend — convenciones y plantillas (Dittos Army)

Al aplicar la skill principal: **pregunta estructurada del agente** y **pasos numerados** cuando haya elecciones reales; sin opciones inventadas (ver `SKILL.md`).

## Carpeta de feature

Formato **`NNN-slug-kebab`** (tres dígitos + slug). Solo directorios que casen con `^\d{3}-` bajo `docs/backend/features/`.

## Siguiente consecutivo

Máximo `NNN` existente + 1, siempre `padStart(3, '0')`.

## `spec-funcional.md`

Secciones base: resumen, actores/consumidores, comportamiento en éxito y error, fuera de alcance. Enfatiza **contratos** visibles para el cliente (`dittos-army-store` u otros consumidores).

## `spec-tecnico.md`

Incluir al menos:

1. Rutas HTTP (método + path) y controladores Nest afectados.
2. Servicios, repositorios y schemas en `dittos-army-back/src/`.
3. Cambios en Mongoose (campos, índices, migraciones de datos si aplica).
4. Validación de entrada (DTO / `class-validator` si el proyecto lo adopta), authz, límites de body/rate si aplica.
5. Tests Jest (unitarios, integración con app de prueba si aplica).

## `backlog.md`

Igual que **frontend-spec-driven**: bloque **Meta del incremento** al inicio, historias con tablas de tareas, **Registro de estados de tareas** al final con fecha ISO.

## Coordinación con `dittos-army-store`

Si el endpoint es consumido por la tienda, enlaza el consecutivo o slug de la feature front relacionada en `spec-tecnico.md` cuando exista.

## Validación humana y estados

- **Specs**: ninguna implementación en `dittos-army-back/` hasta aprobación explícita del usuario sobre **ambas** specs del incremento.
- **Backlog**: estados solo con instrucción o confirmación humana.
