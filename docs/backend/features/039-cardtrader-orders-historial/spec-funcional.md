# Spec funcional — Historial CardTrader (compras, ventas e inventario)

## Resumen

Módulo en el panel que **consolida todos los pedidos CardTrader** (como comprador y como vendedor), **agrupa las cartas** por variante operativa (**TCGdex `card_id` + idioma + rareza operativa**) y muestra, en una sola vista tipo historial:

- Qué unidades **siguen existiendo** (inventario local vendible, en tránsito, reservadas en pedido de cliente).
- Qué se **vendió** (venta local con **fecha**; venta en marketplace CT).
- Si una carta está **en reserva** (cliente): estado visible como parte del historial, con fecha de reserva y enlace al pedido si aplica.

No sustituye tránsito CT ni homologación; es una **capa de lectura / conciliación** para operación y auditoría.

## Actores

- Operador del panel Pokémon (`dittos-army-front`).
- Backend Nest (`dittos-army-back`) con token CardTrader ya configurado.

## Alcance v1 (acordado)

| Tema | Decisión |
|------|----------|
| Pedidos CT | **Comprador** y **vendedor** (pestañas o filtros). |
| Agrupación | **`card_id` TCGdex + `language` + `rareza` operativa** (misma convención que tránsito/reservas). |
| «Vendido» | **Todo**: ventas locales (`Sale`, stock `vendida`), ventas CT (pedidos seller), más estados visibles de reserva/pedido. |
| Entrega | **Pantalla nueva** en el panel (tabla + detalle expandible + totales). |

## Fuentes de verdad

1. **CardTrader API** — `GET /cardtrader/orders` (`order_as=buyer|seller`), paginación; ítems expandidos por cantidad cuando haga falta.
2. **Homologación / trazabilidad parcial** — unidades enviadas (`cardtrader_sent_units`, sesiones homolog) con `order_id` / `product_id` cuando existan.
3. **Tránsito CT** — líneas abiertas/cerradas en `cardtrader_transit_lines` (cantidades restantes).
4. **Stock local** — por owner DB; estados (`disponible`, `vendida`, `reservada`, etc.) y `product_kind` / `quantity`.
5. **Reservas y pedidos cliente** — `reservas`, `pedidos` (líneas con `stock_id`), `sales` (`created_at`, `type`).

## Comportamiento — pantalla principal

### Filtros

- Rango de fechas (por defecto: últimos 12 meses en compras CT; configurable).
- Rol CT: compras | ventas | ambos.
- Búsqueda por nombre, `card_id`, código de pedido CT.
- Owner (Pablo / Esteban) cuando el dato esté en tránsito/stock/reserva.

### Tabla agrupada (variante)

Columnas mínimas:

- Imagen (TCGdex / proxy, misma lógica que tránsito).
- Nombre, `card_id`, idioma, rareza.
- **Comprado en CT** (uds, rango de fechas de pedidos buyer).
- **Vendido en CT** (uds seller).
- **En tránsito** (uds restantes en lotes abiertos).
- **En stock** (uds vendibles locales).
- **En reserva / pedido cliente** (uds + indicador «reservado»).
- **Vendido local** (uds + **fecha última venta** visible en fila).

### Detalle expandible (historial)

Al expandir una fila, línea de tiempo ordenada por fecha (más reciente arriba o abajo — definir en UX como «reciente primero»):

| Tipo evento | Origen | Campos visibles |
|-------------|--------|-----------------|
| Compra CT | order buyer | `order_code`, fecha pago/envío, precio FX, cantidad |
| Venta CT | order seller | idem |
| Ingreso tránsito | lote CT | lote, fecha compra lote, uds |
| Stock creado | homolog/tanda | fecha `stocked_at` o creación, `stock_id` si hay enlace |
| Reserva cliente | `reservas` / pedido `reservado` | fecha reserva, cliente (nombre si API lo permite), pedido |
| Venta local | `sales` / stock `vendida` | **fecha venta** (`created_at`), monto COP, cliente si existe |
| En camino incoming | reserva incoming | opcional v2 si complica v1 |

Regla de copy: si la carta **está reservada ahora**, el badge «En reserva» debe verse **en la fila** sin abrir el detalle; el detalle lista reservas activas e históricas si el backend las expone.

## Limitaciones honestas (v1)

- No hay `order_id` CardTrader en cada documento de stock legacy: la conciliación **unitaria perfecta** solo aplica donde exista cadena homolog (`sent_unit` → `transit_line` → `stock_id`). Fuera de eso, los totales por variante son **agregados** (comprado CT vs existente+vendido local), no serial por unidad.
- Resolución TCGdex desde ítems CT sin homolog previo usa el mismo servicio `cardtrader/tcgdex/resolve` (puede fallar → fila «sin ID» agrupada aparte o excluida con contador).

## Criterios de aceptación

1. Con token CT válido, la pantalla carga sin error y muestra al menos totales buyer/seller paginados.
2. Una carta comprada en CT y luego vendida localmente aparece con uds compradas ≥ 1 y uds vendidas local ≥ 1, con **fecha de venta** en fila o detalle.
3. Una carta en reserva activa muestra uds reservadas y estado «reservado» en la fila.
4. Agrupación distingue dos rarezas operativas del mismo `card_id` e idioma.
5. Errores CT (rate limit, 401) muestran mensaje claro sin tumbar el resto de datos locales.

## Fuera de alcance v1

- Export CSV/PDF (v1.1).
- Yu-Gi-Oh panel (solo Pokémon salvo decisión explícita).
- Escritura en CardTrader o mutación de stock desde esta pantalla.
