# Abrir la beta: guía de lanzamiento

Paso a paso para poner QwertyRank en `qwertyrank.com` como beta pública pero discreta: sin indexar, con la
etiqueta "beta" y sin invitaciones. El código ya está listo. Aquí solo hay cuentas, variables y comprobaciones.
Sigue el orden, porque algunos pasos usan lo creado en los anteriores.

> Todas las variables de entorno se ponen en Vercel → *Settings* → *Environment Variables*, por separado para
> **Production** y **Preview**. Las de Neon y Upstash las ponen sus integraciones.

## 1. Dominio

1. Compra `qwertyrank.com`. Recomendado: Cloudflare Registrar (precio de coste y Email Routing gratis).
2. Deja los DNS en Cloudflare. Vercel y Resend te pedirán registros más adelante.

## 2. Correo: `privacy@` y `feedback@`

En Cloudflare → *Email* → *Email Routing*:

1. Activa Email Routing para `qwertyrank.com` y verifica tu buzón personal como destino.
2. Crea dos direcciones personalizadas que reenvíen a tu buzón:
   - `privacy@qwertyrank.com`, la que aparece en la política de privacidad y los términos;
   - `feedback@qwertyrank.com`, la de la etiqueta "beta" y "Envíanos tus comentarios".
3. **Comprueba:** manda un correo a cada una y mira que llegue.

## 3. Vercel

1. Crea la cuenta (plan Hobby) e importa el repositorio de GitHub. El framework se detecta solo. `vercel.json` ya
   define el build (`pnpm db:migrate && pnpm build`), la tarea diaria y la región de las funciones (`fra1`, Fráncfort,
   junto a Neon y Upstash).

   El despliegue que Vercel lanza al importar el repositorio **falla** porque todavía no hay `DATABASE_URL`. Es lo
   esperado: se vuelve a desplegar tras los pasos 4 a 6.
2. *Settings* → *General* → *Node.js Version*: 24.x, la de `.nvmrc`.
3. *Settings* → *Domains*:
   - añade `qwertyrank.com`;
   - añade `www.qwertyrank.com` con redirección **308** a `qwertyrank.com`;
   - crea en Cloudflare los registros DNS que te pida Vercel (con el proxy de Cloudflare **desactivado**: nube gris).
4. *Analytics* → activa **Web Analytics**. *Speed Insights* → actívalo. La web ya carga sus scripts en producción.
5. Deja activada la opción por defecto *Automatically expose System Environment Variables*: las vistas previas la
   necesitan para su URL de Better Auth y su prefijo de Redis.

## 4. Neon (PostgreSQL)

1. Crea la cuenta y un proyecto en la región **Frankfurt** (`aws-eu-central-1`).
2. En Vercel → *Integrations*, instala **Neon**:
   - conéctalo al proyecto;
   - activa la creación de una rama por cada vista previa.

   La integración pone `DATABASE_URL` y `DATABASE_URL_UNPOOLED` en cada entorno.
3. **Comprueba:** en *Environment Variables* aparecen las dos, en Production y en Preview.
4. En la primera PR, comprueba en *Settings* → *Environment Variables* (o en el despliegue de la vista previa) que
   el `DATABASE_URL` de Preview apunta a una rama `preview/<rama>` de Neon y no a `main`. Si apunta a `main`, el build
   migraría la base de producción con el código de la PR.

## 5. Upstash (Redis)

1. Crea la cuenta y una base Redis en **Frankfurt** (`eu-central-1`).
2. En Vercel → *Integrations*, instala **Upstash** y conéctalo al proyecto. Pone `UPSTASH_REDIS_REST_URL` y
   `UPSTASH_REDIS_REST_TOKEN`. La app lee justo esos dos nombres: si la integración crea variables con otro nombre
   (por ejemplo `KV_REST_API_URL` y `KV_REST_API_TOKEN`), añade `UPSTASH_REDIS_REST_URL` y
   `UPSTASH_REDIS_REST_TOKEN` a mano con los mismos valores.
3. Añade `REDIS_KEY_PREFIX=qr:` **solo en Production**. En las vistas previas no la pongas: cada una usa su propio
   prefijo, `pr-<número de la PR>:`.
   Si `qr:` llega también a Preview, la vista previa se despliega en verde pero todas las peticiones fallan con un
   500 cuyo error menciona `REDIS_KEY_PREFIX` (la validación del entorno es perezosa): quítala de Preview.

## 6. Secretos

Genera cada uno con `openssl rand -base64 32`, **distintos en Production y en Preview**:

| Variable | Para qué |
|---|---|
| `ANON_COOKIE_SECRET` | Firma la cookie anónima |
| `IP_HASH_SECRET` | Hash diario de las IP y de las identidades baneadas |
| `BETTER_AUTH_SECRET` | Sesiones de Better Auth |
| `CRON_SECRET` | Protege la tarea diaria. Vercel Cron la manda en `Authorization` |

Además, **solo en Production**: `BETTER_AUTH_URL=https://qwertyrank.com`. En las vistas previas no hace falta: sale
de la URL de su rama.

## 7. Resend (emails)

1. Crea la cuenta y añade el dominio `qwertyrank.com`. Crea en Cloudflare los registros DNS (SPF, DKIM) que te pida
   y espera a que Resend lo marque como verificado.
2. Crea una clave de API y ponla en `RESEND_API_KEY`, en Production y en Preview.
3. `EMAIL_FROM=QwertyRank <noreply@qwertyrank.com>`, también en los dos.

## 8. Cloudflare Turnstile

