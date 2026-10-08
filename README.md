# QwertyRank

Test de velocidad de escritura con un ranking por idioma (inglés, español y portugués) y tipo de teclado (físico o táctil), con la mejor marca de cada jugador desde siempre. Las partidas Ranked las valida el servidor.

## Desarrollo local

Requisitos: Node 24 (`.nvmrc`), pnpm y Docker.

```bash
pnpm install
docker compose up -d          # PostgreSQL, Redis y SRH (emula la API de Upstash)
cp .env.example .env.local    # genera tus secretos con: openssl rand -base64 32
pnpm db:migrate
pnpm dev                      # http://localhost:3000
```

## Cuentas

- Better Auth necesita `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` en `.env.local` (ver `.env.example`).
- **Enlace por email en local:** sin `RESEND_API_KEY`, el email no sale. El enlace aparece en la consola de `pnpm dev` (línea `[email] …`). Ábrelo en el mismo navegador.
- **Google (opcional):**
  1. En Google Cloud Console → APIs y servicios → Credenciales, crea un "ID de cliente de OAuth" de tipo aplicación web.
  2. Añade los URI de redirección `http://localhost:3000/api/auth/callback/google` y `https://qwertyrank.com/api/auth/callback/google`.
  3. Pon el ID y el secreto en `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

  Sin ellas, el botón de Google no aparece.
- **Resend (producción):** verifica el dominio en Resend y define `RESEND_API_KEY` y `EMAIL_FROM`. En la producción de Vercel la clave es obligatoria.
- **Passkeys:** se añaden en Ajustes, con una sesión de menos de un día, y sirven para entrar. No crean cuentas.

## Rankings

- **Fuente de verdad:** `bests` en PostgreSQL, con la mejor partida de cada jugador por idioma y teclado: 6 rankings, sin periodos.
- **Redis** guarda un ranking por idioma y teclado (`lb:{idioma}:{teclado}`, sin caducidad) y calcula las posiciones. `pnpm redis:rebuild --yes` lo rehace desde PostgreSQL y borra las claves que sobran.
- **El top 100** de la pantalla de ranking se lee de PostgreSQL. La página se regenera cada 60 s, y al momento cuando alguien entra en el top.
- **Partidas anónimas:** se pueden guardar en una cuenta en los 10 minutos siguientes ("Guárdalo").

## Moderación

- **Pase humano:** antes de una partida Ranked, Cloudflare Turnstile hace un reto invisible; superado, vale una hora. En local es opcional: sin `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` no se pide. En producción son obligatorias (widget "Managed" en el panel de Cloudflare). Los E2E usan las claves de prueba de Cloudflare, así que necesitan red.
- **Límites:** 100 partidas Ranked por hora por cuenta (o navegador) y 150 por IP; 10 denuncias al día por jugador.
- **Admins:** `pnpm admin:grant tu@email.com` da el rol (y `pnpm admin:revoke` lo quita). El panel está en `/admin`; para quien no es admin, no existe (404).
- **Reconstruir Redis:** `pnpm redis:rebuild` dice lo que haría; `pnpm redis:rebuild --yes` lo hace.
- **Contra producción:** `vercel env pull .env.vercel-prod --environment=production` y después `pnpm redis:rebuild --env .env.vercel-prod [--yes]` (o `pnpm admin:grant tu@email.com --env .env.vercel-prod`). Con `--env` el script lee solo ese archivo y muestra los hosts de PostgreSQL y Redis antes de actuar. Borra `.env.vercel-prod` al terminar. No uses nunca `.env.production.local` en local: `next build`, `next start` y los E2E lo cargarían y actuarían contra producción.

## Verificación de récords

- **Cuándo:** una partida con cuenta que entraría en el top 10 de su ranking (contado en PostgreSQL entre jugadores activos) queda en `review` si sus PPM pasan del 110 % del nivel verificado del jugador en ese idioma y teclado (sin nivel, siempre). No entra en los rankings hasta verificarla.
- **Cómo:** una partida de 30 s con el texto dibujado en un `canvas`, con el mismo teclado, al menos un 90 % de precisión y el 85 % de las PPM del récord. Hasta 3 intentos en 24 h, desde el resultado ("Verificar ahora") o desde `/verify`. Al superarla se publican todas sus partidas en `review` (cada una con su hora original, que decide el desempate) y el nivel verificado sube al del récord.
- **Caducidad:** se decide al leer, sin tarea programada. Las partidas de una verificación fallida o caducada se quedan en `review`, fuera de los rankings y del perfil.
- **Panel:** `/admin/records` (pendientes, verificados y fallidos o caducados de los últimos 7 días) y `/admin/games/<id>` (reproducción y ritmo de cualquier partida). Es de consulta: se actúa con las sanciones de la ficha.
- **E2E:** los jugadores de los E2E de ranking empiezan con un nivel verificado; los de `e2e/verification.spec.ts` juegan una partida de unas 140 PPM para entrar en el top 10 (la base de datos de `.env.local` no debe tener diez jugadores activos más rápidos en inglés que no sean de prueba) y se borran al acabar. Antes de cada ejecución, `e2e/global-setup.ts` borra las cuentas `@example.com` que dejaron ejecuciones anteriores, con sus marcas y sus partidas.

## Tests

| Comando | Qué ejecuta | Necesita |
|---|---|---|
| `pnpm test` | Tests unitarios (Vitest + jsdom) | — |
| `pnpm test:int` | Tests de integración contra PostgreSQL y Redis reales | `docker compose up -d` |
| `pnpm test:e2e` | Tests E2E con Playwright, en escritorio y móvil emulado | `docker compose up -d` y `.env.local` |
| `pnpm lint` / `pnpm typecheck` | ESLint y TypeScript | — |
| `pnpm budget` | JS propio de la portada (y de `/practice`) en gzip, por encima de `/_not-found`; falla si la portada pasa de 30,0 KB | `pnpm build` antes, y `python3` |

La CI (`.github/workflows/ci.yml`) lo ejecuta todo en cada PR y en `main`, en tres jobs: `checks` (lint, tipos y unitarios), `integration` (con PostgreSQL, Redis y SRH como servicios) y `e2e` (E2E y `pnpm budget` sobre su build). Los tres deben pasar para integrar en `main`.

## Base de datos

- El esquema está en `src/server/db/schema.ts`.
- Si lo cambias, genera la migración con `pnpm db:generate --name <nombre>` y aplícala con `pnpm db:migrate`.
- **En Vercel las migraciones se aplican en el build** (`vercel.json`: `pnpm db:migrate && pnpm build`), cada vista previa en su propia rama de Neon. Mientras se construye el despliegue nuevo, el anterior sigue sirviendo con la base ya migrada: una migración debe funcionar también con el código anterior. Primero se añade y, en otro despliegue, se quita lo que sobre.

## Despliegue y operación

La guía para abrir la beta (cuentas, variables y comprobaciones) está en [`docs/launch.md`](docs/launch.md).

- **Entornos:** producción en `qwertyrank.com` y una vista previa por PR, con su rama de Neon. En las vistas previas, `BETTER_AUTH_URL` sale de la URL de su rama y `REDIS_KEY_PREFIX` es `pr-<número de la PR>:`.
- **Tarea diaria** (`GET /api/cron/daily`, Vercel Cron a las 04:00 UTC, con `CRON_SECRET`):
  - borra las pulsaciones de más de 30 días, salvo las de las mejores marcas vigentes, y antes guarda de cada una un extracto de ritmo seudónimo (con PPM y precisión redondeadas) en `rhythm_samples`, para calibrar el riesgo;
  - quita `anon_id` e `ip_hash` a todas las partidas de más de 30 días, con cuenta o sin ella.

  En local: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily`.
- **Sentry**, solo en el servidor (`src/instrumentation.ts`). Sin `SENTRY_DSN` no se inicia. Solo conserva el método de la petición: ni URL con su query, ni cuerpo, ni cabeceras, ni cookies. Tampoco los parámetros de las consultas fallidas, los argumentos de `console.error` ni las migas de consola.
- **Analítica:** Vercel Web Analytics y Speed Insights, solo en producción y sin JS propio en la portada.
- **Beta:** nada se indexa mientras `INDEXABLE` (`src/lib/site.ts`) sea `false`.
