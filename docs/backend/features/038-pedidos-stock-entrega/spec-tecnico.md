# Spec técnico — Pedidos de stock, entrega y estados

Consumidor panel: `docs/frontend/features/038-pedidos-stock-entrega/`

Authz: `@RequireFeature('clientes')` en controller de pedidos; `X-Owner` como el resto del panel. Rutas actuales de `reserva` incoming **no cambian**.

## Catálogo de tiendas

`src/utils/tiendas-entrega.ts` (constante, sin Mongo). Exportar `TIENDAS_ENTREGA`, `isTiendaEntregaId`, `getTiendaEntrega(id)`.

## Schemas

### `Pedido` — `src/schema/pedido.schema.ts`

```
client_id: string (index)
status: 'reservado' | 'pagado' | 'entregado'
entrega_en_tienda: boolean
store_id?: string
store_name?: string
store_address?: string
ciudad?: string
direccion_o_punto?: string
notas_entrega?: string
fecha_tentativa_entrega?: Date
paid_at?: Date
delivered_at?: Date
lines_snapshot?: PedidoLineSnapshot[]  // se llena al pagar
created_at, updated_at
```

`PedidoLineSnapshot`: `{ stock_id, card_id, card_name?, precio, currency, image_url? }`

Índices: `{ client_id: 1, status: 1 }`, `{ client_id: 1, created_at: -1 }`.

No unique sparse de “un abierto”: se valida en service (query `status in [reservado, pagado]`).

### `Reserva`

Añadir `pedido_id: string` (index, required en documentos nuevos). Crear reserva exige pedido `reservado` del mismo `client_id`.

### `Client`

`tienda_entrega` deja de ser `required` (campo legado, no se escribe). Quitar de DTO de create/update.

## Rutas

Prefijo `/pedido`. Controller: `src/controller/pedido.controller.ts`. Service: `src/service/pedido.service.ts`. Repo: `src/repository/pedido.repository.ts`.

| Método | Ruta | Body / query | 200/201 | Errores |
|--------|------|--------------|---------|---------|
| GET | `/pedido/tiendas` | — | lista catálogo `{ id, name, address }[]` | |
| GET | `/pedido/client/:clientId` | — | pedidos del cliente, más reciente primero, con `lines` resueltas | 400/404 |
| GET | `/pedido/:id` | — | pedido + `lines` | 400/404 |
| POST | `/pedido` | ver DTO create | 201 pedido | 400, 404 cliente, 409 abierto |
| PATCH | `/pedido/:id` | entrega y/o fecha (solo `reservado`) | pedido | 400, 404, 409 |
| DELETE | `/pedido/:id` | solo `reservado` | `{ success }` libera stock | 400, 404, 409 |
| POST | `/pedido/:id/pagar` | — | pedido `pagado` + `vendidas` | 400 vacío, 409 estado, 404 stock |
| POST | `/pedido/:id/entregar` | — | pedido `entregado` | 409 si no `pagado` |

### DTO create / patch

```
{
  client_id: string
  entrega_en_tienda: boolean
  store_id?: string
  ciudad?: string
  direccion_o_punto?: string
  notas_entrega?: string
  fecha_tentativa_entrega: string // ISO date (día)
}
```

Validación: si `entrega_en_tienda` → `store_id` válido y snapshot name/address. Si no → `ciudad` y `direccion_o_punto` trim no vacíos. Fecha parseable.

### Líneas (reservas)

`POST /reserva` exige `pedido_id` **o** resuelve el único pedido `reservado` del `client_id`. Preferir `pedido_id` explícito desde el panel.

409 si no hay pedido `reservado`.

`POST /reserva/client/:clientId/finalizar-venta`: delega a `pagar` del pedido abierto `reservado` (compatibilidad). 409 si no hay o está `pagado`.

`GET /reserva/client/:id` sigue devolviendo solo líneas vivas (`Reserva`). El historial pagado/entregado sale de `/pedido`.

## Resolución de `lines` en GET pedido

- `reservado`: join `Reserva` por `pedido_id` + stock (nombre, imagen).
- `pagado` / `entregado`: `lines_snapshot`.

## Pagar (transacción lógica)

Por cada reserva del pedido: igual que `finalizarVenta` actual (`precioToCop`, `enrichSaleCreatePayload`, stock `vendida`, borrar reserva). Luego `lines_snapshot`, `status=pagado`, `paid_at`. Si una línea falla a mitad, el servicio debe fallar de forma explícita (mismo estilo actual: stop en primer error); no introducir transacciones Mongo salvo que ya existan en el flujo.

## Script

`scripts/backfill-pedidos-from-reservas.ts`: agrupa `Reserva` sin `pedido_id` por `client_id`, crea pedido, setea `pedido_id`. Dry-run por flag.

## Tests Jest

- Validación entrega (tienda vs envío).
- 409 segundo pedido abierto.
- Reservar sin pedido `reservado` → 409.
- Pagar vacío / no reservado.
- Entregar solo desde pagado.
- `tienda_entrega` ya no requerido en create client.
- Normalización fuzzy de tienda en backfill (spec de util).

## Riesgos

- Pedidos a medio pagar si falla a mitad: mismo riesgo que hoy.
- Backfill fuzzy mal emparejado: operador puede PATCH entrega en `reservado`.
- `finalizar-venta` legacy vs varios pedidos históricos: solo actúa sobre el `reservado` abierto.