1. En Cloudflare → *Turnstile*, crea un widget en modo **Managed** para el dominio `qwertyrank.com`.
2. **Production:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` con las claves del widget.
3. **Preview:** las claves de prueba de Cloudflare, que siempre aprueban:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB`
   - `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`

## 9. Google OAuth

1. En Google Cloud Console → *APIs y servicios* → *Credenciales*, usa (o crea) el ID de cliente de tipo aplicación
   web y añade el URI de redirección `https://qwertyrank.com/api/auth/callback/google`.
2. `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` **solo en Production**. En las vistas previas, que cambian de URL, se
   entra con enlace por email o con passkey.

## 10. Sentry

1. Crea la cuenta y elige la región de datos de la **UE** al crear la organización: después no se puede cambiar.
   Crea un proyecto de tipo *Next.js*. De la configuración solo necesitas el DSN.
2. `SENTRY_DSN` en Production y en Preview. Los eventos se distinguen por su `environment`.

Sentry corre solo en el servidor. No hay que tocar el código ni subir source maps.

## 11. GitHub: proteger `main`

En GitHub → *Settings* → *Branches* (o *Rules*), añade una regla para `main`:

- exigir una PR para integrar;
- exigir que pasen los checks **`checks`**, **`integration`**, **`e2e`** y **`conventional-title`** (aparecen tras
  la primera ejecución de la CI);
- exigir que la rama esté al día con `main`.

`conventional-title` (`.github/workflows/pr-title.yml`) comprueba que el título de la PR siga Conventional Commits:
con squash, ese título es el commit en `main`. En *Settings* → *General* → *Pull Requests*, deja solo **Allow squash
merging** con **Default commit message: Pull request title** (ya está así).

### CodeRabbit (revisión automática de PR)

1. Instala la app de GitHub **CodeRabbit** desde [coderabbit.ai](https://coderabbit.ai) y dale acceso solo al
   repositorio `qwertyrank`. Antes, mira en su página de precios qué incluye el plan gratuito para repositorios
   privados.
2. Lee la configuración del repositorio (`.coderabbit.yaml`): comenta cada PR en español, con un resumen, y tiene en
   cuenta `AGENTS.md` y `CLAUDE.md`.
3. No es un check obligatorio: sus comentarios no bloquean la integración.

## 12. Primer despliegue

1. Integra en `main`. Vercel despliega producción y el build aplica todas las migraciones a la base vacía. No hace
   falta `pnpm redis:rebuild`, porque no hay rankings que rehacer.
2. Abre `https://qwertyrank.com`: debe cargar la portada.
3. Vercel → *Settings* → *Cron Jobs*: aparece `/api/cron/daily` a las 04:00 UTC. Pulsa **Run** y mira en los logs
   de la función (Vercel no muestra el cuerpo de la respuesta) la línea `daily retention` con
   `{ extracted: …, deletedLogs: …, anonymizedGames: …, done: true }`.
   Como alternativa a **Run**, esta orden sí devuelve el JSON del informe. Usa el `CRON_SECRET` de Production, el de
   la sección 6 (*Secretos*; cópialo de *Environment Variables*). Pega el valor y pulsa Enter (así no queda en el
   historial del shell):

   ```bash
   read -rs CRON_SECRET
   curl -H "Authorization: Bearer $CRON_SECRET" https://qwertyrank.com/api/cron/daily
   ```

   Si la variable está marcada como *Sensitive* en Vercel, no se puede volver a leer de *Environment Variables*:
   guárdala al generarla (§6) o genera una nueva.
4. Crea tu cuenta en la web. Después nómbrate admin desde tu máquina:

   ```bash
   vercel login   # una vez
   vercel link    # una vez
   vercel env pull .env.vercel-prod --environment=production
   pnpm admin:grant <tu-email> --env .env.vercel-prod
   rm .env.vercel-prod
   ```

## 13. Prueba de humo

- [ ] Una partida anónima, «Guárdalo» y crear la cuenta: la partida pasa a tu cuenta.
- [ ] Entrar con el enlace por email, con una passkey y con Google.
- [ ] Un récord que pida verificación, verificado desde un **Android** y un **iPhone** reales: al tocar el texto se
      abre el teclado.
- [ ] El ranking y tu perfil enseñan tu marca.
- [ ] En las vistas previas, las passkeys solo funcionan en la URL de la rama (`*-git-<rama>-*.vercel.app`), no en
      la URL única del despliegue.
- [ ] El pie: "beta" y "Envíanos tus comentarios" abren un correo a `feedback@`; Privacidad y Términos cargan en los
      tres idiomas.
- [ ] `curl -sI https://qwertyrank.com/en | grep -i x-robots-tag` devuelve `noindex`.
- [ ] Sentry recibe errores. En una vista previa:
      1. pon un `UPSTASH_REDIS_REST_TOKEN` incorrecto solo en **Preview** y vuelve a desplegarla;
      2. pulsa *Empezar* en Ranked: el fallo de Redis aparece en Sentry con `environment: preview`;
      3. restaura la variable.
- [ ] Web Analytics registra tus visitas al navegar entre páginas.

## 14. Vigilancia semanal

- Vercel → *Usage*: ejecuciones de funciones, peticiones y CPU frente a los límites de Hobby (spec general §8.7). Si
  algo pasa del 60–70 %, toca plantearse el plan Pro.
- Sentry: errores nuevos.
- Neon y Upstash: almacenamiento y comandos frente a sus planes gratuitos.

## Cuando acabe la beta (fase 5)

- `INDEXABLE = true` en `src/lib/site.ts`: quita el `noindex`.
- Después, envía `https://qwertyrank.com/sitemap.xml` a Google Search Console y a Bing Webmaster Tools.
- Revisión de la política de privacidad y los términos por un abogado.
