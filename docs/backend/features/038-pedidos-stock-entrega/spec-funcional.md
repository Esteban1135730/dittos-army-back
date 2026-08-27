# Spec funcional — Pedidos de stock, entrega y estados

## Resumen

Los clientes dejan de tener una tienda fija. Las cartas de **stock** se agrupan en un **Pedido** con:

- estado `reservado` | `pagado` | `entregado`
- datos de entrega (tienda de Bogotá **o** envío / punto)
- fecha tentativa de entrega

`pagado` equivale al actual «Finalizar venta»: stock a `vendida` + registros de `Sale`. `entregado` solo marca que ya se entregó.

Un cliente puede tener **como máximo un pedido no entregado**. El historial muestra pedidos anteriores.

## Actores

- Operador del panel (`dittos-army-front`), feature `clientes`.
- No aplica `dittos-army-store` ni reservas incoming («en camino»).

## Supuestos (preguntas de entrega saltadas)

Si hay que cambiarlos, se corrige esta spec **antes** de código:

1. El operador crea el pedido **antes** de agregar cartas (entrega + fecha).
2. Si no es tienda: se guardan **ciudad**, **dirección o punto de encuentro**, **notas**. Nombre y WhatsApp salen del cliente.
3. Catálogo de tiendas **hardcoded** (ids estables + nombre + dirección). Direcciones tomadas de fuentes públicas; LX Store y Play4Cards pueden corregirse en chat.

## Comportamiento — éxito

### Cliente

- Alta/edición: `nombre`, contacto, notas. **Sin** `tienda_entrega`.
- Detalle: historial de pedidos (más reciente primero) con estado, entrega, fecha tentativa, totales y líneas.

### Pedido abierto

1. `POST` pedido (`reservado`) con entrega + `fecha_tentativa_entrega`.
2. 409 si ya hay un pedido `reservado` o `pagado` del mismo cliente.
3. Agregar/quitar cartas de stock y editar precio **solo** si el pedido está `reservado`.
4. `pagar`: mismas reglas que finalizar-venta sobre las líneas de **ese** pedido. Pasa a `pagado`, guarda snapshot de líneas, borra documentos `Reserva`, crea `Sale`, stock `vendida`.
5. `entregar`: solo desde `pagado` → `entregado` + `delivered_at`.
6. Cancelar pedido `reservado`: libera stock y borra el pedido (aunque quede vacío).
7. Si se quita la última carta, el pedido `reservado` **sigue** hasta que el operador lo cancele o agregue más cartas.

### Entrega

- `entrega_en_tienda = true`: `store_id` de la lista; se persisten `store_name` y `store_address` (snapshot).
- `entrega_en_tienda = false`: `ciudad`, `direccion_o_punto` (requeridos), `notas` opcional.

Editar entrega y fecha: solo en `reservado`.

### Tiendas (Bogotá)

| id | Nombre | Dirección |
|----|--------|-----------|
| `hidden-tcg-store` | Hidden TCG Store | Cl. 52 #24-18, Bogotá |
| `draco-hobby-center` | Draco Hobby Center | Cra. 16 #76-27 Piso 2, Bogotá |
| `unlimited-hobby-center` | Unlimited Hobby Center | Cra. 13 #46-64 Piso 2, Chapinero, Bogotá |
| `lx-store` | LX Store | Cra. 99a #66a-85, Bogotá *(por confirmar)* |
| `play4cards` | Play4Cards | Cra. 62 #99-87, Barrio Los Andes, Bogotá *(por confirmar)* |
| `tokyo-hobby-nations` | Tokyo Hobby Nations | Cl. 53 #70-18, Bogotá |
| `valhalla` | Valhalla | Cl. 150 #16-56 local 2074, CC Cedritos, Bogotá |
| `real-burgers` | Real Burgers | Cra. 19A #162-27, Bogotá |

## Comportamiento — error

| Caso | HTTP | Mensaje |
|------|------|---------|
| Cliente inválido / no existe | 400 / 404 | ids / no encontrado |
| Segundo pedido abierto | 409 | Ya hay un pedido abierto |
| Agregar carta sin pedido `reservado` | 409 | Crea o reabre un pedido reservado |
| Pagar pedido vacío o no `reservado` | 400 / 409 | |
| Entregar si no está `pagado` | 409 | |
| Tienda desconocida / faltan datos de envío / fecha inválida | 400 | |
| Carta ya reservada / no disponible | igual que hoy (`error` en body o 409) | |

## Migración de datos

- `Client.tienda_entrega` deja de ser requerido; no se usa en API nueva.
- Reservas de stock existentes por cliente → un Pedido `reservado` con esas líneas.
- Entrega migrada: si `tienda_entrega` coincide (fuzzy) con un nombre del catálogo, `kind: tienda`; si no, `kind: envio` con `direccion_o_punto` = texto viejo y `ciudad` = «Bogotá».
- `fecha_tentativa_entrega` nula en migrados (el panel pide completarla al pagar o permite PATCH).

## Fuera de alcance

- Reservas incoming / CardTrader / «en camino» (otra spec).
- Tienda pública (`dittos-army-store`).
- Templates WhatsApp / Cloud API más allá de usar el texto de entrega en el resumen ya existente del panel.
- Múltiples pedidos abiertos.
- Pagar sin pasar stock a vendida.
