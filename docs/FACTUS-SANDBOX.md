# Factus API v2 — Sandbox

## Credenciales (no subir al repo)

Configura en `dittos-army-back/.env` (copiar desde `.env.example`):

| Variable | Descripcion |
|----------|-------------|
| `FACTUS_BASE_URL` | `https://api-sandbox.factus.com.co` |
| `FACTUS_CLIENT_ID` | Client ID de Factus |
| `FACTUS_CLIENT_SECRET` | Client secret |
| `FACTUS_USERNAME` | Correo sandbox |
| `FACTUS_PASSWORD` | Contrasena sandbox |
| `FACTUS_NUMBERING_RANGE_ID` | Rango factura venta (sandbox suele ser `389`) |
| `FACTUS_IVA_RATE` | Porcentaje IVA en lineas, ej. `19.00` |

El backend obtiene el token en `POST /oauth/token` y llama `POST /v2/bills/validate`.

Alternativa: `FACTUS_API_TOKEN` con un `access_token` manual (expira ~1 h).

## Probar token en consola (PowerShell)

```powershell
$body = @{
  grant_type = "password"
  client_id = "TU_CLIENT_ID"
  client_secret = "TU_CLIENT_SECRET"
  username = "TU_USUARIO"
  password = "TU_PASSWORD"
}
Invoke-RestMethod -Uri "https://api-sandbox.factus.com.co/oauth/token" -Method POST -Body $body -ContentType "application/x-www-form-urlencoded"
```

## Flujo en Ditto Army

1. Crear borrador en la app (`/facturacion-electronica`).
2. **Enviar** — el back mapea el formulario a JSON v2 y valida en Factus.
3. **Estado** — consulta por `reference_code` en Factus.

## Seguridad

- No commitear `.env`.
- Si las credenciales se publicaron en un chat, pide a Factus rotarlas en sandbox.
