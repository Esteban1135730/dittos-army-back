# Si ves `queryTxt ETIMEOUT` con MongoDB Atlas

`mongodb+srv://` hace una consulta **DNS (TXT/SRV)** al hostname del cluster. Si tu red o el DNS de tu PC fallan o van lentos, obtienes **`ETIMEOUT`** antes incluso de usar usuario/contraseña.

**Solución que suele funcionar de inmediato:** dejar de usar `mongodb+srv` y usar la cadena **`mongodb://`** con los tres hosts `cluster0-shard-00-xx....mongodb.net:27017` que Atlas te da (cadena “estándar”). Esa conexión **no** usa la consulta DNS que te está fallando.

---

## Opción A — Copiar la URI estándar desde Atlas (recomendado)

1. Entra a [cloud.mongodb.com](https://cloud.mongodb.com) → tu proyecto.
2. En **Database** / **Clusters**, en tu cluster pulsa **Connect**.
3. Elige **Drivers** (conectar la aplicación).
4. Driver **Node.js** y una versión reciente.
5. En la pantalla de la cadena de conexión, **no uses solo la que empieza por `mongodb+srv://`**. Busca una de estas variantes según tu interfaz:
   - Texto tipo **“Standard connection string”**, **“mongodb://”**, **“connection string without SRV”**, o un **desplegable / pestaña** entre SRV y no-SRV.
   - Si solo ves `mongodb+srv`, prueba cambiar la **versión del driver** (a veces aparece la URI `mongodb://` en versiones antiguas) o abre **Connect → MongoDB Compass**: en algunos flujos Compass muestra también la forma estándar.
6. Copia la cadena que empiece por **`mongodb://`** y lleve **varios hosts** separados por comas, puerto **27017**, y parámetros como **`ssl=true`** y **`replicaSet=...`**.
7. Sustituye `<password>` por tu contraseña y **asegúrate de que el nombre de la base** esté en la ruta, por ejemplo:
   `/ditto-army-db` **antes** del `?`.
8. Pega el resultado en **`MONGODB_URI`** en `dittos-army-back/.env` y vuelve a ejecutar `npm run script:db-init` o `npm run start:dev`.

Documentación oficial de troubleshooting: [Connect to a Cluster](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

---

## Opción B — Mejorar DNS / red (si quieres seguir con `mongodb+srv`)

1. **Probar otra red** (datos del celular por hotspot).
2. En Windows: configurar DNS **8.8.8.8** y **8.8.4.4** (o **1.1.1.1**) en la tarjeta de red activa.
3. Reiniciar el script o el backend.

---

## Ejemplo de formato `mongodb://` (hosts ilustrativos)

**No copies esto a ciegas:** los nombres `cluster0-shard-00-00` y el `replicaSet` son **de tu cluster**; deben coincidir con lo que Atlas muestra en la cadena estándar.

```txt
mongodb://USUARIO:PASSWORD@cluster0-shard-00-00.xxxxx.mongodb.net:27017,cluster0-shard-00-01.xxxxx.mongodb.net:27017,cluster0-shard-00-02.xxxxx.mongodb.net:27017/ditto-army-db?ssl=true&replicaSet=atlas-xxxxx-shard-0&authSource=admin
```

- La base (`ditto-army-db`) va en la ruta **antes** de `?`.
- Si la contraseña tiene caracteres especiales, codifícala en la URL o cámbiala en Atlas por una compatible.

---

## Comprobación DNS (opcional, PowerShell)

Si quieres ver si tu PC resuelve el SRV (fallará igual que Node si el problema es DNS):

```powershell
nslookup -type=TXT _mongodb._tcp.cluster0.wkz7lph.mongodb.net
```

Si esto también **timeout** o falla, confirma que el problema es DNS/red, no la aplicación.
