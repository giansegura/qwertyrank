# QwertyRank

Test de velocidad de escritura con rankings por idioma (inglés, español y portugués), por tipo de teclado (físico o táctil) y por periodo. Las partidas Ranked las valida el servidor.

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

## Tests

| Comando | Qué ejecuta | Necesita |
|---|---|---|
| `pnpm test` | Tests unitarios (Vitest + jsdom) | — |
| `pnpm test:int` | Tests de integración contra PostgreSQL y Redis reales | `docker compose up -d` |
| `pnpm test:e2e` | Tests E2E con Playwright, en escritorio y móvil emulado | `docker compose up -d` y `.env.local` |
| `pnpm lint` / `pnpm typecheck` | ESLint y TypeScript | — |

## Base de datos

- El esquema está en `src/server/db/schema.ts`.
- Si lo cambias, genera la migración con `pnpm db:generate --name <nombre>` y aplícala con `pnpm db:migrate`.
