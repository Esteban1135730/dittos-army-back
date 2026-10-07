# Colecciones MongoDB (equivalente a “tablas”)

En MongoDB **no hay tablas**: hay **colecciones** y **documentos**. Esta app usa **Mongoose**: los modelos en `src/schema/` definen la forma de los documentos; las colecciones se nombran en plural en minúsculas (convención por defecto).

## Lista alineada al backend

| Colección (aprox.) | Modelo | Uso |
|--------------------|--------|-----|
| `stocks` | Stock | Inventario / cartas |
| `pvps` | Pvp | Precios por carta |
| `sales` | Sale | Ventas, propiedad, etc. |
| `clients` | Client | Clientes |
| `reservas` | Reserva | Reservas |
| `incomingbatches` | IncomingBatch | Lotes de compras |
| `incomingbatchitems` | IncomingBatchItem | Ítems del lote |
| `incomingrounds` | IncomingRound | Rondas |
| `incomingrounditems` | IncomingRoundItem | Ítems de ronda |
| `incomingshiprounds` | IncomingShipRound | Rondas envío |
| `incomingshiprounditems` | IncomingShipRoundItem | Ítems envío |
| `electronicinvoices` | ElectronicInvoice | Facturación electrónica / Factus |

Los nombres exactos los calcula Mongoose; el script `npm run script:db-init` los crea vacíos si faltan.

## URI correcta

Incluye **usuario**, **contraseña sin `< >`**, **host** y **nombre de base** antes de `?`:

```txt
mongodb+srv://USUARIO:CONTRASEÑA@cluster0.xxxxx.mongodb.net/ditto-army-db?retryWrites=true&w=majority&appName=Cluster0
```

No compartas la contraseña en repositorios ni chats.
