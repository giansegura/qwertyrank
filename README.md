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
