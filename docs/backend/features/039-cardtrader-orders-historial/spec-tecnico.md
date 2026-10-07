# Spec técnico — Historial CardTrader (backend)

## Módulo Nest

Nuevo dominio acotado (feature module o carpeta bajo `src/service/cardtrader/`):

| Pieza | Responsabilidad |
|-------|-----------------|
| `CardtraderOrdersHistorialController` | `GET /pokemon/cardtrader/orders-historial` (summary), `GET .../events` opcional paginado por variante |
| `CardtraderOrdersHistorialService` | Orquestación, agregación, caché TTL |
| Tipos puros | `cardtrader-orders-historial.types.ts` (sin Mongoose en DTO respuesta) |

Reutilizar:

- `CardTraderService.getOrders` / `getOrderById` (paginación cliente).
- `normalizeCtOrdersResponse`, `expandSentUnitsFromOrders` o variante **sin filtrar solo `sent`** para buyer history (incluir estados pagados/enviados según CA).
- `CardTraderTcgdexResolveService` + `inferSentUnitRareza` / `normalizeOperationalRareza`.
- Repos existentes: transit lines/lots, stock, reserva, pedido, sale (consultas agregadas por `card_id` + language + rareza).

## Clave de agrupación

```text
variantKey = `${tcgdex_card_id}|${normalizeLanguage(lang)}|${normalizeOperationalRareza(rareza) ?? ''}`
```

Ítems CT sin `tcgdex_card_id` resuelto → bucket `_unresolved` con contador en meta de respuesta.

## Pipeline `buildHistorialSnapshot`

1. **Fetch CT orders** (buyer y seller): bucle páginas hasta `limit` global configurable (env `CT_ORDERS_HISTORIAL_MAX_PAGES` default 20) o fecha mínima.
2. **Expandir ítems** a unidades lógicas (quantity).
3. **Enriquecer** cada ítem: `tcgdex_card_id`, `language`, `rareza`, `order_id`, `order_code`, fechas, precios.
4. **Agregar local** (paralelo):
   - Stock por owner DB: counts por estado vendible / vendida / otros.
   - Transit: `remaining_quantity` por línea → variante.
   - Reservas activas + join stock → variante.
   - Sales (`type=venta`) + fechas; reservas en pedidos `reservado` vía snapshot/lines.
5. **Merge** en mapa `variantKey → AggregatedVariantRow`.
6. **Events** (detalle): array unificado `{ at, kind, label, refs }` por variante, orden `at DESC`.

Caché en memoria TTL 5–10 min por snapshot (clave: owner + date range + role) para no martillar CT API.

## Contrato HTTP (borrador)

### `GET /pokemon/cardtrader/orders-historial`

Query:

- `from`, `to` (ISO date)
- `order_as` = `buyer` | `seller` | `all` (default `all`)
- `owner` opcional
- `q` búsqueda
- `page`, `limit` sobre **variantes** (no pedidos CT)

Response:

```json
{
  "meta": {
    "generated_at": "...",
    "ct_orders_scanned": { "buyer": 120, "seller": 45 },
    "unresolved_ct_items": 3,
    "partial_ct_fetch": false
  },
  "rows": [
    {
      "variant_key": "sv08-194|en|foil",
      "card_id": "sv08-194",
      "card_name": "...",
      "language": "en",
      "rareza": "foil",
      "image_url": "",
      "qty_ct_buy": 4,
      "qty_ct_sell": 0,
      "qty_transit": 1,
      "qty_stock_sellable": 2,
      "qty_reserved": 1,
      "qty_sold_local": 1,
      "last_sold_local_at": "2026-09-01T...",
      "flags": { "in_reserva_now": true }
    }
  ],
  "total": 500
}
```

### `GET /pokemon/cardtrader/orders-historial/:variantKey/events`

Devuelve `events[]` para el detalle expandible (paginación opcional).

## Tests (Jest)

- Agregación: dos order items misma variante → `qty_ct_buy` suma.
- Rareza distinta → dos filas.
- Merge local: mock stock vendida + sale → `last_sold_local_at`.
- Reserva activa → `qty_reserved` y `flags.in_reserva_now`.
- CT fetch parcial → `partial_ct_fetch: true` sin throw.

## Seguridad

- Mismos guards que resto `/pokemon/cardtrader/*` (panel interno).
- No loguear token; no persistir respuestas CT completas en Mongo v1.

## Rendimiento

- Límite duro de páginas CT; documentar en respuesta si se truncó.
- Resolución TCGdex: dedupe por `(blueprint_id|expansion+number)` en lote.
