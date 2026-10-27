# TallaYa en producción (Dokploy)

TallaYa corre en el Dokploy compartido de la empresa: **https://dokploy.qvaarbi.com**
(VPS Cherry Servers `84.32.53.69`). Es el mismo patrón que FulaYa, CuadraYa y DivisaYa:
**push a `main` = despliegue**.

## Datos del stack

| Dato | Valor |
|---|---|
| Proyecto Dokploy | `tallaya` (entorno `production`) |
| Compose | `tallaya-stack` · id `Hax4xtrvLzQHvwiJ2fppp` · appName `tallaya-stack-ybmy8c` |
| Origen | git `git@github.com:jetrader-cu/opengym.git`, rama `main` |
| Fichero | `./docker-compose.dokploy.yml` |
| Clave SSH en Dokploy | `github-opengym` (deploy key de solo lectura) |
| Disparador | `autoDeploy: true`, `triggerType: push` |
| Dominio | `https://tallaya.qvaarbi.com` (Traefik + Let's Encrypt) |
| Contenedores | `tallaya-stack-ybmy8c-{api,web}-1` |
| Datos | volumen `tallaya_data` → `/data` del api. **Hacer copia de seguridad.** |

El stack son dos servicios. `web` (nginx) sirve la app y pasa `/api` a `api` (Node) por la red
interna `tallaya-internal`. El api no está en la red pública: solo nginx lo ve, como `tallaya-api`.
Un solo origen, que es lo que exigen las passkeys.

## Variables de entorno

- Plantilla explicada: [`.env.example`](../.env.example). Para producción:
  `cp .env.example .env.production`, rellenar y pegar en Dokploy → `tallaya-stack` → Environment.
- Dokploy ya tiene las 59 variables cargadas con los valores de producción que no son secretos
  (`APP_HOST`, `RP_ID`, `ORIGIN`, `RP_NAME`, `DEFAULT_LANG=es`, `PASSWORD_LOGIN=1`…). Los
  secretos de terceros (QvaPay, TronDealer, PayPal, cuentas de Transfermóvil/EnZona, elToque,
  Telegram, Resend, R2) están **vacíos**: los rellena el dueño.
- `TRONDEALER_WEBHOOK_SECRET` y `SMS_GATEWAY_HMAC_SECRET` ya llevan un valor aleatorio generado
  al crear el stack (son nuestros, no de un tercero).
- Las variables de cobro están marcadas como **reservadas**: el código de planes aún no existe y
  nada las lee. `BILLING_ENABLED=0` y `QVAPAY_MOCK_MODE=1` hasta que exista.
- **Cambiar una variable no afecta a lo que ya corre**: hay que redesplegar.

## Lo que falta hacer a mano (una sola vez)

Estos pasos necesitan permisos que la sesión de Claude no tiene.

1. **DNS** (Cloudflare, zona `qvaarbi.com`): registro `A` `tallaya` → `84.32.53.69`,
   **DNS only (nube gris)**, como el resto de hosts. Sin él Traefik no obtiene el certificado.
   Añadirlo también a `cloudflare-dns-qvaarbi.com.txt` en el repo de QvaArbi (fuente de verdad).
2. **Deploy key** en GitHub → `jetrader-cu/opengym` → Settings → Deploy keys → Add deploy key:
   - Title: `dokploy-tallaya`
   - Key: la clave pública de `github-opengym` (Dokploy → Settings → SSH Keys, o la que se
     entregó en el chat al crear el stack)
   - **Sin** «Allow write access».
3. **Webhook** en GitHub → `jetrader-cu/opengym` → Settings → Webhooks → Add webhook:
   - Payload URL: `https://dokploy.qvaarbi.com/api/deploy/compose/<refreshToken>` (el
     `refreshToken` está en Dokploy → `tallaya-stack` → Deployments → Webhook URL)
   - **Content type: `application/json`**. Con `form` Dokploy responde 301 y GitHub descarta la
     entrega sin dejar rastro (lección de QvaArbi).
   - SSL verification activado · Solo el evento `push`.
4. **Primer despliegue**: mergear la rama con `docker-compose.dokploy.yml` a `main`. El push
   dispara el webhook. Comprobar en Dokploy → Deployments que termina en `done` y que
   `https://tallaya.qvaarbi.com/api/health` responde.
5. **Administrador**: registrarse en la web, copiar el uid (Ajustes → Cuenta) y ponerlo en
   `ADMIN_UIDS`. Redesplegar.

## Comprobar el estado (solo lectura)

```bash
B=https://dokploy.qvaarbi.com/api; H="x-api-key: $DOKPLOY_API_KEY"
curl -sS -H "$H" "$B/compose.one?composeId=Hax4xtrvLzQHvwiJ2fppp" | jq '{composeStatus, autoDeploy, customGitBranch}'
curl -sS -H "$H" "$B/deployment.allByCompose?composeId=Hax4xtrvLzQHvwiJ2fppp" | jq '.[0] | {status, title, createdAt}'
curl -sS -H "$H" "$B/docker.getContainersByAppNameMatch?appName=tallaya-stack-ybmy8c&appType=docker-compose"
curl -fsS https://tallaya.qvaarbi.com/api/health
```

No imprimir el campo `env` de `compose.one`: lleva los secretos de producción.

## Copias de seguridad

Todo el estado vive en el volumen `tallaya_data` (usuarios, passkeys, entrenos de cada usuario,
secreto de sesión, fotos y vídeos subidos). Añadirlo al job diario de volúmenes a R2 de la
empresa (skill `co-backups-dr`) con `R2_BUCKET=tallaya-backups`.
