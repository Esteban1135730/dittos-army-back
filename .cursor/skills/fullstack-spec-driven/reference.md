# Referencia: fullstack — emparejamiento y checklists

Usar **pregunta estructurada del agente** solo cuando existan **alternativas reales**; guía por **pasos** (ver `SKILL.md`).

## Nombre de carpetas (recomendado)

En **los dos** árboles, la misma carpeta lógica:

- `docs/backend/features/<NNN>-<slug-kebab>/`
- `docs/frontend/features/<NNN>-<slug-kebab>/`

Mismo `NNN` y mismo `slug-kebab` para correlación en Git, PRs y conversaciones.

## Siguiente consecutivo `NNN` para un **nuevo par**

1. Lista carpetas `^\d{3}-` en `docs/backend/features/` y en `docs/frontend/features/`.
2. Toma el **máximo** de todos los `NNN` encontrados en **cualquiera** de los dos árboles.
3. Nuevo id: `(máximo + 1)` con `padStart(3, '0')`.
4. Usa ese `NNN` **en ambas** carpetas al crear el incremento fullstack.

Así el incremento queda numerado de forma única en el producto “back + panel”, aunque en uno de los árboles salte un hueco respecto a features solo-back o solo-front anteriores.

## Enlaces entre specs

En **`spec-tecnico.md` del backend**, sección breve: “Consumidor panel: `docs/frontend/features/<NNN>-<slug>/` — pantallas y flujos…”.

En **`spec-tecnico.md` del frontend (panel)**, sección breve: “Contrato API: alineado con `docs/backend/features/<NNN>-<slug>/spec-tecnico.md` — rutas, métodos, cuerpos…”.

## Checklist antes de implementar

```
- [ ] Aprobación humana explícita: back spec-funcional + spec-tecnico
- [ ] Aprobación humana explícita: front spec-funcional + spec-tecnico
- [ ] Backlog(s): tarea(s) IN_PROGRESS acordada(s)
- [ ] Contrato API entre ambos spec-técnicos sin contradicción
```

## Checklist al cerrar el incremento (orientativo)

```
- [ ] dittos-army-back: cambios + tests Jest donde aplique
- [ ] dittos-army-front: cambios alineados al API desplegado o documentado
- [ ] Lint / build en ambos paquetes tocados
- [ ] Estados de backlog actualizados solo con autorización humana
```

## Cuándo **no** usar esta skill

- Solo API → **backend-spec-driven**.
- Solo panel (sin cambios de API) → **frontend-spec-driven** (paso 0: front).
- Solo tienda pública → **frontend-spec-driven** (paso 0: store).
