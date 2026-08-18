# Backlog — Pedidos de stock, entrega y estados

## Meta del incremento

| Campo | Valor |
|-------|--------|
| Carpeta | `038-pedidos-stock-entrega` |
| Consecutivo | `038` |
| Estado del incremento | `EN_ESPECIFICACION` |

## HU-001 — Pedido con entrega y estados

**Como** operador  
**quiero** agrupar cartas de stock en un pedido con entrega y estados reservado/pagado/entregado  
**para** no atar al cliente a una tienda y tener historial.

#### Criterios de aceptación

- [ ] CA-1: Cliente sin `tienda_entrega` obligatorio.
- [ ] CA-2: Un solo pedido `reservado` o `pagado` por cliente.
- [ ] CA-3: Pagar = finalizar venta de las líneas del pedido + snapshot.
- [ ] CA-4: Entregar solo desde `pagado`.
- [ ] CA-5: Incoming no se toca.

#### Casos borde

- CB-1: Pagar pedido sin líneas → 400.
- CB-2: Reservar carta sin pedido abierto → 409.
- CB-3: Backfill de reservas sueltas.

#### Tareas

| ID | Descripción | Estado |
|----|-------------|--------|
| T-01 | Catálogo tiendas + validación entrega | TODO |
| T-02 | Schema/repo Pedido; `pedido_id` en Reserva; Client DTO | TODO |
| T-03 | API CRUD pedido + pagar/entregar | TODO |
| T-04 | Ajustar POST/DELETE reserva al pedido abierto | TODO |
| T-05 | Compat `finalizar-venta` → pagar | TODO |
| T-06 | Script backfill + tests Jest | TODO |

## Registro de estados de tareas

| ID | Estado | Historia | Última actualización (ISO) |
|----|--------|----------|----------------------------|
| T-01 | TODO | HU-001 | 2026-08-17 |
| T-02 | TODO | HU-001 | 2026-08-17 |
| T-03 | TODO | HU-001 | 2026-08-17 |
| T-04 | TODO | HU-001 | 2026-08-17 |
| T-05 | TODO | HU-001 | 2026-08-17 |
| T-06 | TODO | HU-001 | 2026-08-17 |
