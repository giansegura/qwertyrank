# QwertyRank — Fase 2: partida con servidor — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las partidas Ranked las controle el servidor: el texto llega al pulsar Empezar, hay cuenta atrás, el reloj oficial es el de Redis, las pulsaciones se envían cada ~3 s y el servidor puntúa, aplica las reglas anti-trampas, clasifica el teclado y guarda cada partida en PostgreSQL.

**Architecture:**
- **Partidas en curso:** viven en Redis (Upstash; en local, SRH sobre Redis 7). Scripts Lua atómicos que toman la hora con `TIME` crean la partida, añaden tandas en orden y reclaman el final de forma idempotente.
- **Al terminar:** el servidor reproduce las pulsaciones con el mismo `replay` de la fase 1, aplica las reglas puras de `src/server/anticheat` y guarda en PostgreSQL (Drizzle + postgres.js) en una transacción.
- **En el navegador:** la sesión de la fase 1 se generaliza (arranque manual, hora del evento) y la captura del teclado se extrae a un hook para que práctica y Ranked la compartan.

**Tech Stack:** Next.js 16.3.8 (route handlers), Drizzle ORM 0.45.3 + drizzle-kit 0.31.11, postgres.js 3.4.9, @upstash/redis 1.39.0, Zod 4.6.5, Docker Compose (PostgreSQL 17, Redis 7, SRH), Vitest 5 (proyectos `unit` e `integration`), Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-10-04-qwertyrank-design.md` (fase 2 de la §11; relevantes §3.4, §4.2, §4.3, §4.5, §5.2, §6, §8.3, §8.4, §8.6).

## Global Constraints

- **No hacer commits ni push.** Regla global del usuario: solo cuando él lo pida. Donde un plan normal diría "Commit", aquí hay un **Checkpoint** de verificación.
- Versiones fijadas: `drizzle-orm@0.45.3`, `postgres@3.4.9`, `zod@4.6.5`, `@upstash/redis@1.39.0`, `server-only`, `drizzle-kit@0.31.11`, `@next/env@16.3.8`.
- Servicios locales (`docker-compose.yml`): PostgreSQL en el puerto **54329**, SRH (API de Upstash) en el **8079**, token `local_dev_token`. Los tests de integración usan la base de datos `qwertyrank_test` y el prefijo de claves `qrtest:`.
- Tiempos de Ranked: cuenta atrás **3 000 ms**, partida **30 000 ms**, margen **3 000 ms**; partida en Redis **120 s**, resultado **600 s**; tandas cada **3 000 ms**; tolerancia de reloj **250 ms**.
- Reglas (spec §4.3):
  - ráfaga: mediana < **25 ms** en ventanas de **20** entradas;
  - techo de PPM: **320** físico / **220** táctil;
  - texto sin `keydown` en el segundo anterior: rechazo (solo físico);
  - inserciones de varias letras: físico **0**, táctil hasta **2**;
  - `isTrusted = false`: rechazo.
- Todo `src/server/**` importa `server-only`, **excepto** `src/server/db/schema.ts`, que también lo carga drizzle-kit.
- Todo texto visible sale de `messages/{en,es,pt}.json`.
- JavaScript propio de la portada **≤ 30 KB gzip** sobre la base de `/_not-found` (spec §7.5).
- Antes de tocar APIs de Next.js, leer `node_modules/next/dist/docs/` (lo exige `AGENTS.md`).

### Del spec, fuera de esta fase

| Spec | Fase |
|---|---|
| `ranks` y `wouldRank` en la respuesta del final (§8.3), `claim` | 3 (cuentas y rankings) |
| Turnstile, límites de partidas, puntuación de riesgo, verificación de récords (§4.4, §4.6, §4.8) | 4 (anti-trampas completo) |
| Borrado de `keystroke_logs` a los 30 días (§6, §8.5) | 5 |

## Review Focus

1. **El Upstash real frente a SRH.** Los tests usan SRH sobre Redis 7. En producción, los scripts Lua (sobre todo `redis.call('TIME')` y las respuestas anidadas de `HGETALL`/`LRANGE`) deben comportarse igual. Lo cubre la comprobación con credenciales reales de la Task 8 (Step 7).
2. **Neon en producción.** La app usa la URL del pooler (`prepare: false`) y las migraciones la directa (`DATABASE_URL_UNPOOLED`). Lo cubre la Task 8 (Step 7).
3. **Pestaña en segundo plano o red lenta durante la partida.** El final llega tarde y el servidor responde `late`. La interfaz debe explicarlo como problema de conexión y no quedarse colgada. Lo cubre el test "un final que llega tarde…" (Task 7).
4. **Cookies bloqueadas.** El servidor no reconoce la partida (404) y la interfaz debe mostrar el resultado local como no válido. Lo cubre el test "si el servidor no reconoce la partida…" (Task 7).
5. **Teclados de móvil reales.** Una composición o autocorrección de Gboard puede insertar varias letras de golpe y provocar falsos `multi_insert`, y la clasificación físico/táctil por duración de pulsación está sin calibrar. Requiere la prueba en dispositivos reales (Task 8, Step 8).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `docker-compose.yml` | PostgreSQL 17, Redis 7 y SRH para desarrollo y tests |
| `.env.example`, `.env.test` | Variables de desarrollo (plantilla) y de los tests de integración |
| `drizzle.config.ts`, `drizzle/` | Configuración de drizzle-kit y migraciones generadas |
| `vitest.config.mts` | Proyectos `unit` (jsdom) e `integration` (Node + Docker) |
| `src/test/integration-env.ts`, `src/test/integration-global-setup.ts` | Carga `.env.test`; crea la base de datos de test y migra |
| `src/test/typing-events.ts` | Helpers para construir pulsaciones en los tests del anti-trampas |
| `src/lib/game/types.ts` | Tipos del protocolo de partidas, compartidos por navegador y servidor |
| `src/server/env.ts` | Variables del servidor validadas con Zod |
| `src/server/db/schema.ts`, `src/server/db/client.ts` | Tablas `games` y `keystroke_logs`; cliente Drizzle |
| `src/server/redis.ts` | Cliente de Upstash Redis |
| `src/server/game/store.ts` | Partidas en curso en Redis (scripts Lua con `TIME`) |
| `src/server/anticheat/rules.ts` | Reglas que rechazan una partida |
| `src/server/anticheat/input-type.ts` | Teclado físico o táctil según las pulsaciones |
| `src/server/game/persist.ts` | Guardado de partida + pulsaciones en una transacción |
| `src/server/game/service.ts`, `instance.ts` | Inicio, tandas y final con veredicto; instancia con las dependencias reales |
| `src/server/anon.ts`, `src/server/ip-hash.ts` | Cookie anónima firmada; hash de IP con sal diaria |
| `src/server/game/schemas.ts`, `http.ts` | Validación Zod de la API; utilidades de las rutas |
| `src/app/api/game/start/route.ts`, `[id]/keys/route.ts`, `[id]/finish/route.ts` | Rutas de la API |
| `src/components/typing-test/use-typing-session.ts` | Sesión de juego (ahora con arranque manual, `load`, `begin`, `onFinish`) |
| `src/components/typing-test/event-time.ts` | Hora del evento en la escala de `performance.now()` |
| `src/components/typing-test/use-typing-input.ts` | Captura del teclado reutilizable (antes dentro de `TypingTest`) |
| `src/components/ranked/api.ts`, `batch-sender.ts`, `client-env.ts`, `ranked-test.tsx` | Ranked en el navegador |
| `e2e/ranked.spec.ts` | E2E de Ranked contra el servidor real |

---

### Task 1: Entorno local, esquema y migraciones

**Files:**
- Modify: `package.json`, `.gitignore`, `vitest.config.mts`
- Create: `docker-compose.yml`, `.env.example`, `.env.test`, `drizzle.config.ts`, `src/server/env.ts`, `src/server/db/schema.ts`, `src/server/db/client.ts`, `src/test/integration-env.ts`, `src/test/integration-global-setup.ts`
- Generate: `drizzle/0000_init.sql`, `drizzle/meta/*`
- Test: `src/server/db/schema.int.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `serverEnv(): ServerEnv` con `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_KEY_PREFIX` (por defecto `"qr:"`), `ANON_COOKIE_SECRET` e `IP_HASH_SECRET` (≥ 32 caracteres).
  - Tablas Drizzle `games` y `keystrokeLogs`.
  - `createDb(url: string): Db`, `getDb(): Db` y `type Db`.
  - Proyectos de Vitest: `pnpm test` (unit) y `pnpm test:int` (integration).

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add drizzle-orm@0.45.3 postgres@3.4.9 zod@4.6.5 @upstash/redis@1.39.0 server-only
pnpm add -D drizzle-kit@0.31.11 @next/env@16.3.8
```

En `package.json`, cambia los scripts `test` y `test:watch` y añade los nuevos (deja el resto igual):

```json
"test": "vitest run --project unit",
"test:watch": "vitest --project unit",
"test:int": "vitest run --project integration",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 2: Servicios locales con Docker**

`docker-compose.yml`:

```yaml
# Servicios locales para desarrollo y tests: PostgreSQL, Redis y SRH (emula la API HTTP de Upstash).
name: qwertyrank

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: qwertyrank
      POSTGRES_PASSWORD: qwertyrank
      POSTGRES_DB: qwertyrank
    ports:
      - "54329:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U qwertyrank -d qwertyrank"]
      interval: 2s
      timeout: 3s
      retries: 30

  redis:
    image: redis:7-alpine

  redis-http:
    image: hiett/serverless-redis-http:latest
    environment:
      SRH_MODE: env
      SRH_TOKEN: local_dev_token
      SRH_CONNECTION_STRING: redis://redis:6379
    ports:
      - "8079:80"
    depends_on:
      - redis

volumes:
  postgres-data:
```

Run: `docker compose up -d --wait`
Expected: `postgres` en estado healthy y `redis` y `redis-http` arrancados.

Comprueba que el Lua de SRH tiene `TIME`:

```bash
curl -s -X POST http://localhost:8079 -H "Authorization: Bearer local_dev_token" -H "Content-Type: application/json" -d '["EVAL","local t = redis.call(\"TIME\"); return {t[1], t[2]}","0"]'
```

Expected: `{"result":["<segundos>","<microsegundos>"]}`.

- [ ] **Step 3: Variables de entorno**

`.env.example`:

```bash
# Copia este archivo a .env.local. Los valores apuntan a los servicios de `docker compose up -d`.
DATABASE_URL=postgres://qwertyrank:qwertyrank@localhost:54329/qwertyrank
# Solo con Neon: conexión directa (sin pooler) para las migraciones. En local no hace falta.
# DATABASE_URL_UNPOOLED=
UPSTASH_REDIS_REST_URL=http://localhost:8079
UPSTASH_REDIS_REST_TOKEN=local_dev_token
REDIS_KEY_PREFIX=qr:
# Secretos de al menos 32 caracteres. Genera los tuyos con: openssl rand -base64 32
ANON_COOKIE_SECRET=change-me-change-me-change-me-change-me
IP_HASH_SECRET=change-me-change-me-change-me-change-me
```

`.env.test`:

```bash
# Entorno de los tests de integración (NODE_ENV=test). Usa la base de datos aparte qwertyrank_test.
DATABASE_URL=postgres://qwertyrank:qwertyrank@localhost:54329/qwertyrank_test
UPSTASH_REDIS_REST_URL=http://localhost:8079
UPSTASH_REDIS_REST_TOKEN=local_dev_token
REDIS_KEY_PREFIX=qrtest:
ANON_COOKIE_SECRET=test-only-secret-test-only-secret-1234
IP_HASH_SECRET=test-only-secret-test-only-secret-5678
```

```bash
cp .env.example .env.local
```

En `.gitignore`, justo debajo de la línea `.env*`, añade:

```gitignore
!.env.example
!.env.test
```

- [ ] **Step 4: Proyectos de Vitest y preparación de los tests de integración**

`vitest.config.mts` (sustituye el archivo completo):

```ts
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// `server-only` lanza un error fuera de Next.js; en los tests se sustituye por su versión vacía.
const serverOnlyStub = fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": serverOnlyStub },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          // next-intl importa `next/navigation` sin extensión: que lo procese Vite para poder resolverlo.
          server: { deps: { inline: ["next-intl"] } },
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, "src/**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          setupFiles: ["./src/test/integration-env.ts"],
          globalSetup: ["./src/test/integration-global-setup.ts"],
          include: ["src/**/*.int.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
```

`src/test/integration-env.ts`:

```ts
import { loadEnvConfig } from "@next/env";

// Con NODE_ENV=test, @next/env carga .env.test (y nunca .env.local).
loadEnvConfig(process.cwd());
```

`src/test/integration-global-setup.ts`:

```ts
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Crea la base de datos de test si no existe y le aplica las migraciones. Requiere `docker compose up -d`. */
export default async function setup() {
  loadEnvConfig(process.cwd());
  const url = new URL(process.env.DATABASE_URL!);
  const name = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
  if (!exists) await admin`create database ${admin(name)}`;
  await admin.end();

  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  await client.end();
}
```

Run: `pnpm test`
Expected: PASS, los 86 tests unitarios de la fase 1 (ahora en el proyecto `unit`).

- [ ] **Step 5: Escribir el test del esquema (falla)**

`src/server/db/schema.int.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { games, keystrokeLogs } from "./schema";

const db = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

function game() {
  return {
    id: randomUUID(),
    language: "es" as const,
    inputType: "physical" as const,
    wpm: 50,
    rawWpm: 52,
    accuracy: 98,
    verdict: "valid" as const,
    startsAt: new Date(),
    finishedAt: new Date(),
  };
}

describe("esquema de la base de datos", () => {
  it("las migraciones crean games y keystroke_logs", async () => {
    const row = game();
    await db.insert(games).values(row);
    await db.insert(keystrokeLogs).values({ gameId: row.id, events: Buffer.from("x") });
  });

  it("rechaza idiomas, tipos de teclado y veredictos fuera de la lista", async () => {
    await expect(db.insert(games).values({ ...game(), language: "fr" as "es" })).rejects.toMatchObject({
      cause: { constraint_name: "games_language_check" },
    });
    await expect(db.insert(games).values({ ...game(), inputType: "mouse" as "touch" })).rejects.toMatchObject({
      cause: { constraint_name: "games_input_type_check" },
    });
    await expect(db.insert(games).values({ ...game(), verdict: "maybe" as "valid" })).rejects.toMatchObject({
      cause: { constraint_name: "games_verdict_check" },
    });
  });

  it("no admite pulsaciones de una partida que no existe", async () => {
    await expect(db.insert(keystrokeLogs).values({ gameId: randomUUID(), events: Buffer.from("x") })).rejects.toMatchObject({
      cause: { constraint_name: "keystroke_logs_game_id_games_id_fk" },
    });
  });
});
```

- [ ] **Step 6: Ejecutarlo y ver que falla**

Run: `pnpm test:int`
Expected: FAIL en el `globalSetup` con `Error: Can't find meta/_journal.json file`, porque aún no hay migraciones.

- [ ] **Step 7: Entorno, esquema, cliente y configuración de drizzle-kit**

`src/server/env.ts`:

```ts
import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().min(1).default("qr:"),
  ANON_COOKIE_SECRET: z.string().min(32),
  IP_HASH_SECRET: z.string().min(32),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

/** Variables de entorno del servidor, validadas la primera vez que se piden (no durante el build). */
export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
```

`src/server/db/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, customType, doublePrecision, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Una fila por partida Ranked terminada (spec §5.2). `user_id` se enlaza con `users` en la fase 3. */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id"),
    anonId: text("anon_id"),
    language: text("language", { enum: ["en", "es", "pt"] }).notNull(),
    inputType: text("input_type", { enum: ["physical", "touch"] }).notNull(),
    wpm: doublePrecision("wpm").notNull(),
    rawWpm: doublePrecision("raw_wpm").notNull(),
    accuracy: doublePrecision("accuracy").notNull(),
    verdict: text("verdict", { enum: ["valid", "review", "rejected"] }).notNull(),
    rejectReason: text("reject_reason"),
    riskScore: integer("risk_score").notNull().default(0),
    ipHash: text("ip_hash"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("games_language_check", sql`${table.language} in ('en', 'es', 'pt')`),
    check("games_input_type_check", sql`${table.inputType} in ('physical', 'touch')`),
    check("games_verdict_check", sql`${table.verdict} in ('valid', 'review', 'rejected')`),
  ],
);

/** Pulsaciones en bruto de cada partida, en JSON comprimido con gzip. Se borran a los 30 días (fase 5). */
export const keystrokeLogs = pgTable("keystroke_logs", {
  gameId: uuid("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  events: bytea("events").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`src/server/db/client.ts`:

```ts
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "../env";
import * as schema from "./schema";

export function createDb(url: string) {
  // prepare: false porque el pooler de Neon (PgBouncer en modo transacción) no admite sentencias preparadas.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | null = null;

export function getDb(): Db {
  db ??= createDb(serverEnv().DATABASE_URL);
  return db;
}
```

`drizzle.config.ts`:

```ts
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Mismas reglas que Next.js: .env.local en desarrollo, .env.test con NODE_ENV=test.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Neon: las migraciones van por la conexión directa; la app usa la del pooler (DATABASE_URL).
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
});
```

- [ ] **Step 8: Generar la migración**

Run: `pnpm db:generate --name init`
Expected: `[✓] Your SQL migration file ➜ drizzle/0000_init.sql`, con este contenido (se genera solo; no lo escribas a mano):

```sql
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"anon_id" text,
	"language" text NOT NULL,
	"input_type" text NOT NULL,
	"wpm" double precision NOT NULL,
	"raw_wpm" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"verdict" text NOT NULL,
	"reject_reason" text,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"ip_hash" text,
	"starts_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_language_check" CHECK ("games"."language" in ('en', 'es', 'pt')),
	CONSTRAINT "games_input_type_check" CHECK ("games"."input_type" in ('physical', 'touch')),
	CONSTRAINT "games_verdict_check" CHECK ("games"."verdict" in ('valid', 'review', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "keystroke_logs" (
	"game_id" uuid PRIMARY KEY NOT NULL,
	"events" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keystroke_logs" ADD CONSTRAINT "keystroke_logs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
```

- [ ] **Step 9: Ejecutar y ver que pasa**

Run: `pnpm test:int`
Expected: PASS, 3 tests.

Run: `pnpm db:migrate`
Expected: `[✓] migrations applied successfully!` en la base de datos de desarrollo.

- [ ] **Step 10: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int`
Expected: sin errores; 86 unitarios y 3 de integración.

---

### Task 2: Almacén de partidas en Redis

**Files:**
- Create: `src/lib/game/types.ts`, `src/server/redis.ts`, `src/server/game/store.ts`
- Test: `src/server/game/store.int.test.ts`

**Interfaces:**
- Consumes: `serverEnv()` (Task 1).
- Produces:
  - `types.ts`:
    - `InputType = "physical" | "touch"`, `Verdict` y `RejectReason`;
    - `ClientEnv { coarse: boolean; touchPoints: number }`;
    - `StartRequest`, `StartResponse { gameId; words; countdownMs; durationMs }`, `KeysRequest { seq; events }`, `FinishRequest { lastSeq }`;
    - `FinishResponse extends TestResult { gameId; inputType; verdict; reason }`.
  - `createRedis(url, token): Redis` y `getRedis(): Redis`.
  - `store.ts`:
    - `GAME_TTL_SECONDS = 120` y `FINISHED_TTL_SECONDS = 600`;
    - `GameTimes { countdownMs; durationMs; graceMs }`, `NewGame`, `StoredGame` (incluye `durationMs`, `issuedAt`, `startsAt`, `deadline` y `lastSeq`) y `StoredBatch { seq; arrivedAt; payload }`;
    - `AppendStatus = "ok" | "duplicate" | "out_of_order" | "closed" | "not_found"` y `FinishClaim`;
    - `createGameStore(redis, prefix): GameStore`, con `create`, `append`, `claimFinish`, `complete` y `release`.

**Reglas del almacén:**
- **`create`:**
  - Toma la hora de Redis: `startsAt = ahora + countdownMs` y `deadline = startsAt + durationMs + graceMs`.
  - Guarda la partida activa del jugador. Si había otra activa, la marca `abandoned`.
- **`append`:**
  - Solo la acepta el dueño de la partida, y solo si sigue activa.
  - `seq` igual o menor que el último recibido → `duplicate`. Un hueco → `out_of_order`.
  - Cada tanda se guarda como `<seq>|<hora de llegada>|<JSON>`.
- **`claimFinish`:** devuelve según el estado de la partida.
  - Activa → `ready`, con la partida, las tandas y la hora del final, y la pasa a `finishing`.
  - Ya en `finishing` → `busy`.
  - Terminada → `done`, con el resultado guardado.
  - Abandonada → `closed`.
  - Si no existe o es de otro → `not_found`.
- **`complete` y `release`:** `complete` guarda el resultado y borra las tandas; `release` devuelve la partida de `finishing` a activa si falla el guardado.

- [ ] **Step 1: Escribir el test (falla)**

`src/server/game/store.int.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRedis } from "../redis";
import { createGameStore, type NewGame } from "./store";

const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const store = createGameStore(redis, process.env.REDIS_KEY_PREFIX!);
const TIMES = { countdownMs: 3_000, durationMs: 30_000, graceMs: 3_000 };

function newGame(owner = randomUUID()): NewGame {
  return {
    id: randomUUID(),
    owner,
    language: "es",
    words: ["hola", "mundo"],
    env: { coarse: false, touchPoints: 0 },
    times: TIMES,
  };
}

describe("GameStore (Redis)", () => {
  it("crea la partida con la hora oficial de Redis", async () => {
    const before = Date.now();
    const game = await store.create(newGame());
    expect(game.issuedAt).toBeGreaterThanOrEqual(before - 1_000);
    expect(game.startsAt).toBe(game.issuedAt + 3_000);
    expect(game.deadline).toBe(game.startsAt + 33_000);
    expect(game.words).toEqual(["hola", "mundo"]);
  });

  it("acepta tandas en orden, ignora duplicados y rechaza huecos", async () => {
    const input = newGame();
    await store.create(input);
    expect(await store.append(input.id, input.owner, 1, "[]")).toBe("ok");
    expect(await store.append(input.id, input.owner, 1, "[]")).toBe("duplicate");
    expect(await store.append(input.id, input.owner, 3, "[]")).toBe("out_of_order");
    expect(await store.append(input.id, input.owner, 2, '[{"t":1}]')).toBe("ok");
  });

  it("no deja escribir en la partida de otro", async () => {
    const input = newGame();
    await store.create(input);
    expect(await store.append(input.id, randomUUID(), 1, "[]")).toBe("not_found");
    expect(await store.claimFinish(input.id, randomUUID())).toEqual({ kind: "not_found" });
  });

  it("al reclamar el final devuelve la partida y las tandas con su hora de llegada", async () => {
    const input = newGame();
    const game = await store.create(input);
    await store.append(input.id, input.owner, 1, '[{"t":5,"type":"input"}]');
    const claim = await store.claimFinish(input.id, input.owner);
    if (claim.kind !== "ready") throw new Error(claim.kind);
    expect(claim.game).toMatchObject({ id: input.id, owner: input.owner, startsAt: game.startsAt, lastSeq: 1 });
    expect(claim.batches).toHaveLength(1);
    expect(claim.batches[0].seq).toBe(1);
    expect(claim.batches[0].payload).toBe('[{"t":5,"type":"input"}]');
    expect(claim.batches[0].arrivedAt).toBeGreaterThanOrEqual(game.issuedAt);
    expect(claim.finishedAt).toBeGreaterThanOrEqual(claim.batches[0].arrivedAt);
  });

  it("el final es idempotente: mientras se procesa da 'busy' y después devuelve el mismo resultado", async () => {
    const input = newGame();
    await store.create(input);
    expect((await store.claimFinish(input.id, input.owner)).kind).toBe("ready");
    expect(await store.claimFinish(input.id, input.owner)).toEqual({ kind: "busy" });
    expect(await store.append(input.id, input.owner, 1, "[]")).toBe("closed");
    await store.complete(input.id, '{"wpm":42}');
    expect(await store.claimFinish(input.id, input.owner)).toEqual({ kind: "done", result: '{"wpm":42}' });
  });

  it("si falla el guardado, release permite reintentar el final", async () => {
    const input = newGame();
    await store.create(input);
    await store.claimFinish(input.id, input.owner);
    await store.release(input.id);
    expect((await store.claimFinish(input.id, input.owner)).kind).toBe("ready");
  });

  it("una partida nueva del mismo jugador abandona la anterior", async () => {
    const owner = randomUUID();
    const first = newGame(owner);
    const second = newGame(owner);
    await store.create(first);
    await store.create(second);
    expect(await store.append(first.id, owner, 1, "[]")).toBe("closed");
    expect(await store.claimFinish(first.id, owner)).toEqual({ kind: "closed" });
    expect(await store.append(second.id, owner, 1, "[]")).toBe("ok");
  });
});
```

- [ ] **Step 2: Ejecutarlo y ver que falla**

Run: `pnpm test:int src/server/game`
Expected: FAIL con `Failed to resolve import "../redis"`.

- [ ] **Step 3: Implementar**

`src/lib/game/types.ts`:

```ts
import type { TestResult } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
import type { TestLanguage } from "@/lib/words/languages";

/** Tipos del protocolo de una partida Ranked, compartidos por navegador y servidor. */

export type InputType = "physical" | "touch";
export type Verdict = "valid" | "review" | "rejected";

export type RejectReason =
  | "late"
  | "incomplete"
  | "early_input"
  | "fabricated_timing"
  | "untrusted"
  | "injected_input"
  | "multi_insert"
  | "inhuman_burst"
  | "inhuman_speed";

/** Señales del navegador sobre el dispositivo. Son una declaración: el servidor no se fía solo de ellas. */
export interface ClientEnv {
  coarse: boolean;
  touchPoints: number;
}

export interface StartRequest {
  language: TestLanguage;
  env: ClientEnv;
}

export interface StartResponse {
  gameId: string;
  words: string[];
  countdownMs: number;
  durationMs: number;
}

export interface KeysRequest {
  seq: number;
  events: TypingEvent[];
}

export interface FinishRequest {
  lastSeq: number;
}

export interface FinishResponse extends TestResult {
  gameId: string;
  inputType: InputType;
  verdict: Verdict;
  reason: RejectReason | null;
}
```

`src/server/redis.ts`:

```ts
import "server-only";
import { Redis } from "@upstash/redis";
import { serverEnv } from "./env";

let redis: Redis | null = null;

export function createRedis(url: string, token: string): Redis {
  // Sin deserialización automática: los scripts devuelven texto y lo interpretamos nosotros.
  return new Redis({ url, token, automaticDeserialization: false });
}

export function getRedis(): Redis {
  const env = serverEnv();
  redis ??= createRedis(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  return redis;
}
```

`src/server/game/store.ts`:

```ts
import "server-only";
import type { Redis } from "@upstash/redis";
import type { ClientEnv } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";

/**
 * Partidas en curso en Redis. Todas las horas oficiales salen de `TIME` dentro de los
 * scripts Lua: un único reloj para todas las funciones del servidor (spec §4.2).
 */

export const GAME_TTL_SECONDS = 120;
export const FINISHED_TTL_SECONDS = 600;

export interface GameTimes {
  countdownMs: number;
  durationMs: number;
  graceMs: number;
}

export interface NewGame {
  id: string;
  owner: string;
  language: TestLanguage;
  words: readonly string[];
  env: ClientEnv;
  times: GameTimes;
}

export interface StoredGame {
  id: string;
  owner: string;
  language: TestLanguage;
  words: string[];
  env: ClientEnv;
  durationMs: number;
  issuedAt: number;
  startsAt: number;
  deadline: number;
  lastSeq: number;
}

export interface StoredBatch {
  seq: number;
  arrivedAt: number;
  payload: string;
}

export type AppendStatus = "ok" | "duplicate" | "out_of_order" | "closed" | "not_found";

export type FinishClaim =
  | { kind: "ready"; game: StoredGame; batches: StoredBatch[]; finishedAt: number }
  | { kind: "done"; result: string }
  | { kind: "busy" }
  | { kind: "closed" }
  | { kind: "not_found" };

export interface GameStore {
  create(game: NewGame): Promise<StoredGame>;
  append(id: string, owner: string, seq: number, payload: string): Promise<AppendStatus>;
  claimFinish(id: string, owner: string): Promise<FinishClaim>;
  complete(id: string, result: string): Promise<void>;
  release(id: string): Promise<void>;
}

const NOW_MS = `local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)`;

const CREATE = `${NOW_MS}
local startsAt = now + tonumber(ARGV[6])
local deadline = startsAt + tonumber(ARGV[7]) + tonumber(ARGV[8])
redis.call('HSET', KEYS[1],
  'owner', ARGV[2], 'language', ARGV[3], 'words', ARGV[4], 'env', ARGV[5], 'durationMs', ARGV[7],
  'issuedAt', string.format('%.0f', now), 'startsAt', string.format('%.0f', startsAt),
  'deadline', string.format('%.0f', deadline), 'lastSeq', '0', 'status', 'active')
redis.call('EXPIRE', KEYS[1], ARGV[9])
local previous = redis.call('GET', KEYS[2])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[9])
return {string.format('%.0f', now), previous or ''}`;

const ABANDON = `if redis.call('HGET', KEYS[1], 'status') == 'active' then
  redis.call('HSET', KEYS[1], 'status', 'abandoned')
end
return 1`;

const APPEND = `local status = redis.call('HGET', KEYS[1], 'status')
if not status or redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 'not_found' end
if status ~= 'active' then return 'closed' end
local lastSeq = tonumber(redis.call('HGET', KEYS[1], 'lastSeq'))
local seq = tonumber(ARGV[2])
if seq <= lastSeq then return 'duplicate' end
if seq ~= lastSeq + 1 then return 'out_of_order' end
${NOW_MS}
redis.call('RPUSH', KEYS[2], ARGV[2] .. '|' .. string.format('%.0f', now) .. '|' .. ARGV[3])
redis.call('HSET', KEYS[1], 'lastSeq', ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[4])
return 'ok'`;

const CLAIM = `local status = redis.call('HGET', KEYS[1], 'status')
if not status or redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return {'not_found'} end
if status == 'finished' then return {'done', redis.call('HGET', KEYS[1], 'result')} end
if status == 'finishing' then return {'busy'} end
if status ~= 'active' then return {'closed'} end
${NOW_MS}
redis.call('HSET', KEYS[1], 'status', 'finishing')
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return {'ready', string.format('%.0f', now), redis.call('HGETALL', KEYS[1]), redis.call('LRANGE', KEYS[2], 0, -1)}`;

const COMPLETE = `redis.call('HSET', KEYS[1], 'status', 'finished', 'result', ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('DEL', KEYS[2])
return 1`;

const RELEASE = `if redis.call('HGET', KEYS[1], 'status') == 'finishing' then
  redis.call('HSET', KEYS[1], 'status', 'active')
end
return 1`;

function parseGame(id: string, flat: string[]): StoredGame {
  const fields = new Map<string, string>();
  for (let i = 0; i < flat.length; i += 2) fields.set(flat[i], flat[i + 1]);
  const field = (name: string) => fields.get(name) ?? "";
  return {
    id,
    owner: field("owner"),
    language: field("language") as TestLanguage,
    words: JSON.parse(field("words")),
    env: JSON.parse(field("env")),
    durationMs: Number(field("durationMs")),
    issuedAt: Number(field("issuedAt")),
    startsAt: Number(field("startsAt")),
    deadline: Number(field("deadline")),
    lastSeq: Number(field("lastSeq")),
  };
}

/** Cada tanda se guarda como `<seq>|<hora de llegada>|<JSON de eventos>`. */
function parseBatch(entry: string): StoredBatch {
  const first = entry.indexOf("|");
  const second = entry.indexOf("|", first + 1);
  return {
    seq: Number(entry.slice(0, first)),
    arrivedAt: Number(entry.slice(first + 1, second)),
    payload: entry.slice(second + 1),
  };
}

export function createGameStore(redis: Redis, prefix: string): GameStore {
  const gameKey = (id: string) => `${prefix}game:${id}`;
  const eventsKey = (id: string) => `${prefix}game:${id}:events`;
  const activeKey = (owner: string) => `${prefix}owner:${owner}:active`;

  return {
    async create(game) {
      const { countdownMs, durationMs, graceMs } = game.times;
      const [issuedAt, previous] = (await redis.eval(
        CREATE,
        [gameKey(game.id), activeKey(game.owner)],
        [
          game.id,
          game.owner,
          game.language,
          JSON.stringify(game.words),
          JSON.stringify(game.env),
          String(countdownMs),
          String(durationMs),
          String(graceMs),
          String(GAME_TTL_SECONDS),
        ],
      )) as [string, string];
      if (previous && previous !== game.id) await redis.eval(ABANDON, [gameKey(previous)], []);
      const startsAt = Number(issuedAt) + countdownMs;
      return {
        id: game.id,
        owner: game.owner,
        language: game.language,
        words: [...game.words],
        env: game.env,
        durationMs,
        issuedAt: Number(issuedAt),
        startsAt,
        deadline: startsAt + durationMs + graceMs,
        lastSeq: 0,
      };
    },

    async append(id, owner, seq, payload) {
      return (await redis.eval(APPEND, [gameKey(id), eventsKey(id)], [owner, String(seq), payload, String(GAME_TTL_SECONDS)])) as AppendStatus;
    },

    async claimFinish(id, owner) {
      const reply = (await redis.eval(CLAIM, [gameKey(id), eventsKey(id)], [owner, String(FINISHED_TTL_SECONDS)])) as unknown[];
      const kind = reply[0] as string;
      if (kind === "done") return { kind, result: reply[1] as string };
      if (kind !== "ready") return { kind: kind as "busy" | "closed" | "not_found" };
      return {
        kind,
        finishedAt: Number(reply[1]),
        game: parseGame(id, reply[2] as string[]),
        batches: (reply[3] as string[]).map(parseBatch),
      };
    },

    async complete(id, result) {
      await redis.eval(COMPLETE, [gameKey(id), eventsKey(id)], [result, String(FINISHED_TTL_SECONDS)]);
    },

    async release(id) {
      await redis.eval(RELEASE, [gameKey(id)], []);
    },
  };
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test:int`
Expected: PASS, 10 tests (3 + 7).

- [ ] **Step 5: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int`
Expected: sin errores.

---

### Task 3: Reglas anti-trampas, clasificación del teclado y `replay` robusto

**Files:**
- Create: `src/test/typing-events.ts`, `src/server/anticheat/rules.ts`, `src/server/anticheat/input-type.ts`
- Modify: `src/lib/scoring/replay.ts`
- Test: `src/server/anticheat/rules.test.ts`, `src/server/anticheat/input-type.test.ts`, `src/lib/scoring/replay.test.ts`

**Interfaces:**
- Consumes: `TypingEvent`, `InputTypingEvent`, `KeyTypingEvent` (fase 1); `InputType`, `RejectReason`, `ClientEnv` (Task 2).
- Produces:
  - `rules.ts`:
    - constantes `TIMING_TOLERANCE_MS`, `BURST_WINDOW`, `BURST_MEDIAN_MS`, `KEYDOWN_LOOKBACK_MS`, `TOUCH_MULTI_INSERT_LIMIT` y `WPM_CEILING`;
    - `ReceivedBatch { seq; arrivedAt; events }` y `TimingWindow`;
    - `checkTiming(batches, window): RejectReason | null`, `checkEvents(events, inputType): RejectReason | null` y `checkSpeed(wpm, inputType): RejectReason | null`.
  - `input-type.ts`: `classifyInputType(events, env): InputType`, más las constantes `MIN_KEYS_FOR_SIGNATURE`, `UNIDENTIFIED_RATIO` y `PHYSICAL_MIN_HOLD_MS`.
  - `typing-events.ts`: `typed(text, { start, every, hold, code })` e `inputOnly(text, { start, every })`.
  - `replay` ignora los eventos con forma inválida (`t` no finito, `inserted` que no es texto, `deleted` negativo o no entero, `null`).

**Clasificación del teclado (heurística inicial, a calibrar con dispositivos reales):**
1. Con menos de 10 `keydown` → decide por las señales del navegador (`coarse` y `touchPoints` > 0 → táctil).
2. Más del 50 % de teclas `Unidentified`/`Process` → táctil (IME de Android).
3. Mediana de la duración de la pulsación ≥ 20 ms → físico; si no, táctil.

- [ ] **Step 1: Helper y tests (fallan)**

`src/test/typing-events.ts`:

```ts
import type { TypingEvent } from "@/lib/scoring/types";

/** Helpers para construir partidas en los tests del anti-trampas. */

export function typed(text: string, { start = 0, every = 150, hold = 60, code = true } = {}): TypingEvent[] {
  const events: TypingEvent[] = [];
  let t = start;
  for (const char of text) {
    const key = char === " " ? " " : char;
    const keyCode = code ? (char === " " ? "Space" : `Key${char.toUpperCase()}`) : "";
    events.push({ t, type: "down", key, code: keyCode, trusted: true });
    events.push({ t: t + 1, type: "input", deleted: 0, inserted: char, trusted: true });
    events.push({ t: t + hold, type: "up", key, code: keyCode, trusted: true });
    t += every;
  }
  return events;
}

export function inputOnly(text: string, { start = 0, every = 150 } = {}): TypingEvent[] {
  return [...text].map((char, i) => ({
    t: start + i * every,
    type: "input" as const,
    deleted: 0,
    inserted: char,
    trusted: true,
  }));
}
```

`src/server/anticheat/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { BURST_MEDIAN_MS, TOUCH_MULTI_INSERT_LIMIT, checkEvents, checkSpeed, checkTiming, type ReceivedBatch } from "./rules";
import { inputOnly, typed } from "@/test/typing-events";

const STARTS_AT = 1_000_000;
const DEADLINE = STARTS_AT + 30_000 + 3_000;

function batch(seq: number, arrivedAt: number, events: TypingEvent[]): ReceivedBatch {
  return { seq, arrivedAt, events };
}

describe("checkTiming", () => {
  const honest = [batch(1, STARTS_AT + 3_100, typed("hola ", { start: 100 }))];

  it("acepta una partida honesta", () => {
    expect(checkTiming(honest, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 1 })).toBeNull();
  });

  it("rechaza un final después de la hora límite", () => {
    expect(checkTiming(honest, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: DEADLINE + 1, lastSeq: 1 })).toBe("late");
  });

  it("rechaza una tanda que llega después de la hora límite", () => {
    const late = [batch(1, DEADLINE + 5, typed("a"))];
    expect(checkTiming(late, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: DEADLINE, lastSeq: 1 })).toBe("late");
  });

  it("rechaza si faltan tandas respecto a lastSeq", () => {
    expect(checkTiming(honest, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 2 })).toBe("incomplete");
  });

  it("rechaza pulsaciones antes del 0 (durante la cuenta atrás)", () => {
    const early = [batch(1, STARTS_AT + 3_000, typed("a", { start: -10 }))];
    expect(checkTiming(early, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 1 })).toBe("early_input");
  });

  it("rechaza eventos con una hora posterior a la llegada de su tanda (registro fabricado)", () => {
    const fabricated = [batch(1, STARTS_AT + 1_000, typed("a", { start: 2_000 }))];
    expect(checkTiming(fabricated, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 1 })).toBe("fabricated_timing");
  });

  it("tolera 250 ms de diferencia de reloj", () => {
    const skewed = [batch(1, STARTS_AT + 1_000, typed("a", { start: 1_100, hold: 50 }))];
    expect(checkTiming(skewed, { startsAt: STARTS_AT, deadline: DEADLINE, finishedAt: STARTS_AT + 31_000, lastSeq: 1 })).toBeNull();
  });
});

describe("checkEvents", () => {
  it("acepta tecleo humano en teclado físico", () => {
    expect(checkEvents(typed("hola mundo azul casa "), "physical")).toBeNull();
  });

  it("rechaza eventos no generados por el usuario (isTrusted = false)", () => {
    const events = typed("hola ");
    events[1] = { ...events[1], trusted: false };
    expect(checkEvents(events, "physical")).toBe("untrusted");
  });

  it("en teclado físico rechaza texto sin pulsación de tecla (inyectado)", () => {
    expect(checkEvents(inputOnly("hola "), "physical")).toBe("injected_input");
  });

  it("en táctil no exige pulsaciones de tecla", () => {
    expect(checkEvents(inputOnly("hola mundo "), "touch")).toBeNull();
  });

  it("en teclado físico rechaza cualquier inserción de varias letras a la vez", () => {
    const events: TypingEvent[] = [
      ...typed("ho"),
      { t: 400, type: "down", key: "Unidentified", code: "", trusted: true },
      { t: 401, type: "input", deleted: 0, inserted: "la ", trusted: true },
    ];
    expect(checkEvents(events, "physical")).toBe("multi_insert");
  });

  it(`en táctil tolera hasta ${TOUCH_MULTI_INSERT_LIMIT} inserciones múltiples (autocorrector) y rechaza más`, () => {
    const multi = (t: number): TypingEvent => ({ t, type: "input", deleted: 2, inserted: "ola", trusted: true });
    const tolerated = [...inputOnly("ab"), ...Array.from({ length: TOUCH_MULTI_INSERT_LIMIT }, (_, i) => multi(1_000 + i * 500))];
    expect(checkEvents(tolerated, "touch")).toBeNull();
    expect(checkEvents([...tolerated, multi(9_000)], "touch")).toBe("multi_insert");
  });

  it("una letra con tilde compuesta cuenta como una sola inserción", () => {
    const events: TypingEvent[] = [
      { t: 0, type: "down", key: "Dead", code: "Quote", trusted: true },
      { t: 100, type: "down", key: "a", code: "KeyA", trusted: true },
      { t: 101, type: "input", deleted: 0, inserted: "á", trusted: true },
    ];
    expect(checkEvents(events, "physical")).toBeNull();
  });

  it(`rechaza ráfagas inhumanas (mediana < ${BURST_MEDIAN_MS} ms en 20 pulsaciones)`, () => {
    expect(checkEvents(typed("abcdefghijklmnopqrstuvwxyz", { every: 10, hold: 5 }), "physical")).toBe("inhuman_burst");
  });

  it("acepta ráfagas rápidas pero humanas", () => {
    expect(checkEvents(typed("abcdefghijklmnopqrstuvwxyz", { every: 40, hold: 30 }), "physical")).toBeNull();
  });
});

describe("checkSpeed", () => {
  it("rechaza PPM por encima del techo de cada categoría", () => {
    expect(checkSpeed(321, "physical")).toBe("inhuman_speed");
    expect(checkSpeed(320, "physical")).toBeNull();
    expect(checkSpeed(221, "touch")).toBe("inhuman_speed");
    expect(checkSpeed(200, "touch")).toBeNull();
  });
});
```

`src/server/anticheat/input-type.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { classifyInputType } from "./input-type";
import { inputOnly, typed } from "@/test/typing-events";

const DESKTOP = { coarse: false, touchPoints: 0 };
const PHONE = { coarse: true, touchPoints: 5 };

function androidIme(text: string): TypingEvent[] {
  return [...text].flatMap((char, i) => [
    { t: i * 200, type: "down" as const, key: "Unidentified", code: "", trusted: true },
    { t: i * 200 + 1, type: "input" as const, deleted: 0, inserted: char, trusted: true },
    { t: i * 200 + 2, type: "up" as const, key: "Unidentified", code: "", trusted: true },
  ]);
}

describe("classifyInputType", () => {
  it("teclado físico: teclas reales mantenidas pulsadas", () => {
    expect(classifyInputType(typed("hola mundo azul casa"), DESKTOP)).toBe("physical");
  });

  it("teclado de Android: teclas 'Unidentified'", () => {
    expect(classifyInputType(androidIme("hola mundo azul"), PHONE)).toBe("touch");
  });

  it("pulsaciones casi instantáneas (teclado virtual): táctil", () => {
    expect(classifyInputType(typed("hola mundo azul casa", { hold: 3 }), PHONE)).toBe("touch");
  });

  it("si dice ser táctil pero teclea como un teclado físico, es físico", () => {
    expect(classifyInputType(typed("hola mundo azul casa"), PHONE)).toBe("physical");
  });

  it("con pocas pulsaciones decide por las señales del navegador", () => {
    expect(classifyInputType(typed("hola"), PHONE)).toBe("touch");
    expect(classifyInputType(typed("hola"), DESKTOP)).toBe("physical");
    expect(classifyInputType(inputOnly("hola mundo azul casa"), PHONE)).toBe("touch");
  });
});
```

`src/lib/scoring/replay.test.ts` (sustituye el archivo completo; añade el test "ignora eventos con forma inválida"):

```ts
import { describe, expect, it } from "vitest";
import { replay } from "./replay";
import type { TypingEvent } from "./types";

const input = (t: number, inserted: string, deleted = 0): TypingEvent => ({
  t, type: "input", deleted, inserted, trusted: true,
});

describe("replay", () => {
  const words = ["hola", "mundo", "azul"];

  it("calcula PPM, PPM brutas y precisión al final de la partida", () => {
    const events = [input(0, "hola "), input(1000, "mumdo "), input(2000, "az")];
    const result = replay(words, events, 30_000);
    expect(result.correctChars).toBe(7);
    expect(result.typedChars).toBe(13);
    expect(result.wpm).toBe(2.8);
    expect(result.rawWpm).toBe(5.2);
    expect(result.accuracy).toBe(84.62);
    expect(result.mistakes).toEqual({ n: 1 });
  });

  it("ignora eventos de teclado y eventos fuera de la partida", () => {
    const events: TypingEvent[] = [
      { t: 0, type: "down", key: "h", code: "KeyH", trusted: true },
      input(-5, "xxx"),
      input(0, "hola "),
      input(15_001, "mundo "),
    ];
    const result = replay(words, events, 15_000);
    expect(result.correctChars).toBe(5);
  });

  it("ordena los eventos por tiempo antes de reproducirlos", () => {
    const result = replay(words, [input(500, "la "), input(100, "ho")], 15_000);
    expect(result.correctChars).toBe(5);
  });

  it("da una PPM por segundo, acumulada", () => {
    const events = [input(500, "hola "), input(1000, "mundo "), input(2500, "azul ")];
    const result = replay(words, events, 3000);
    expect(result.perSecond).toEqual([
      wpm(11, 1000),
      wpm(11, 2000),
      wpm(16, 3000),
    ]);
  });

  it("ignora eventos con forma inválida (datos no confiables)", () => {
    const events = [
      input(0, "hola "),
      { t: Number.NaN, type: "input", deleted: 0, inserted: "x", trusted: true },
      { t: null, type: "input", deleted: 0, inserted: "x", trusted: true },
      { t: 10, type: "input", deleted: 0, inserted: 5, trusted: true },
      { t: 20, type: "input", deleted: -3, inserted: "x", trusted: true },
      null,
    ] as unknown as TypingEvent[];
    expect(replay(words, events, 15_000).correctChars).toBe(5);
  });

  it("una partida sin pulsaciones da 0 en todo", () => {
    const result = replay(words, [], 15_000);
    expect(result).toMatchObject({ wpm: 0, rawWpm: 0, accuracy: 0, correctChars: 0 });
    expect(result.perSecond).toHaveLength(15);
  });
});

function wpm(chars: number, ms: number) {
  return Math.round((chars / 5 / (ms / 60_000)) * 100) / 100;
}
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `pnpm test src/server src/lib/scoring`
Expected:
- FAIL en `rules.test.ts` e `input-type.test.ts`: no se pueden resolver `./rules` ni `./input-type`.
- FAIL en "ignora eventos con forma inválida": `TypeError: Cannot read properties of null (reading 'type')`.

- [ ] **Step 3: Implementar**

`src/server/anticheat/rules.ts`:

```ts
import "server-only";
import type { InputType, RejectReason } from "@/lib/game/types";
import type { InputTypingEvent, TypingEvent } from "@/lib/scoring/types";

/** Reglas que rechazan una partida (spec §4.2 y §4.3). Valores iniciales, ajustables con datos reales. */

export const TIMING_TOLERANCE_MS = 250;
export const BURST_WINDOW = 20;
export const BURST_MEDIAN_MS = 25;
export const KEYDOWN_LOOKBACK_MS = 1_000;
export const TOUCH_MULTI_INSERT_LIMIT = 2;
export const WPM_CEILING: Record<InputType, number> = { physical: 320, touch: 220 };

/** Una tanda de eventos tal como la recibió el servidor, con la hora oficial de llegada. */
export interface ReceivedBatch {
  seq: number;
  arrivedAt: number;
  events: TypingEvent[];
}

export interface TimingWindow {
  startsAt: number;
  deadline: number;
  finishedAt: number;
  lastSeq: number;
}

export function checkTiming(batches: readonly ReceivedBatch[], window: TimingWindow): RejectReason | null {
  if (window.finishedAt > window.deadline) return "late";
  if (batches.length !== window.lastSeq || batches.some((batch, i) => batch.seq !== i + 1)) return "incomplete";
  for (const batch of batches) {
    if (batch.arrivedAt > window.deadline) return "late";
    const elapsedAtArrival = batch.arrivedAt - window.startsAt;
    for (const event of batch.events) {
      if (event.t < 0) return "early_input";
      if (event.t > elapsedAtArrival + TIMING_TOLERANCE_MS) return "fabricated_timing";
    }
  }
  return null;
}

function insertions(events: readonly TypingEvent[]): InputTypingEvent[] {
  return events.filter((event): event is InputTypingEvent => event.type === "input" && event.inserted !== "");
}

function hasKeydownBefore(downTimes: readonly number[], t: number): boolean {
  return downTimes.some((down) => down <= t && down >= t - KEYDOWN_LOOKBACK_MS);
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function hasInhumanBurst(inputs: readonly InputTypingEvent[]): boolean {
  const times = inputs.map((event) => event.t).toSorted((a, b) => a - b);
  for (let start = 0; start + BURST_WINDOW <= times.length; start++) {
    const intervals = [];
    for (let i = start + 1; i < start + BURST_WINDOW; i++) intervals.push(times[i] - times[i - 1]);
    if (median(intervals) < BURST_MEDIAN_MS) return true;
  }
  return false;
}

export function checkEvents(events: readonly TypingEvent[], inputType: InputType): RejectReason | null {
  if (events.some((event) => !event.trusted)) return "untrusted";

  const inputs = insertions(events);
  if (inputType === "physical") {
    const downTimes = events.filter((event) => event.type === "down").map((event) => event.t);
    if (inputs.some((event) => !hasKeydownBefore(downTimes, event.t))) return "injected_input";
  }

  const multiInserts = inputs.filter((event) => [...event.inserted].length > 1).length;
  const allowed = inputType === "physical" ? 0 : TOUCH_MULTI_INSERT_LIMIT;
  if (multiInserts > allowed) return "multi_insert";

  if (hasInhumanBurst(inputs)) return "inhuman_burst";
  return null;
}

export function checkSpeed(wpm: number, inputType: InputType): RejectReason | null {
  return wpm > WPM_CEILING[inputType] ? "inhuman_speed" : null;
}
```

`src/server/anticheat/input-type.ts`:

```ts
import "server-only";
import type { ClientEnv, InputType } from "@/lib/game/types";
import type { KeyTypingEvent, TypingEvent } from "@/lib/scoring/types";

/**
 * Teclado físico o táctil, decidido por la forma de las pulsaciones (spec §4.5).
 * Heurística inicial: hay que calibrarla con partidas de dispositivos reales.
 */

export const MIN_KEYS_FOR_SIGNATURE = 10;
export const UNIDENTIFIED_RATIO = 0.5;
export const PHYSICAL_MIN_HOLD_MS = 20;

const IME_KEYS = new Set(["Unidentified", "Process"]);

function fromEnv(env: ClientEnv): InputType {
  return env.coarse && env.touchPoints > 0 ? "touch" : "physical";
}

/** Duración de cada pulsación: de un keydown al siguiente keyup de la misma tecla. */
function holdTimes(events: readonly TypingEvent[]): number[] {
  const pressed = new Map<string, number>();
  const holds: number[] = [];
  for (const event of events) {
    if (event.type !== "down" && event.type !== "up") continue;
    const id = (event as KeyTypingEvent).code || (event as KeyTypingEvent).key;
    if (event.type === "down") {
      if (!pressed.has(id)) pressed.set(id, event.t);
    } else if (pressed.has(id)) {
      holds.push(event.t - pressed.get(id)!);
      pressed.delete(id);
    }
  }
  return holds;
}

export function classifyInputType(events: readonly TypingEvent[], env: ClientEnv): InputType {
  const downs = events.filter((event): event is KeyTypingEvent => event.type === "down");
  if (downs.length < MIN_KEYS_FOR_SIGNATURE) return fromEnv(env);

  const unidentified = downs.filter((event) => IME_KEYS.has(event.key)).length;
  if (unidentified / downs.length > UNIDENTIFIED_RATIO) return "touch";

  const holds = holdTimes(events).toSorted((a, b) => a - b);
  if (holds.length < MIN_KEYS_FOR_SIGNATURE) return fromEnv(env);
  return holds[Math.floor(holds.length / 2)] >= PHYSICAL_MIN_HOLD_MS ? "physical" : "touch";
}
```

`src/lib/scoring/replay.ts` (sustituye el archivo completo):

```ts
import { applyInput, createEngine } from "./engine";
import { accuracyPercent, countCorrectChars, countTypedChars, wordsPerMinute } from "./metrics";
import type { InputTypingEvent, TypingEvent } from "./types";

export interface TestResult {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctChars: number;
  typedChars: number;
  /** PPM acumuladas al final de cada segundo (longitud = ceil(durationMs / 1000)). */
  perSecond: number[];
  mistakes: Record<string, number>;
}

/** El servidor reproduce eventos que no son de fiar: se ignora todo lo que no tenga la forma esperada. */
function isValidInput(event: unknown): event is InputTypingEvent {
  if (typeof event !== "object" || event === null) return false;
  const candidate = event as Record<string, unknown>;
  return (
    candidate.type === "input" &&
    typeof candidate.t === "number" &&
    Number.isFinite(candidate.t) &&
    typeof candidate.inserted === "string" &&
    Number.isInteger(candidate.deleted) &&
    (candidate.deleted as number) >= 0
  );
}

export function replay(
  words: readonly string[],
  events: readonly TypingEvent[],
  durationMs: number,
): TestResult {
  const inputs = events
    .filter((event): event is InputTypingEvent => isValidInput(event) && event.t >= 0 && event.t <= durationMs)
    .toSorted((a, b) => a.t - b.t);

  const seconds = Math.ceil(durationMs / 1000);
  const perSecond: number[] = [];
  let state = createEngine(words);
  let second = 1;

  for (const event of inputs) {
    while (second <= seconds && event.t > second * 1000) {
      perSecond.push(wordsPerMinute(countCorrectChars(state), second * 1000));
      second++;
    }
    state = applyInput(state, event.deleted, event.inserted);
  }
  while (second <= seconds) {
    perSecond.push(wordsPerMinute(countCorrectChars(state), Math.min(second * 1000, durationMs)));
    second++;
  }

  const correctChars = countCorrectChars(state);
  const typedChars = countTypedChars(state);
  return {
    wpm: wordsPerMinute(correctChars, durationMs),
    rawWpm: wordsPerMinute(typedChars, durationMs),
    accuracy: accuracyPercent(state.correctInserts, state.totalInserts),
    correctChars,
    typedChars,
    perSecond,
    mistakes: { ...state.mistakes },
  };
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/server src/lib/scoring`
Expected: PASS, 50 tests (17 reglas + 5 clasificación + 28 puntuación).

- [ ] **Step 5: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: sin errores; 109 tests unitarios.

---

### Task 4: Servicio de partidas y guardado

**Files:**
- Create: `src/server/game/persist.ts`, `src/server/game/service.ts`
- Test: `src/server/game/persist.int.test.ts`, `src/server/game/service.int.test.ts`

**Interfaces:**
- Consumes: `Db`, `createDb`, `games`, `keystrokeLogs` (Task 1); `GameStore`, `GameTimes`, `AppendStatus`, `createGameStore`, `createRedis` (Task 2); `checkTiming`, `checkEvents`, `checkSpeed`, `ReceivedBatch`, `classifyInputType` (Task 3); `replay`, `generateWords`, `WORDS_PER_TEST` (fase 1).
- Produces:
  - `persist.ts`: `GameRecord` y `createSaveGame(db): SaveGame`, que guarda la partida y las pulsaciones en gzip, en una transacción.
  - `service.ts`: `GameServiceDeps { store; saveGame; loadWords; random; newId; times }`, `FinishOutcome` y `createGameService(deps): GameService`, con:
    - `start({ owner, language, env }): Promise<StartResponse>`;
    - `appendKeys({ owner, gameId, seq, events }): Promise<AppendStatus>`;
    - `finish({ owner, gameId, lastSeq, ipHash }): Promise<FinishOutcome>`.

**Veredicto, en este orden:** `checkTiming`, luego `checkEvents` con el tipo de teclado ya clasificado, y por último `checkSpeed` con las PPM de `replay`. La primera regla que falla da `rejected` con su motivo; si no falla ninguna, `valid`. Si el guardado falla, se llama a `release` y se propaga el error. El servicio nunca produce `review`; eso llega en la fase 4.

- [ ] **Step 1: Escribir los tests (fallan)**

`src/server/game/persist.int.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import { createSaveGame, type GameRecord } from "./persist";

const db = createDb(process.env.DATABASE_URL!);
const saveGame = createSaveGame(db);

afterAll(async () => {
  await db.$client.end();
});

function record(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: randomUUID(),
    anonId: randomUUID(),
    language: "pt",
    inputType: "touch",
    wpm: 61.5,
    rawWpm: 64,
    accuracy: 97.25,
    verdict: "valid",
    rejectReason: null,
    ipHash: "a".repeat(64),
    startsAt: new Date("2026-10-05T10:00:00Z"),
    finishedAt: new Date("2026-10-05T10:00:31Z"),
    batches: [{ seq: 1, arrivedAt: 123, events: [{ t: 0, type: "input", deleted: 0, inserted: "a", trusted: true }] }],
    ...overrides,
  };
}

describe("saveGame (PostgreSQL)", () => {
  it("guarda la partida y su registro de pulsaciones comprimido", async () => {
    const input = record();
    await saveGame(input);

    const [game] = await db.select().from(games).where(eq(games.id, input.id));
    expect(game).toMatchObject({ language: "pt", inputType: "touch", wpm: 61.5, verdict: "valid", anonId: input.anonId });

    const [log] = await db.select().from(keystrokeLogs).where(eq(keystrokeLogs.gameId, input.id));
    expect(JSON.parse(gunzipSync(log.events).toString("utf8"))).toEqual(input.batches);
  });

  it("guarda también las partidas rechazadas con su motivo", async () => {
    const input = record({ verdict: "rejected", rejectReason: "untrusted" });
    await saveGame(input);
    const [game] = await db.select().from(games).where(eq(games.id, input.id));
    expect(game.rejectReason).toBe("untrusted");
  });

  it("no guarda dos veces la misma partida", async () => {
    const input = record();
    await saveGame(input);
    await expect(saveGame({ ...input, id: input.id })).rejects.toThrow();
    const rows = await db.select().from(games).where(eq(games.id, input.id));
    expect(rows).toHaveLength(1);
  });
});
```

`src/server/game/service.int.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { typed } from "@/test/typing-events";
import { createDb } from "../db/client";
import { games } from "../db/schema";
import { createRedis } from "../redis";
import { createSaveGame } from "./persist";
import { createGameService } from "./service";
import { createGameStore } from "./store";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);

// Tiempos cortos para recorrer partidas completas en el test: sin cuenta atrás, 1,5 s de partida.
const service = createGameService({
  store: createGameStore(redis, process.env.REDIS_KEY_PREFIX!),
  saveGame: createSaveGame(db),
  loadWords: async () => ["hola"],
  random: Math.random,
  newId: randomUUID,
  times: { countdownMs: 0, durationMs: 1_500, graceMs: 500 },
});

const ENV = { coarse: false, touchPoints: 0 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterAll(async () => {
  await db.$client.end();
});

async function play(events: TypingEvent[], { waitBeforeSend = 400, waitBeforeFinish = 0 } = {}) {
  const owner = randomUUID();
  const { gameId, words } = await service.start({ owner, language: "es", env: ENV });
  await sleep(waitBeforeSend);
  expect(await service.appendKeys({ owner, gameId, seq: 1, events })).toBe("ok");
  await sleep(waitBeforeFinish);
  const outcome = await service.finish({ owner, gameId, lastSeq: 1, ipHash: null });
  return { owner, gameId, words, outcome };
}

describe("GameService (Redis + PostgreSQL)", () => {
  it("una partida honesta es válida, se puntúa en el servidor y se guarda", async () => {
    const { gameId, words, outcome } = await play(typed("hola ", { every: 50, hold: 30 }));
    expect(words.every((word) => word === "hola")).toBe(true);
    if (outcome.kind !== "ok") throw new Error(outcome.kind);
    expect(outcome.response).toMatchObject({ gameId, verdict: "valid", reason: null, inputType: "physical", correctChars: 5 });

    const [row] = await db.select().from(games).where(eq(games.id, gameId));
    expect(row).toMatchObject({ verdict: "valid", wpm: outcome.response.wpm });
  });

  it("repetir el final devuelve el mismo resultado sin volver a guardarlo", async () => {
    const { owner, gameId, outcome } = await play(typed("hola ", { every: 50, hold: 30 }));
    const again = await service.finish({ owner, gameId, lastSeq: 1, ipHash: null });
    expect(again).toEqual(outcome);
  });

  it("rechaza eventos generados por código (isTrusted = false)", async () => {
    const events = typed("hola ", { every: 50, hold: 30 }).map((event) => ({ ...event, trusted: false }));
    const { outcome } = await play(events);
    expect(outcome).toMatchObject({ kind: "ok", response: { verdict: "rejected", reason: "untrusted" } });
  });

  it("rechaza un registro con horas posteriores a su llegada", async () => {
    const { outcome } = await play(typed("hola ", { start: 1_000, every: 50, hold: 30 }), { waitBeforeSend: 50 });
    expect(outcome).toMatchObject({ kind: "ok", response: { verdict: "rejected", reason: "fabricated_timing" } });
  });

  it("rechaza un final que llega después de la hora límite", async () => {
    const { outcome } = await play(typed("hola ", { every: 50, hold: 30 }), { waitBeforeFinish: 2_000 });
    expect(outcome).toMatchObject({ kind: "ok", response: { verdict: "rejected", reason: "late" } });
  });

  it("el final de una partida ajena o inexistente no se encuentra", async () => {
    expect(await service.finish({ owner: randomUUID(), gameId: randomUUID(), lastSeq: 0, ipHash: null })).toEqual({ kind: "not_found" });
  });

  it("empezar otra partida cierra la anterior", async () => {
    const owner = randomUUID();
    const first = await service.start({ owner, language: "en", env: ENV });
    await service.start({ owner, language: "en", env: ENV });
    expect(await service.finish({ owner, gameId: first.gameId, lastSeq: 0, ipHash: null })).toEqual({ kind: "closed" });
  });
});
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `pnpm test:int src/server/game`
Expected: FAIL. No se pueden resolver `./persist` ni `./service`; `store.int.test.ts` sigue pasando.

- [ ] **Step 3: Implementar**

`src/server/game/persist.ts`:

```ts
import "server-only";
import { gzipSync } from "node:zlib";
import type { InputType, RejectReason, Verdict } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";
import type { Db } from "../db/client";
import { games, keystrokeLogs } from "../db/schema";
import type { ReceivedBatch } from "../anticheat/rules";

export interface GameRecord {
  id: string;
  anonId: string;
  language: TestLanguage;
  inputType: InputType;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  verdict: Verdict;
  rejectReason: RejectReason | null;
  ipHash: string | null;
  startsAt: Date;
  finishedAt: Date;
  batches: ReceivedBatch[];
}

export type SaveGame = (record: GameRecord) => Promise<void>;

/** Guarda la partida y sus pulsaciones en una sola transacción. */
export function createSaveGame(db: Db): SaveGame {
  return async ({ batches, ...game }) => {
    await db.transaction(async (tx) => {
      await tx.insert(games).values(game);
      await tx.insert(keystrokeLogs).values({
        gameId: game.id,
        events: gzipSync(JSON.stringify(batches)),
      });
    });
  };
}
```

`src/server/game/service.ts`:

```ts
import "server-only";
import type { FinishResponse, StartRequest, StartResponse } from "@/lib/game/types";
import { replay } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
import { generateWords } from "@/lib/words/generate";
import { WORDS_PER_TEST, type TestLanguage } from "@/lib/words/languages";
import { classifyInputType } from "../anticheat/input-type";
import { checkEvents, checkSpeed, checkTiming, type ReceivedBatch } from "../anticheat/rules";
import type { SaveGame } from "./persist";
import type { AppendStatus, GameStore, GameTimes } from "./store";

export interface GameServiceDeps {
  store: GameStore;
  saveGame: SaveGame;
  loadWords: (language: TestLanguage) => Promise<readonly string[]>;
  random: () => number;
  newId: () => string;
  times: GameTimes;
}

export type FinishOutcome =
  | { kind: "ok"; response: FinishResponse }
  | { kind: "busy" | "closed" | "not_found" };

export interface GameService {
  start(input: StartRequest & { owner: string }): Promise<StartResponse>;
  appendKeys(input: { owner: string; gameId: string; seq: number; events: TypingEvent[] }): Promise<AppendStatus>;
  finish(input: { owner: string; gameId: string; lastSeq: number; ipHash: string | null }): Promise<FinishOutcome>;
}

export function createGameService(deps: GameServiceDeps): GameService {
  return {
    async start({ owner, language, env }) {
      const words = generateWords(await deps.loadWords(language), WORDS_PER_TEST, deps.random);
      const game = await deps.store.create({ id: deps.newId(), owner, language, words, env, times: deps.times });
      return {
        gameId: game.id,
        words: game.words,
        countdownMs: deps.times.countdownMs,
        durationMs: deps.times.durationMs,
      };
    },

    async appendKeys({ owner, gameId, seq, events }) {
      return deps.store.append(gameId, owner, seq, JSON.stringify(events));
    },

    async finish({ owner, gameId, lastSeq, ipHash }) {
      const claim = await deps.store.claimFinish(gameId, owner);
      if (claim.kind === "done") return { kind: "ok", response: JSON.parse(claim.result) as FinishResponse };
      if (claim.kind !== "ready") return { kind: claim.kind };

      const { game, finishedAt } = claim;
      const batches: ReceivedBatch[] = claim.batches.map((batch) => ({
        seq: batch.seq,
        arrivedAt: batch.arrivedAt,
        events: JSON.parse(batch.payload) as TypingEvent[],
      }));
      const events = batches.flatMap((batch) => batch.events);

      const inputType = classifyInputType(events, game.env);
      const result = replay(game.words, events, game.durationMs);
      const reason =
        checkTiming(batches, { startsAt: game.startsAt, deadline: game.deadline, finishedAt, lastSeq }) ??
        checkEvents(events, inputType) ??
        checkSpeed(result.wpm, inputType);
      const response: FinishResponse = {
        ...result,
        gameId,
        inputType,
        verdict: reason ? "rejected" : "valid",
        reason,
      };

      try {
        await deps.saveGame({
          id: gameId,
          anonId: owner,
          language: game.language,
          inputType,
          wpm: result.wpm,
          rawWpm: result.rawWpm,
          accuracy: result.accuracy,
          verdict: response.verdict,
          rejectReason: reason,
          ipHash,
          startsAt: new Date(game.startsAt),
          finishedAt: new Date(finishedAt),
          batches,
        });
      } catch (error) {
        await deps.store.release(gameId);
        throw error;
      }
      await deps.store.complete(gameId, JSON.stringify(response));
      return { kind: "ok", response };
    },
  };
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test:int`
Expected: PASS, 20 tests (3 + 7 + 3 + 7).

- [ ] **Step 5: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int`
Expected: sin errores.

---

### Task 5: API de partidas

**Files:**
- Create: `src/server/anon.ts`, `src/server/ip-hash.ts`, `src/server/game/schemas.ts`, `src/server/game/http.ts`, `src/server/game/instance.ts`, `src/app/api/game/start/route.ts`, `src/app/api/game/[id]/keys/route.ts`, `src/app/api/game/[id]/finish/route.ts`
- Test: `src/server/anon.test.ts`, `src/server/ip-hash.test.ts`, `src/app/api/game/routes.int.test.ts`

**Interfaces:**
- Consumes: `createGameService`, `createSaveGame`, `createGameStore` (Tasks 2 y 4); `getDb`, `getRedis`, `serverEnv` (Tasks 1 y 2); `loadWordList`, `OFFICIAL_DURATION_MS`, `TEST_LANGUAGES` (fase 1).
- Produces:
  - `anon.ts`: `ANON_COOKIE = "qr_anon"`, `ANON_COOKIE_MAX_AGE` (1 año), `createAnonId(secret)` y `readAnonId(value, secret)`.
  - `ip-hash.ts`: `hashIp(ip, secret, now)` (hex de 64 caracteres o `null`) y `clientIp(headers)`.
  - `schemas.ts`: `typingEventSchema`, `startBodySchema`, `keysBodySchema` (máx. 2 000 eventos) y `finishBodySchema`.
  - `instance.ts`: `RANKED_TIMES` y `gameService()`.
  - **API:**

  | Ruta | Respuestas |
  |---|---|
  | `POST /api/game/start` | 200, con cookie `qr_anon` la primera vez · 400 cuerpo inválido · 503 |
  | `POST /api/game/{id}/keys` | 200 `{status: "ok"\|"duplicate"}` · 409 `out_of_order`/`closed` · 404 · 400 · 503 |
  | `POST /api/game/{id}/finish` | 200 `FinishResponse` · 409 `busy`/`closed` · 404 · 400 · 503 |

**Notas:**
- Las rutas leen la cookie de `request.cookies` y la escriben con `response.cookies.set`, sin usar `cookies()` de `next/headers`. Así se pueden probar sin el contexto de Next.
- La cookie se crea con `httpOnly`, `sameSite: "lax"`, `secure` en producción, `path: "/"` y una validez de 1 año.

- [ ] **Step 1: Escribir los tests (fallan)**

`src/server/anon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAnonId, readAnonId } from "./anon";

const SECRET = "x".repeat(32);

describe("cookie anónima", () => {
  it("lee el id de una cookie firmada", () => {
    const { id, value } = createAnonId(SECRET);
    expect(readAnonId(value, SECRET)).toBe(id);
  });

  it("rechaza una cookie manipulada o firmada con otro secreto", () => {
    const { value } = createAnonId(SECRET);
    const [id] = value.split(".");
    expect(readAnonId(`${id}.firma-falsa`, SECRET)).toBeNull();
    expect(readAnonId(value, "y".repeat(32))).toBeNull();
    expect(readAnonId(`otro-id.${value.split(".")[1]}`, SECRET)).toBeNull();
  });

  it("rechaza valores vacíos o sin firma", () => {
    expect(readAnonId(undefined, SECRET)).toBeNull();
    expect(readAnonId("", SECRET)).toBeNull();
    expect(readAnonId("solo-id", SECRET)).toBeNull();
  });
});
```

`src/server/ip-hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clientIp, hashIp } from "./ip-hash";

const SECRET = "s".repeat(32);

describe("hashIp", () => {
  it("no guarda la IP en claro y es estable durante el mismo día UTC", () => {
    const a = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T01:00:00Z"));
    const b = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T23:00:00Z"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.7");
    expect(b).toBe(a);
  });

  it("cambia de un día a otro (sal rotativa)", () => {
    const a = hashIp("203.0.113.7", SECRET, new Date("2026-10-05T12:00:00Z"));
    const b = hashIp("203.0.113.7", SECRET, new Date("2026-10-06T12:00:00Z"));
    expect(b).not.toBe(a);
  });

  it("sin IP devuelve null", () => {
    expect(hashIp(null, SECRET, new Date())).toBeNull();
  });
});

describe("clientIp", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("usa x-real-ip si no hay x-forwarded-for, y null si no hay ninguna", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
  });
});
```

`src/app/api/game/routes.int.test.ts`:

```ts
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as finish } from "./[id]/finish/route";
import { POST as keys } from "./[id]/keys/route";
import { POST as start } from "./start/route";

const BASE = "http://localhost/api/game";

function post(url: string, body: unknown, cookie?: string) {
  return new NextRequest(url, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const START = { language: "es", env: { coarse: false, touchPoints: 0 } };

describe("API de partidas", () => {
  it("start devuelve el texto y crea la cookie anónima firmada", async () => {
    const response = await start(post(`${BASE}/start`, START));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.words).toHaveLength(160);
    expect(body).toMatchObject({ countdownMs: 3_000, durationMs: 30_000 });
    const cookie = response.cookies.get("qr_anon");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).toMatch(/^[0-9a-f-]{36}\./);
  });

  it("con la cookie ya creada no la vuelve a enviar", async () => {
    const first = await start(post(`${BASE}/start`, START));
    const cookie = `qr_anon=${first.cookies.get("qr_anon")!.value}`;
    const second = await start(post(`${BASE}/start`, START, cookie));
    expect(second.cookies.get("qr_anon")).toBeUndefined();
  });

  it("rechaza cuerpos inválidos con 400", async () => {
    expect((await start(post(`${BASE}/start`, { language: "fr", env: START.env }))).status).toBe(400);
    expect((await start(post(`${BASE}/start`, "no es json"))).status).toBe(400);
  });

  it("keys y finish sin cookie, o de una partida ajena, dan 404", async () => {
    const res = await start(post(`${BASE}/start`, START));
    const { gameId } = await res.json();
    expect((await keys(post(`${BASE}/${gameId}/keys`, { seq: 1, events: [] }), params(gameId))).status).toBe(404);
    const other = await start(post(`${BASE}/start`, START));
    const otherCookie = `qr_anon=${other.cookies.get("qr_anon")!.value}`;
    expect((await finish(post(`${BASE}/${gameId}/finish`, { lastSeq: 0 }, otherCookie), params(gameId))).status).toBe(404);
  });

  it("keys valida los eventos y acepta tandas en orden", async () => {
    const res = await start(post(`${BASE}/start`, START));
    const cookie = `qr_anon=${res.cookies.get("qr_anon")!.value}`;
    const { gameId } = await res.json();
    const bad = await keys(post(`${BASE}/${gameId}/keys`, { seq: 1, events: [{ t: "0", type: "input" }] }, cookie), params(gameId));
    expect(bad.status).toBe(400);
    const ok = await keys(post(`${BASE}/${gameId}/keys`, { seq: 1, events: [] }, cookie), params(gameId));
    expect(await ok.json()).toEqual({ status: "ok" });
    const gap = await keys(post(`${BASE}/${gameId}/keys`, { seq: 3, events: [] }, cookie), params(gameId));
    expect(gap.status).toBe(409);
  });
});
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `pnpm test src/server`
Expected: FAIL en `anon.test.ts` e `ip-hash.test.ts`: no se pueden resolver `./anon` ni `./ip-hash`.

Run: `pnpm test:int src/app`
Expected: FAIL: no se puede resolver `./[id]/finish/route`.

- [ ] **Step 3: Implementar los módulos del servidor**

`src/server/anon.ts`:

```ts
import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/** Identificador anónimo del jugador, en una cookie firmada con HMAC: `<id>.<firma>`. */

export const ANON_COOKIE = "qr_anon";
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function sign(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

export function createAnonId(secret: string): { id: string; value: string } {
  const id = randomUUID();
  return { id, value: `${id}.${sign(id, secret)}` };
}

export function readAnonId(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(id, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}
```

`src/server/ip-hash.ts`:

```ts
import "server-only";
import { createHmac } from "node:crypto";

/** La IP nunca se guarda en claro: HMAC con una sal que cambia cada día UTC (spec §6). */

export function hashIp(ip: string | null, secret: string, now: Date): string | null {
  if (!ip) return null;
  const day = now.toISOString().slice(0, 10);
  const dailySalt = createHmac("sha256", secret).update(day).digest();
  return createHmac("sha256", dailySalt).update(ip).digest("hex");
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}
```

`src/server/game/schemas.ts`:

```ts
import "server-only";
import { z } from "zod";
import { TEST_LANGUAGES } from "@/lib/words/languages";

/** Validación de todo lo que llega a la API de partidas (spec §8.3). */

const keyEvent = z.object({
  t: z.number(),
  type: z.enum(["down", "up"]),
  key: z.string().max(32),
  code: z.string().max(32),
  trusted: z.boolean(),
});

const inputEvent = z.object({
  t: z.number(),
  type: z.literal("input"),
  deleted: z.number().int().min(0).max(64),
  inserted: z.string().max(64),
  trusted: z.boolean(),
});

export const typingEventSchema = z.discriminatedUnion("type", [keyEvent, inputEvent]);

export const startBodySchema = z.object({
  language: z.enum(TEST_LANGUAGES),
  env: z.object({
    coarse: z.boolean(),
    touchPoints: z.number().int().min(0).max(32),
  }),
});

export const keysBodySchema = z.object({
  seq: z.number().int().min(1).max(200),
  events: z.array(typingEventSchema).max(2_000),
});

export const finishBodySchema = z.object({
  lastSeq: z.number().int().min(0).max(200),
});
```

`src/server/game/http.ts`:

```ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { ANON_COOKIE, readAnonId } from "../anon";
import { serverEnv } from "../env";

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function parseBody<T extends z.ZodType>(request: NextRequest, schema: T): Promise<z.infer<T> | null> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function readOwner(request: NextRequest): string | null {
  return readAnonId(request.cookies.get(ANON_COOKIE)?.value, serverEnv().ANON_COOKIE_SECRET);
}
```

`src/server/game/instance.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import { loadWordList } from "@/lib/words/load";
import { getDb } from "../db/client";
import { serverEnv } from "../env";
import { getRedis } from "../redis";
import { createSaveGame } from "./persist";
import { createGameService, type GameService } from "./service";
import { createGameStore } from "./store";

/** Cuenta atrás de 3 s, 30 s de partida y 3 s de margen para la latencia (spec §3.4 y §4.2). */
export const RANKED_TIMES = { countdownMs: 3_000, durationMs: OFFICIAL_DURATION_MS, graceMs: 3_000 };

function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

let service: GameService | null = null;

export function gameService(): GameService {
  service ??= createGameService({
    store: createGameStore(getRedis(), serverEnv().REDIS_KEY_PREFIX),
    saveGame: createSaveGame(getDb()),
    loadWords: loadWordList,
    random: secureRandom,
    newId: randomUUID,
    times: RANKED_TIMES,
  });
  return service;
}
```

- [ ] **Step 4: Implementar las rutas**

`src/app/api/game/start/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE, createAnonId } from "@/server/anon";
import { serverEnv } from "@/server/env";
import { jsonError, parseBody, readOwner } from "@/server/game/http";
import { gameService } from "@/server/game/instance";
import { startBodySchema } from "@/server/game/schemas";

export async function POST(request: NextRequest) {
  const body = await parseBody(request, startBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  const existing = readOwner(request);
  const anon = existing ? null : createAnonId(serverEnv().ANON_COOKIE_SECRET);

  try {
    const game = await gameService().start({ owner: existing ?? anon!.id, ...body });
    const response = NextResponse.json(game);
    if (anon) {
      response.cookies.set(ANON_COOKIE, anon.value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ANON_COOKIE_MAX_AGE,
      });
    }
    return response;
  } catch (error) {
    console.error("start failed", error);
    return jsonError("unavailable", 503);
  }
}
```

`src/app/api/game/[id]/keys/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, parseBody, readOwner } from "@/server/game/http";
import { gameService } from "@/server/game/instance";
import { keysBodySchema } from "@/server/game/schemas";

const STATUS_CODE = { ok: 200, duplicate: 200, out_of_order: 409, closed: 409, not_found: 404 } as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = readOwner(request);
  if (!owner) return jsonError("not_found", 404);
  const body = await parseBody(request, keysBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  try {
    const status = await gameService().appendKeys({ owner, gameId: id, ...body });
    return NextResponse.json({ status }, { status: STATUS_CODE[status] });
  } catch (error) {
    console.error("keys failed", error);
    return jsonError("unavailable", 503);
  }
}
```

`src/app/api/game/[id]/finish/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { jsonError, parseBody, readOwner } from "@/server/game/http";
import { gameService } from "@/server/game/instance";
import { finishBodySchema } from "@/server/game/schemas";
import { clientIp, hashIp } from "@/server/ip-hash";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = readOwner(request);
  if (!owner) return jsonError("not_found", 404);
  const body = await parseBody(request, finishBodySchema);
  if (!body) return jsonError("invalid_body", 400);

  try {
    const ipHash = hashIp(clientIp(request.headers), serverEnv().IP_HASH_SECRET, new Date());
    const outcome = await gameService().finish({ owner, gameId: id, lastSeq: body.lastSeq, ipHash });
    if (outcome.kind === "ok") return NextResponse.json(outcome.response);
    return jsonError(outcome.kind, outcome.kind === "not_found" ? 404 : 409);
  } catch (error) {
    console.error("finish failed", error);
    return jsonError("unavailable", 503);
  }
}
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `pnpm test && pnpm test:int`
Expected: PASS; 117 unitarios (109 + 3 + 5) y 25 de integración (20 + 5).

- [ ] **Step 6: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: sin errores. El build lista `ƒ /api/game/[id]/finish`, `ƒ /api/game/[id]/keys` y `ƒ /api/game/start`, y las 6 páginas siguen siendo `●` (SSG).

---

### Task 6: Sesión de juego y captura de teclado reutilizables

**Files:**
- Modify: `src/components/typing-test/use-typing-session.ts`, `src/components/typing-test/typing-test.tsx`, `src/components/typing-test/timer.tsx`
- Create: `src/components/typing-test/event-time.ts`, `src/components/typing-test/use-typing-input.ts`
- Test: `src/components/typing-test/use-typing-session.test.ts`, `src/components/typing-test/event-time.test.ts`. `typing-test.test.tsx` no se toca y debe seguir pasando.

**Interfaces:**
- Consumes: `applyInput`, `createEngine`, `isFinished`, `replay` (fase 1).
- Produces:
  - `useTypingSession({ initialWords, durationMs, nextWords, autoStart = true, onFinish?, now? })`, que devuelve:
    - `{ engine, status, endsAt, result }`;
    - `handleInput(diff, trusted, at?)` y `handleKey(key, at?)`;
    - `begin()`, `load(words)`, `restart()` y `getEvents()`.
  - `eventTime(timeStamp, now?): number`.
  - `useTypingInput({ target, onRestart, onEnter?, onSpace? })`, que devuelve `{ inputProps, focused, focus, reset }`. `target` es `TypingTarget { engine; status; handleInput; handleKey }`.
  - `Timer` acepta además `testId` (por defecto `"timer"`) y `className`.

**Cambios en la sesión:**
- **Arranque automático (`autoStart`):** si está desactivado, la entrada se ignora hasta `begin()`. Es lo que usa Ranked, cuyo reloj empieza al terminar la cuenta atrás.
- **Pulsaciones que no cambian el texto** (espacio suelto, borrar al principio): no arrancan el reloj (menor #9 de la fase 1).
- **Entradas después del tiempo:** terminan la partida y no cuentan (menor #8).
- **Hora de cada evento:** `t` sale de `at`, la hora del evento (`event.timeStamp` vía `eventTime`), y no de la hora del manejador (menor #10).
- **`onFinish(result)`:** se llama una vez al terminar, desde el temporizador o desde la última pulsación; nunca desde un efecto.

- [ ] **Step 1: Escribir los tests (fallan)**

`src/components/typing-test/use-typing-session.test.ts` (sustituye el archivo completo; añade 6 tests):

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypingSession } from "./use-typing-session";

describe("useTypingSession", () => {
  let clock = 0;
  const now = () => clock;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1000;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(words = ["hola", "mundo", "azul"], durationMs = 15_000, extra: { autoStart?: boolean; onFinish?: () => void } = {}) {
    const nextWords = vi.fn(() => ["nuevo", "texto"]);
    const hook = renderHook(() => useTypingSession({ initialWords: words, durationMs, nextWords, now, ...extra }));
    return { ...hook, nextWords };
  }

  it("empieza en reposo", () => {
    const { result } = setup();
    expect(result.current.status).toBe("idle");
    expect(result.current.endsAt).toBeNull();
  });

  it("arranca con la primera entrada y fija la hora de fin", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    expect(result.current.status).toBe("running");
    expect(result.current.endsAt).toBe(1000 + 15_000);
    expect(result.current.engine.typed[0]).toBe("h");
  });

  it("termina al agotarse el tiempo y calcula el resultado", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "hola " }, true);
    });
    act(() => {
      clock += 15_000;
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.status).toBe("finished");
    expect(result.current.result?.correctChars).toBe(5);
    expect(result.current.result?.wpm).toBe(4);
  });

  it("ignora la entrada después de terminar", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "ola" }, true);
    });
    expect(result.current.engine.typed[0]).toBe("h");
  });

  it("termina antes de tiempo si se escriben todas las palabras", () => {
    const { result } = setup(["fin"]);
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "fin " }, true);
    });
    expect(result.current.status).toBe("finished");
  });

  it("solo registra teclas mientras la partida está en marcha", () => {
    const { result } = setup(["ab"], 1000);
    act(() => {
      result.current.handleKey({ type: "down", key: "a", code: "KeyA", trusted: true });
      result.current.handleInput({ deleted: 0, inserted: "a" }, true);
      clock += 100;
      result.current.handleKey({ type: "down", key: "b", code: "KeyB", trusted: true });
    });
    expect(result.current.getEvents()).toEqual([
      { t: 0, type: "input", deleted: 0, inserted: "a", trusted: true },
      { t: 100, type: "down", key: "b", code: "KeyB", trusted: true },
    ]);
    act(() => {
      vi.advanceTimersByTime(1000);
      result.current.handleKey({ type: "down", key: "c", code: "KeyC", trusted: true });
    });
    expect(result.current.getEvents()).toHaveLength(2);
  });

  it("reiniciar pide palabras nuevas y vuelve al reposo", () => {
    const { result, nextWords } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "ho" }, true);
    });
    act(() => {
      result.current.restart();
    });
    expect(nextWords).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
    expect(result.current.engine.words).toEqual(["nuevo", "texto"]);
    expect(result.current.endsAt).toBeNull();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(result.current.status).toBe("idle");
  });

  it("un espacio suelto o un borrado al empezar no arrancan el reloj", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: " " }, true);
      result.current.handleInput({ deleted: 1, inserted: "" }, true);
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.getEvents()).toEqual([]);
  });

  it("usa la hora del evento si se le pasa", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true, 1_000);
      result.current.handleKey({ type: "up", key: "h", code: "KeyH", trusted: true }, 1_080);
    });
    expect(result.current.getEvents().map((event) => event.t)).toEqual([0, 80]);
  });

  it("una entrada que llega después del tiempo termina la partida y no cuenta", () => {
    const { result } = setup(["hola", "mundo"], 1_000);
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    act(() => {
      clock += 1_500;
      result.current.handleInput({ deleted: 0, inserted: "o" }, true);
    });
    expect(result.current.status).toBe("finished");
    expect(result.current.engine.typed[0]).toBe("h");
  });

  it("con autoStart desactivado ignora la entrada hasta llamar a begin()", () => {
    const { result } = setup(["hola"], 15_000, { autoStart: false });
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.engine.typed[0]).toBe("");
    act(() => {
      result.current.begin();
    });
    expect(result.current.status).toBe("running");
    expect(result.current.endsAt).toBe(1_000 + 15_000);
    act(() => {
      clock += 200;
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    expect(result.current.getEvents()).toEqual([{ t: 200, type: "input", deleted: 0, inserted: "h", trusted: true }]);
  });

  it("load() pone un texto nuevo y vuelve al reposo", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "ho" }, true);
    });
    act(() => {
      result.current.load(["del", "servidor"]);
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.engine.words).toEqual(["del", "servidor"]);
    expect(result.current.getEvents()).toEqual([]);
  });

  it("avisa con onFinish al terminar, con el resultado local", () => {
    const onFinish = vi.fn();
    const { result } = setup(["fin"], 15_000, { onFinish });
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "fin " }, true);
    });
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][0]).toMatchObject({ correctChars: 4 });
  });
});
```

`src/components/typing-test/event-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eventTime } from "./event-time";

describe("eventTime", () => {
  it("usa la hora del evento si está en la escala de performance.now()", () => {
    expect(eventTime(990, 1_000)).toBe(990);
  });

  it("usa la hora actual si el evento viene en otra escala (época Unix) o no tiene hora", () => {
    expect(eventTime(1_790_000_000_000, 1_000)).toBe(1_000);
    expect(eventTime(0, 1_000)).toBe(1_000);
  });

  it("usa la hora actual si el evento parece del futuro o de hace más de un segundo", () => {
    expect(eventTime(1_500, 1_000)).toBe(1_000);
    expect(eventTime(10, 5_000)).toBe(5_000);
  });
});
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `pnpm test src/components/typing-test`
Expected:
- FAIL en 6 tests de `use-typing-session.test.ts` (no existen `begin`, `load` ni `onFinish`, y la sesión arranca con un espacio).
- FAIL en `event-time.test.ts`: no se puede resolver `./event-time`.

- [ ] **Step 3: Implementar**

`src/components/typing-test/event-time.ts`:

```ts
/**
 * Hora de un evento en la escala de `performance.now()`. Los navegadores actuales dan
 * `event.timeStamp` en esa escala; si no (navegadores antiguos, jsdom), se usa la hora actual.
 */
export function eventTime(timeStamp: number, now = performance.now()): number {
  return timeStamp > 0 && timeStamp <= now && now - timeStamp < 1_000 ? timeStamp : now;
}
```

`src/components/typing-test/use-typing-session.ts` (sustituye el archivo completo):

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { applyInput, createEngine, isFinished, type EngineState } from "@/lib/scoring/engine";
import { replay, type TestResult } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
import type { InputDiff } from "./input-diff";

export type SessionStatus = "idle" | "running" | "finished";

export interface KeyInfo {
  type: "down" | "up";
  key: string;
  code: string;
  trusted: boolean;
}

interface Options {
  initialWords: readonly string[];
  durationMs: number;
  /** Palabras para la siguiente partida al reiniciar. */
  nextWords: () => readonly string[];
  /** Con `false`, el reloj no arranca con la primera pulsación sino al llamar a `begin()` (Ranked). */
  autoStart?: boolean;
  /** Se llama una vez al terminar, con el resultado calculado en el navegador. */
  onFinish?: (result: TestResult) => void;
  now?: () => number;
}

const defaultNow = () => performance.now();

/**
 * Lógica de una partida: el reloj empieza con la primera pulsación que cambia el texto
 * (o con `begin()`), termina a los `durationMs` y el resultado sale de `replay`, la
 * misma función que usa el servidor. Los tiempos `at` van en la escala de `performance.now()`.
 */
export function useTypingSession({
  initialWords,
  durationMs,
  nextWords,
  autoStart = true,
  onFinish,
  now = defaultNow,
}: Options) {
  const [engine, setEngine] = useState(() => createEngine(initialWords));
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const engineRef = useRef(engine);
  const statusRef = useRef<SessionStatus>("idle");
  const eventsRef = useRef<TypingEvent[]>([]);
  const startRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
  }, []);

  function finish() {
    if (statusRef.current === "finished") return;
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    statusRef.current = "finished";
    const local = replay(engineRef.current.words, eventsRef.current, durationMs);
    setStatus("finished");
    setResult(local);
    onFinish?.(local);
  }

  function startClock(at: number) {
    startRef.current = at;
    statusRef.current = "running";
    setStatus("running");
    setEndsAt(at + durationMs);
    timeoutRef.current = setTimeout(finish, Math.max(0, at + durationMs - now()));
  }

  function handleInput(diff: InputDiff, trusted: boolean, at = now()): EngineState {
    if (statusRef.current === "finished") return engineRef.current;
    const next = applyInput(engineRef.current, diff.deleted, diff.inserted);

    if (statusRef.current === "idle") {
      // Sin arranque automático, o si la pulsación no cambia nada (espacio suelto, borrar), no empieza.
      if (!autoStart || sameTyping(next, engineRef.current)) return engineRef.current;
      startClock(at);
    }

    const t = at - startRef.current!;
    if (t > durationMs) {
      finish();
      return engineRef.current;
    }

    eventsRef.current.push({ t, type: "input", deleted: diff.deleted, inserted: diff.inserted, trusted });
    engineRef.current = next;
    setEngine(next);
    if (isFinished(next)) finish();
    return next;
  }

  function handleKey(key: KeyInfo, at = now()) {
    if (statusRef.current !== "running" || startRef.current === null) return;
    const t = at - startRef.current;
    if (t > durationMs) return;
    eventsRef.current.push({ t, ...key });
  }

  /** Arranca el reloj ahora (Ranked: al terminar la cuenta atrás). */
  function begin() {
    if (statusRef.current !== "idle") return;
    startClock(now());
  }

  /** Pone un texto nuevo y vuelve al reposo. */
  function load(words: readonly string[]) {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const fresh = createEngine(words);
    engineRef.current = fresh;
    statusRef.current = "idle";
    eventsRef.current = [];
    startRef.current = null;
    setEngine(fresh);
    setStatus("idle");
    setEndsAt(null);
    setResult(null);
  }

  function restart() {
    load(nextWords());
  }

  function getEvents(): readonly TypingEvent[] {
    return [...eventsRef.current];
  }

  return { engine, status, endsAt, result, handleInput, handleKey, begin, load, restart, getEvents };
}

/** Dos estados con lo mismo escrito: la pulsación no ha cambiado el texto. */
function sameTyping(a: EngineState, b: EngineState): boolean {
  return a.current === b.current && a.typed[a.current] === b.typed[b.current];
}
```

`src/components/typing-test/use-typing-input.ts`:

```ts
"use client";

import { useEffect, useRef, useState, type CompositionEvent, type FormEvent, type KeyboardEvent } from "react";
import type { EngineState } from "@/lib/scoring/engine";
import { eventTime } from "./event-time";
import { diffInput, isDeadKeyPreview, type InputDiff } from "./input-diff";
import type { KeyInfo, SessionStatus } from "./use-typing-session";

export interface TypingTarget {
  engine: EngineState;
  status: SessionStatus;
  handleInput(diff: InputDiff, trusted: boolean, at?: number): EngineState;
  handleKey(key: KeyInfo, at?: number): void;
}

interface Options {
  target: TypingTarget;
  /** Tab sin modificadores. */
  onRestart: () => void;
  /** Enter. */
  onEnter?: () => void;
  /** Espacio. Devuelve `true` si lo ha usado (p. ej. para empezar una partida Ranked). */
  onSpace?: () => boolean;
}

const prevent = (event: { preventDefault(): void }) => event.preventDefault();

/**
 * Captura del teclado con un `<input>` oculto: convierte cada cambio en `{ deleted, inserted }`,
 * filtra teclas muertas, respeta la composición de los teclados de móvil y gestiona el foco.
 */
export function useTypingInput({ target, onRestart, onEnter, onSpace }: Options) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastValueRef = useRef("");
  const deadKeyRef = useRef(false);
  const [focused, setFocused] = useState(false);

  // Enfoca al cargar solo con ratón o trackpad: en móvil, enfocar sin que el usuario toque
  // no abre el teclado y ocultaría el aviso "toca para empezar". Si el input ya tenía el
  // foco antes de hidratar (un clic temprano), React no vio el evento `focus`: se quita y
  // se vuelve a dar para que `onFocus` se entere.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const alreadyFocused = document.activeElement === input;
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
    if (!alreadyFocused && !finePointer) return;
    if (alreadyFocused) input.blur();
    input.focus({ preventScroll: true });
  }, []);

  /** Lleva al motor lo que haya cambiado en el input desde la última vez. */
  function processValue(element: HTMLInputElement, composing: boolean, trusted: boolean, at: number) {
    const next = element.value.normalize("NFC");
    const diff = diffInput(lastValueRef.current, next);
    if (isDeadKeyPreview(diff, composing, deadKeyRef.current)) return;
    const changed = diff.deleted > 0 || diff.inserted !== "";
    const state = changed ? target.handleInput(diff, trusted, at) : target.engine;
    if (composing) {
      // Mientras se compone (teclados de Android) no se toca el valor: rompería el IME.
      lastValueRef.current = next;
      return;
    }
    const expected = state.typed[state.current] ?? "";
    if (element.value !== expected) element.value = expected;
    lastValueRef.current = expected;
  }

  function onInput(event: FormEvent<HTMLInputElement>) {
    const composing = (event.nativeEvent as InputEvent).isComposing === true;
    processValue(event.currentTarget, composing, event.nativeEvent.isTrusted, eventTime(event.timeStamp));
  }

  // Al acabar una composición, el input vuelve a la palabra actual del motor. Si no, el
  // teclado seguiría editando texto de palabras ya confirmadas.
  function onCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    processValue(event.currentTarget, false, event.nativeEvent.isTrusted, eventTime(event.timeStamp));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    deadKeyRef.current = event.key === "Dead";
    // Solo Tab sin modificadores reinicia: Mayús+Tab sigue sirviendo para salir con el teclado.
    const plainTab = event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (plainTab) {
      event.preventDefault();
      onRestart();
      return;
    }
    if (event.key === "Enter" && onEnter) {
      event.preventDefault();
      onEnter();
      return;
    }
    if (event.key === " " && onSpace?.()) {
      event.preventDefault();
      return;
    }
    const info = { type: "down", key: event.key, code: event.code, trusted: event.nativeEvent.isTrusted } as const;
    target.handleKey(info, eventTime(event.timeStamp));
  }

  function onKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    const info = { type: "up", key: event.key, code: event.code, trusted: event.nativeEvent.isTrusted } as const;
    target.handleKey(info, eventTime(event.timeStamp));
  }

  /** Vacía el input y le da el foco: al empezar una partida nueva. */
  function reset() {
    lastValueRef.current = "";
    const input = inputRef.current;
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  function focus() {
    inputRef.current?.focus();
  }

  const inputProps = {
    ref: inputRef,
    type: "text",
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    readOnly: target.status === "finished",
    className: "absolute left-0 top-0 h-px w-px text-base opacity-0",
    onInput,
    onCompositionEnd,
    onKeyDown,
    onKeyUp,
    onPaste: prevent,
    onDrop: prevent,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };

  return { inputProps, focused, focus, reset };
}
```

`src/components/typing-test/typing-test.tsx` (sustituye el archivo completo; ahora usa `useTypingInput`):

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { generateWords } from "@/lib/words/generate";
import { WORDS_PER_TEST, type TestLanguage } from "@/lib/words/languages";
import { loadWordList } from "@/lib/words/load";
import { ResultView } from "./result-view";
import { Timer } from "./timer";
import { useTypingInput } from "./use-typing-input";
import { useTypingSession } from "./use-typing-session";
import { WordsView } from "./words-view";

export interface TypingTestProps {
  language: TestLanguage;
  durationMs: number;
  initialWords: readonly string[];
}

/** Test local (práctica): empieza con la primera pulsación y no se envía al servidor. */
export function TypingTest({ language, durationMs, initialWords }: TypingTestProps) {
  const t = useTranslations("TypingTest");
  const listRef = useRef<readonly string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWordList(language).then((list) => {
      if (!cancelled) listRef.current = list;
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const session = useTypingSession({
    initialWords,
    durationMs,
    nextWords: () => generateWords(listRef.current ?? initialWords, WORDS_PER_TEST, Math.random),
  });

  function restart() {
    session.restart();
    typing.reset();
  }

  const typing = useTypingInput({
    target: session,
    onRestart: restart,
    onEnter: () => {
      if (session.status === "finished") restart();
    },
  });

  return (
    <section
      aria-label={t("label")}
      data-testid="typing-area"
      className="relative flex flex-col gap-4"
      onClick={typing.focus}
    >
      <div className="flex h-10 items-center justify-between">
        <Timer endsAt={session.endsAt} durationMs={durationMs} />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("restartHint")}</span>
      </div>

      {/* Altura reservada para el resultado (hasta ~27rem en móvil con la lista de fallos
          en dos líneas): así, al terminar, el contenido de debajo no salta (CLS = 0). */}
      <div className="min-h-[28rem]">
        {session.status === "finished" && session.result ? (
          <ResultView result={session.result} onRestart={restart} />
        ) : (
          <div className="relative">
            <div className={typing.focused ? "" : "opacity-40 blur-[2px]"}>
              <WordsView engine={session.engine} />
            </div>
            {!typing.focused && (
              <p
                data-testid="focus-prompt"
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-center font-medium"
              >
                {t("focusPrompt")}
              </p>
            )}
          </div>
        )}
      </div>

      <input data-testid="typing-input" aria-label={t("inputLabel")} {...typing.inputProps} />
    </section>
  );
}
```

`src/components/typing-test/timer.tsx` (sustituye el archivo completo):

```tsx
"use client";

import { useEffect, useState } from "react";

const defaultNow = () => performance.now();

/** Segundos restantes. Se actualiza solo, sin hacer que se vuelva a pintar el texto. */
export function Timer({
  endsAt,
  durationMs,
  testId = "timer",
  className = "font-mono text-2xl tabular-nums text-amber-600 dark:text-amber-400",
  now = defaultNow,
}: {
  endsAt: number | null;
  durationMs: number;
  testId?: string;
  className?: string;
  now?: () => number;
}) {
  const [tick, setTick] = useState<{ endsAt: number; seconds: number } | null>(null);

  useEffect(() => {
    if (endsAt === null) return;
    let frame = 0;
    const update = () => {
      const seconds = Math.ceil(Math.max(0, endsAt - now()) / 1000);
      setTick((prev) => (prev?.endsAt === endsAt && prev.seconds === seconds ? prev : { endsAt, seconds }));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [endsAt, now]);

  const seconds =
    endsAt !== null && tick?.endsAt === endsAt ? tick.seconds : Math.ceil(durationMs / 1000);
  return (
    <span data-testid={testId} className={className}>
      {seconds}
    </span>
  );
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/components`
Expected: PASS, 44 tests (18 del componente + 10 de input-diff + 13 de la sesión + 3 de eventTime).

- [ ] **Step 5: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: sin errores; 126 tests unitarios. Las reglas del React Compiler en el lint deben salir limpias.

---

### Task 7: Ranked en el navegador

**Files:**
- Create: `src/components/ranked/api.ts`, `src/components/ranked/batch-sender.ts`, `src/components/ranked/client-env.ts`, `src/components/ranked/ranked-test.tsx`
- Modify: `messages/en.json`, `messages/es.json`, `messages/pt.json`, `src/app/[locale]/page.tsx`
- Test: `src/components/ranked/api.test.ts`, `src/components/ranked/batch-sender.test.ts`, `src/components/ranked/ranked-test.test.tsx`

**Interfaces:**
- Consumes:
  - de la Task 6: `useTypingSession` (con `autoStart: false`, `load`, `begin`, `onFinish` y `getEvents`), `useTypingInput` y `Timer` (con `testId`);
  - `ResultView` y `WordsView` (fase 1);
  - tipos de la Task 2;
  - la API de la Task 5.
- Produces:
  - `api.ts`: `GameApiError { status; code }`, `startGame(body)`, `sendKeys(gameId, body)`, `finishGame(gameId, body, { attempts = 5, delayMs = 400 })` e `isRetryable(error)`.
  - `batch-sender.ts`: `createBatchSender({ getEvents, send, intervalMs = 3000, retryDelaysMs })`, que devuelve `{ start, flush(): Promise<{ lastSeq; delivered }>, stop }`.
  - `client-env.ts`: `readClientEnv(): ClientEnv`.
  - `RankedTest({ language })`, con los `data-testid` `ranked-start`, `countdown` y `ranked-status`, además de los de la fase 1.
  - Mensajes nuevos: `Ranked.*` (11 claves). Cambia `Home.intro`.

**Flujo de `RankedTest`** (spec §3.4):
1. **Reposo:** botón Empezar, o Espacio o Enter con el input enfocado.
2. **`startGame`:** `load(words)`, cuenta atrás con el texto **sin pintar**, y al llegar a 0 `begin()` y arranca el envío de tandas.
3. **`onFinish`:** `flush()` del envío, `finishGame(lastSeq)` y el veredicto en `ranked-status`:
   - `late`/`incomplete` → problema de conexión;
   - `multi_insert` → "letra a letra";
   - el resto de rechazos → actividad no reconocida.
4. **Tab:** empieza otra partida en cualquier momento. Las respuestas de una partida anterior se ignoran por su número de intento.
5. **Fallos:** si falla `startGame` → "Ranked no disponible" con un enlace a la práctica. Si falla `finishGame` → resultado local con el aviso de problema de conexión, o de "partida reemplazada" si la respuesta es `closed`.

- [ ] **Step 1: Escribir los tests (fallan)**

`src/components/ranked/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameApiError, finishGame, sendKeys, startGame } from "./api";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api de partidas", () => {
  it("startGame hace POST con JSON y devuelve la partida", async () => {
    const fetchMock = vi.fn(async () => reply(200, { gameId: "g1", words: ["a"], countdownMs: 3000, durationMs: 30000 }));
    vi.stubGlobal("fetch", fetchMock);
    const game = await startGame({ language: "es", env: { coarse: false, touchPoints: 0 } });
    expect(game.gameId).toBe("g1");
    expect(fetchMock).toHaveBeenCalledWith("/api/game/start", expect.objectContaining({ method: "POST" }));
  });

  it("los errores HTTP llegan como GameApiError con el código del servidor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(409, { error: "out_of_order" })));
    const error = await sendKeys("g1", { seq: 3, events: [] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GameApiError);
    expect(error).toMatchObject({ status: 409, code: "out_of_order" });
  });

  it("finishGame reintenta mientras el servidor está ocupado o no responde", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(409, { error: "busy" }))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(reply(200, { verdict: "valid" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await finishGame("g1", { lastSeq: 2 }, { delayMs: 0 });
    expect(response).toEqual({ verdict: "valid" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("finishGame no reintenta una partida cerrada o inexistente", async () => {
    const fetchMock = vi.fn(async () => reply(409, { error: "closed" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(finishGame("g1", { lastSeq: 0 }, { delayMs: 0 })).rejects.toMatchObject({ code: "closed" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
```

`src/components/ranked/batch-sender.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { GameApiError } from "./api";
import { createBatchSender } from "./batch-sender";

const event = (t: number): TypingEvent => ({ t, type: "input", deleted: 0, inserted: "a", trusted: true });

describe("createBatchSender", () => {
  let events: TypingEvent[];
  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(send = vi.fn(async () => {})) {
    const sender = createBatchSender({ getEvents: () => events, send, intervalMs: 3_000, retryDelaysMs: [100, 200] });
    return { sender, send };
  }

  it("envía cada intervalo solo los eventos nuevos, con seq creciente", async () => {
    const { sender, send } = setup();
    sender.start();
    events.push(event(1), event(2));
    await vi.advanceTimersByTimeAsync(3_000);
    events.push(event(3));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(send.mock.calls).toEqual([
      [1, [event(1), event(2)]],
      [2, [event(3)]],
    ]);
  });

  it("no envía tandas vacías", async () => {
    const { sender, send } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("flush envía lo pendiente, espera a que llegue todo y devuelve el último seq", async () => {
    const { sender, send } = setup();
    sender.start();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(3_000);
    events.push(event(2));
    await expect(sender.flush()).resolves.toEqual({ lastSeq: 2, delivered: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("reintenta los fallos de red", async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(undefined);
    const { sender } = setup(send);
    events.push(event(1));
    const flushed = sender.flush();
    await vi.advanceTimersByTimeAsync(100);
    await expect(flushed).resolves.toEqual({ lastSeq: 1, delivered: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("si una tanda no llega, no envía las siguientes y lo indica", async () => {
    const send = vi.fn().mockRejectedValue(new GameApiError(409, "closed"));
    const { sender } = setup(send);
    sender.start();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(3_000);
    events.push(event(2));
    await expect(sender.flush()).resolves.toEqual({ lastSeq: 2, delivered: false });
    expect(send).toHaveBeenCalledOnce();
  });

  it("stop deja de enviar", async () => {
    const { sender, send } = setup();
    sender.start();
    sender.stop();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(send).not.toHaveBeenCalled();
  });
});
```

`src/components/ranked/ranked-test.test.tsx`:

```tsx
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinishResponse } from "@/lib/game/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { GameApiError, finishGame, sendKeys, startGame } from "./api";
import { RankedTest } from "./ranked-test";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  startGame: vi.fn(),
  sendKeys: vi.fn(),
  finishGame: vi.fn(),
}));

const GAME = { gameId: "g1", words: ["hola", "mundo"], countdownMs: 3_000, durationMs: 30_000 };

function response(overrides: Partial<FinishResponse> = {}): FinishResponse {
  return {
    gameId: "g1",
    wpm: 2,
    rawWpm: 2,
    accuracy: 100,
    correctChars: 5,
    typedChars: 5,
    perSecond: Array(30).fill(2),
    mistakes: {},
    inputType: "physical",
    verdict: "valid",
    reason: null,
    ...overrides,
  };
}

function typeText(input: HTMLInputElement, text: string) {
  for (const char of text) fireEvent.input(input, { target: { value: input.value + char } });
}

async function startAndCountDown() {
  fireEvent.click(screen.getByTestId("ranked-start"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByTestId("countdown")).toBeInTheDocument();
  expect(screen.queryAllByTestId("word")).toHaveLength(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });
}

describe("RankedTest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(startGame).mockResolvedValue(GAME);
    vi.mocked(sendKeys).mockResolvedValue(undefined);
    vi.mocked(finishGame).mockResolvedValue(response());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("antes de empezar no muestra ninguna palabra, solo el botón", () => {
    renderWithIntl(<RankedTest language="es" />);
    expect(screen.getByTestId("ranked-start")).toBeInTheDocument();
    expect(screen.queryAllByTestId("word")).toHaveLength(0);
  });

  it("partida completa: cuenta atrás, texto, envío de pulsaciones y veredicto del servidor", async () => {
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    expect(startGame).toHaveBeenCalledWith({ language: "es", env: { coarse: false, touchPoints: 0 } });
    expect(screen.getAllByTestId("word")).toHaveLength(2);

    const input = screen.getByTestId("typing-input") as HTMLInputElement;
    typeText(input, "hola ");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(sendKeys).toHaveBeenCalled();
    expect(vi.mocked(sendKeys).mock.calls[0][1].seq).toBe(1);
    const lastSeq = vi.mocked(sendKeys).mock.calls.at(-1)![1].seq;
    expect(finishGame).toHaveBeenCalledWith("g1", { lastSeq });
    expect(screen.getByTestId("result")).toBeInTheDocument();
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("Valid game");
  });

  it("muestra el motivo cuando el servidor rechaza la partida", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verdict: "rejected", reason: "multi_insert" }));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("type letter by letter");
  });

  it("un final que llega tarde (p. ej. con la pestaña en segundo plano) se explica como problema de conexión", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verdict: "rejected", reason: "late" }));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("Connection problem");
  });

  it("si el servidor no reconoce la partida (p. ej. cookies bloqueadas), enseña el resultado local como no válido", async () => {
    vi.mocked(sendKeys).mockRejectedValue(new GameApiError(404, "not_found"));
    vi.mocked(finishGame).mockRejectedValue(new GameApiError(404, "not_found"));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    typeText(screen.getByTestId("typing-input") as HTMLInputElement, "hola ");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("Connection problem");
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("100%");
  });

  it("durante la cuenta atrás no se puede escribir", async () => {
    renderWithIntl(<RankedTest language="es" />);
    fireEvent.click(screen.getByTestId("ranked-start"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    const input = screen.getByTestId("typing-input") as HTMLInputElement;
    typeText(input, "ho");
    expect(input.value).toBe("");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getAllByTestId("word")[0].querySelectorAll('[data-status="pending"]')).toHaveLength(4);
  });

  it("Espacio empieza la partida", async () => {
    renderWithIntl(<RankedTest language="en" />);
    fireEvent.keyDown(screen.getByTestId("typing-input"), { key: " ", code: "Space" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledOnce();
  });

  it("si el servidor no está disponible, lo dice y ofrece la práctica", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(503, "unavailable"));
    renderWithIntl(<RankedTest language="es" />);
    fireEvent.click(screen.getByTestId("ranked-start"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/isn't available right now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to practice" })).toBeInTheDocument();
    expect(screen.getByTestId("ranked-start")).toBeInTheDocument();
  });

  it("si otra partida la cerró, lo explica y enseña el resultado local", async () => {
    vi.mocked(finishGame).mockRejectedValue(new GameApiError(409, "closed"));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("You started another game");
    expect(screen.getByTestId("result")).toBeInTheDocument();
  });

  it("Tab a mitad de partida empieza otra nueva", async () => {
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    fireEvent.keyDown(screen.getByTestId("typing-input"), { key: "Tab", code: "Tab" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `pnpm test src/components/ranked`
Expected: FAIL. No se pueden resolver `./api`, `./batch-sender` ni `./ranked-test`.

- [ ] **Step 3: Mensajes**

Sustituye los tres archivos completos. Se añade `Ranked` y cambia `Home.intro`, que ya no dice que el tiempo empieza con la primera pulsación.

`messages/en.json`:

```json
{
  "Metadata": {
    "title": "QwertyRank — Typing speed test",
    "description": "How fast do you type? Take a 30-second typing test and compare your words per minute."
  },
  "Nav": {
    "home": "Ranked",
    "practice": "Practice"
  },
  "LocaleSwitcher": {
    "label": "Language"
  },
  "Home": {
    "title": "How fast do you type?",
    "intro": "Press Start: after a 3-second countdown the text appears and you have 30 seconds to type as fast and accurately as you can."
  },
  "Practice": {
    "title": "Practice",
    "intro": "15-second tests with no ranking. Start typing to begin and press Tab to restart."
  },
  "TypingTest": {
    "label": "Typing test",
    "inputLabel": "Type the words shown",
    "focusPrompt": "Click here or tap to start typing",
    "restartHint": "Tab to restart"
  },
  "Result": {
    "wpm": "wpm",
    "accuracy": "accuracy",
    "raw": "raw wpm",
    "chartLabel": "Words per minute, second by second",
    "mistakesTitle": "Most missed keys",
    "noMistakes": "No mistakes. Impressive!",
    "restart": "Next test",
    "restartHint": "or press Tab / Enter"
  },
  "Ranked": {
    "start": "Start",
    "startHint": "or press Space / Enter",
    "rules": "30 seconds. The text appears after a 3-second countdown and the clock can't be paused.",
    "submitting": "Checking your game…",
    "unavailable": "Ranked isn't available right now. You can keep practising in the meantime.",
    "practiceLink": "Go to practice",
    "verdictValid": "Valid game",
    "verdictConnection": "Connection problem: this game doesn't count.",
    "verdictUnrecognized": "Unrecognized activity: this game doesn't count.",
    "verdictLetterByLetter": "In Ranked you have to type letter by letter: this game doesn't count.",
    "replaced": "You started another game, so this one was closed."
  }
}
```

`messages/es.json`:

```json
{
  "Metadata": {
    "title": "QwertyRank — Test de velocidad de escritura",
    "description": "¿A qué velocidad escribes? Haz un test de mecanografía de 30 segundos y compara tus palabras por minuto."
  },
  "Nav": {
    "home": "Ranked",
    "practice": "Práctica"
  },
  "LocaleSwitcher": {
    "label": "Idioma"
  },
  "Home": {
    "title": "¿A qué velocidad escribes?",
    "intro": "Pulsa Empezar: tras una cuenta atrás de 3 segundos aparece el texto y tienes 30 segundos para escribir lo más rápido y preciso que puedas."
  },
  "Practice": {
    "title": "Práctica",
    "intro": "Tests de 15 segundos sin ranking. Empieza a escribir para comenzar y pulsa Tab para reiniciar."
  },
  "TypingTest": {
    "label": "Test de escritura",
    "inputLabel": "Escribe las palabras que aparecen",
    "focusPrompt": "Haz clic aquí o toca para empezar a escribir",
    "restartHint": "Tab para reiniciar"
  },
  "Result": {
    "wpm": "ppm",
    "accuracy": "precisión",
    "raw": "ppm brutas",
    "chartLabel": "Palabras por minuto, segundo a segundo",
    "mistakesTitle": "Teclas más falladas",
    "noMistakes": "Sin errores. ¡Impresionante!",
    "restart": "Siguiente test",
    "restartHint": "o pulsa Tab / Enter"
  },
  "Ranked": {
    "start": "Empezar",
    "startHint": "o pulsa Espacio / Enter",
    "rules": "30 segundos. El texto aparece tras una cuenta atrás de 3 segundos y el reloj no se puede parar.",
    "submitting": "Comprobando tu partida…",
    "unavailable": "Ranked no está disponible ahora mismo. Mientras tanto puedes seguir practicando.",
    "practiceLink": "Ir a la práctica",
    "verdictValid": "Partida válida",
    "verdictConnection": "Problema de conexión: esta partida no cuenta.",
    "verdictUnrecognized": "Actividad no reconocida: esta partida no cuenta.",
    "verdictLetterByLetter": "En Ranked hay que teclear letra a letra: esta partida no cuenta.",
    "replaced": "Has empezado otra partida, así que esta se ha cerrado."
  }
}
```

`messages/pt.json`:

```json
{
  "Metadata": {
    "title": "QwertyRank — Teste de velocidade de digitação",
    "description": "Qual é a sua velocidade de digitação? Faça um teste de 30 segundos e compare suas palavras por minuto."
  },
  "Nav": {
    "home": "Ranked",
    "practice": "Prática"
  },
  "LocaleSwitcher": {
    "label": "Idioma"
  },
  "Home": {
    "title": "Qual é a sua velocidade de digitação?",
    "intro": "Pressione Começar: depois de uma contagem regressiva de 3 segundos o texto aparece e você tem 30 segundos para digitar o mais rápido e com a maior precisão possível."
  },
  "Practice": {
    "title": "Prática",
    "intro": "Testes de 15 segundos sem ranking. Comece a digitar para iniciar e pressione Tab para reiniciar."
  },
  "TypingTest": {
    "label": "Teste de digitação",
    "inputLabel": "Digite as palavras exibidas",
    "focusPrompt": "Clique aqui ou toque para começar a digitar",
    "restartHint": "Tab para reiniciar"
  },
  "Result": {
    "wpm": "ppm",
    "accuracy": "precisão",
    "raw": "ppm bruto",
    "chartLabel": "Palavras por minuto, segundo a segundo",
    "mistakesTitle": "Teclas mais erradas",
    "noMistakes": "Nenhum erro. Impressionante!",
    "restart": "Próximo teste",
    "restartHint": "ou pressione Tab / Enter"
  },
  "Ranked": {
    "start": "Começar",
    "startHint": "ou pressione Espaço / Enter",
    "rules": "30 segundos. O texto aparece depois de uma contagem regressiva de 3 segundos e o relógio não pode ser pausado.",
    "submitting": "Verificando sua partida…",
    "unavailable": "O Ranked não está disponível agora. Enquanto isso, você pode continuar praticando.",
    "practiceLink": "Ir para a prática",
    "verdictValid": "Partida válida",
    "verdictConnection": "Problema de conexão: esta partida não conta.",
    "verdictUnrecognized": "Atividade não reconhecida: esta partida não conta.",
    "verdictLetterByLetter": "No Ranked é preciso digitar letra por letra: esta partida não conta.",
    "replaced": "Você começou outra partida, então esta foi encerrada."
  }
}
```

- [ ] **Step 4: Implementar**

`src/components/ranked/api.ts`:

```ts
import type { FinishRequest, FinishResponse, KeysRequest, StartRequest, StartResponse } from "@/lib/game/types";

/** Error HTTP de la API de partidas, con el código que devuelve el servidor (`busy`, `closed`…). */
export class GameApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new GameApiError(response.status, data.error ?? "unknown");
  }
  return (await response.json()) as T;
}

export function startGame(body: StartRequest): Promise<StartResponse> {
  return post("/api/game/start", body);
}

export async function sendKeys(gameId: string, body: KeysRequest): Promise<void> {
  await post(`/api/game/${gameId}/keys`, body);
}

/** Se reintentan los fallos de red, los 5xx y el `busy` de un final que ya se está procesando. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof GameApiError)) return true;
  return error.status >= 500 || error.code === "busy";
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function finishGame(
  gameId: string,
  body: FinishRequest,
  { attempts = 5, delayMs = 400 } = {},
): Promise<FinishResponse> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await post<FinishResponse>(`/api/game/${gameId}/finish`, body);
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      await wait(delayMs);
    }
  }
}
```

`src/components/ranked/batch-sender.ts`:

```ts
import type { TypingEvent } from "@/lib/scoring/types";
import { isRetryable } from "./api";

export interface BatchSender {
  start(): void;
  /** Envía lo pendiente y espera a que lleguen todas las tandas. */
  flush(): Promise<{ lastSeq: number; delivered: boolean }>;
  stop(): void;
}

interface Options {
  getEvents: () => readonly TypingEvent[];
  send: (seq: number, events: TypingEvent[]) => Promise<void>;
  intervalMs?: number;
  retryDelaysMs?: readonly number[];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envía las pulsaciones al servidor cada ~3 s, en orden y una tanda detrás de otra (spec §3.4).
 * Si una tanda no llega tras los reintentos, las siguientes ya no se envían: el servidor
 * marcará la partida como incompleta.
 */
export function createBatchSender({
  getEvents,
  send,
  intervalMs = 3_000,
  retryDelaysMs = [250, 500, 1_000, 2_000],
}: Options): BatchSender {
  let sentEvents = 0;
  let seq = 0;
  let failed = false;
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function deliver(batchSeq: number, events: TypingEvent[]) {
    for (let attempt = 0; ; attempt++) {
      try {
        await send(batchSeq, events);
        return;
      } catch (error) {
        if (attempt >= retryDelaysMs.length || !isRetryable(error)) {
          failed = true;
          return;
        }
        await wait(retryDelaysMs[attempt]);
      }
    }
  }

  function enqueue() {
    const pending = getEvents().slice(sentEvents);
    if (pending.length === 0) return;
    sentEvents += pending.length;
    const batchSeq = ++seq;
    chain = chain.then(() => (failed ? undefined : deliver(batchSeq, pending)));
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  return {
    start() {
      stop();
      timer = setInterval(enqueue, intervalMs);
    },
    async flush() {
      stop();
      enqueue();
      await chain;
      return { lastSeq: seq, delivered: !failed };
    },
    stop,
  };
}
```

`src/components/ranked/client-env.ts`:

```ts
import type { ClientEnv } from "@/lib/game/types";

/** Señales del dispositivo que se envían al empezar. El servidor decide con la forma de las pulsaciones. */
export function readClientEnv(): ClientEnv {
  return {
    coarse: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    touchPoints: navigator.maxTouchPoints ?? 0,
  };
}
```

`src/components/ranked/ranked-test.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { FinishResponse, RejectReason } from "@/lib/game/types";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import type { TestResult } from "@/lib/scoring/replay";
import type { TestLanguage } from "@/lib/words/languages";
import { ResultView } from "../typing-test/result-view";
import { Timer } from "../typing-test/timer";
import { useTypingInput } from "../typing-test/use-typing-input";
import { useTypingSession } from "../typing-test/use-typing-session";
import { WordsView } from "../typing-test/words-view";
import { GameApiError, finishGame, sendKeys, startGame } from "./api";
import { createBatchSender, type BatchSender } from "./batch-sender";
import { readClientEnv } from "./client-env";

type Phase =
  | { name: "ready" }
  | { name: "starting" }
  | { name: "countdown"; endsAt: number; durationMs: number }
  | { name: "playing" }
  | { name: "submitting" }
  | { name: "result"; response: FinishResponse }
  | { name: "unavailable" }
  | { name: "unscored"; reason: "replaced" | "connection"; local: TestResult };

/** Momento (escala de `performance.now()`) en que termina un intervalo que empieza ahora. */
function endsIn(ms: number): number {
  return performance.now() + ms;
}

type VerdictMessage = "verdictConnection" | "verdictUnrecognized" | "verdictLetterByLetter";

const REASON_MESSAGE: Record<RejectReason, VerdictMessage> = {
  late: "verdictConnection",
  incomplete: "verdictConnection",
  early_input: "verdictUnrecognized",
  fabricated_timing: "verdictUnrecognized",
  untrusted: "verdictUnrecognized",
  injected_input: "verdictUnrecognized",
  inhuman_burst: "verdictUnrecognized",
  inhuman_speed: "verdictUnrecognized",
  multi_insert: "verdictLetterByLetter",
};

/**
 * Partida Ranked (spec §3.4): Empezar → el servidor envía el texto → cuenta atrás 3-2-1 con
 * el texto oculto → 30 s que no se pueden parar → las pulsaciones se envían cada ~3 s →
 * el servidor puntúa y da el veredicto.
 */
export function RankedTest({ language }: { language: TestLanguage }) {
  const t = useTranslations("Ranked");
  const tt = useTranslations("TypingTest");
  const [phase, setPhase] = useState<Phase>({ name: "ready" });

  // Cada partida empezada tiene un número; las respuestas de partidas anteriores se ignoran.
  const attemptRef = useRef(0);
  const gameIdRef = useRef<string | null>(null);
  const senderRef = useRef<BatchSender | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopCurrent() {
    if (countdownRef.current !== null) clearTimeout(countdownRef.current);
    countdownRef.current = null;
    senderRef.current?.stop();
    senderRef.current = null;
    gameIdRef.current = null;
  }

  useEffect(() => stopCurrent, []);

  async function submit(local: TestResult) {
    const attempt = attemptRef.current;
    const gameId = gameIdRef.current;
    const sender = senderRef.current;
    if (!gameId || !sender) return;
    setPhase({ name: "submitting" });
    const { lastSeq } = await sender.flush();
    try {
      const response = await finishGame(gameId, { lastSeq });
      if (attempt === attemptRef.current) setPhase({ name: "result", response });
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      const replaced = error instanceof GameApiError && error.code === "closed";
      setPhase({ name: "unscored", reason: replaced ? "replaced" : "connection", local });
    }
  }

  const session = useTypingSession({
    initialWords: [],
    durationMs: OFFICIAL_DURATION_MS,
    nextWords: () => [],
    autoStart: false,
    onFinish: (local) => void submit(local),
  });

  async function start() {
    const attempt = ++attemptRef.current;
    stopCurrent();
    setPhase({ name: "starting" });
    typing.reset();
    try {
      const game = await startGame({ language, env: readClientEnv() });
      if (attempt !== attemptRef.current) return;
      gameIdRef.current = game.gameId;
      session.load(game.words);
      setPhase({ name: "countdown", endsAt: endsIn(game.countdownMs), durationMs: game.countdownMs });
      countdownRef.current = setTimeout(() => {
        if (attempt !== attemptRef.current) return;
        session.begin();
        const sender = createBatchSender({
          getEvents: session.getEvents,
          send: (seq, events) => sendKeys(game.gameId, { seq, events }),
        });
        senderRef.current = sender;
        sender.start();
        setPhase({ name: "playing" });
      }, game.countdownMs);
    } catch {
      if (attempt === attemptRef.current) setPhase({ name: "unavailable" });
    }
  }

  const waiting = phase.name === "ready" || phase.name === "unavailable";
  const done = phase.name === "result" || phase.name === "unscored";

  const typing = useTypingInput({
    target: session,
    onRestart: () => void start(),
    onEnter: () => {
      if (waiting || done) void start();
    },
    onSpace: () => {
      if (!waiting) return false;
      void start();
      return true;
    },
  });

  let status: { text: string; tone: "neutral" | "good" | "bad" } = { text: "", tone: "neutral" };
  if (phase.name === "countdown" || phase.name === "playing") status = { text: tt("restartHint"), tone: "neutral" };
  if (phase.name === "result") {
    status = phase.response.reason
      ? { text: t(REASON_MESSAGE[phase.response.reason]), tone: "bad" }
      : { text: t("verdictValid"), tone: "good" };
  }
  if (phase.name === "unscored") {
    status = { text: t(phase.reason === "replaced" ? "replaced" : "verdictConnection"), tone: "bad" };
  }
  const toneClass = {
    neutral: "text-zinc-500 dark:text-zinc-400",
    good: "font-medium text-emerald-700 dark:text-emerald-400",
    bad: "font-medium text-red-700 dark:text-red-400",
  }[status.tone];

  return (
    <section
      aria-label={tt("label")}
      data-testid="typing-area"
      className="relative flex flex-col gap-4"
      onClick={typing.focus}
    >
      <div className="flex h-10 items-center justify-between gap-4">
        <Timer endsAt={session.endsAt} durationMs={OFFICIAL_DURATION_MS} />
        <span data-testid="ranked-status" role="status" className={`line-clamp-2 text-right text-sm ${toneClass}`}>
          {status.text}
        </span>
      </div>

      {/* Altura reservada para el resultado: al terminar, el contenido de debajo no salta (CLS = 0). */}
      <div className="min-h-[28rem]">
        {waiting || phase.name === "starting" ? (
          <div className="flex min-h-30 flex-col items-center justify-center gap-3 text-center">
            {phase.name === "unavailable" && (
              <p className="max-w-md">
                {t("unavailable")}{" "}
                <Link href="/practice" className="font-medium underline">
                  {t("practiceLink")}
                </Link>
              </p>
            )}
            <button
              type="button"
              data-testid="ranked-start"
              onClick={() => void start()}
              disabled={phase.name === "starting"}
              className="rounded-md bg-amber-500 px-6 py-3 text-lg font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {t("start")}
            </button>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("startHint")}</p>
            <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">{t("rules")}</p>
          </div>
        ) : phase.name === "countdown" ? (
          <div className="flex h-30 items-center justify-center">
            <Timer
              endsAt={phase.endsAt}
              durationMs={phase.durationMs}
              testId="countdown"
              className="font-mono text-6xl font-semibold tabular-nums text-amber-600 dark:text-amber-400"
            />
          </div>
        ) : phase.name === "playing" || phase.name === "submitting" ? (
          <div className="relative">
            <div className={typing.focused && phase.name === "playing" ? "" : "opacity-40 blur-[2px]"}>
              <WordsView engine={session.engine} />
            </div>
            {phase.name === "submitting" ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-medium">
                {t("submitting")}
              </p>
            ) : (
              !typing.focused && (
                <p
                  data-testid="focus-prompt"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center text-center font-medium"
                >
                  {tt("focusPrompt")}
                </p>
              )
            )}
          </div>
        ) : (
          <ResultView result={phase.name === "result" ? phase.response : phase.local} onRestart={() => void start()} />
        )}
      </div>

      <input data-testid="typing-input" aria-label={tt("inputLabel")} {...typing.inputProps} />
    </section>
  );
}
```

`src/app/[locale]/page.tsx` (sustituye el archivo completo; la portada ya no lleva palabras en el HTML):

```tsx
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { RankedTest } from "@/components/ranked/ranked-test";
import { routing } from "@/i18n/routing";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Home");

  // El texto de Ranked no va en la página: lo envía el servidor al pulsar Empezar (spec §3.4).
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <RankedTest language={locale} />
      <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
    </>
  );
}
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `pnpm test src/components/ranked src/i18n`
Expected: PASS, 28 tests (4 api + 6 envío + 10 Ranked + 8 mensajes).

- [ ] **Step 6: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: sin errores; 146 tests unitarios; `● /en`, `● /es` y `● /pt` siguen siendo SSG.

Comprobación manual con `docker compose up -d`, `pnpm dev` y `http://localhost:3000/es`:
1. Se ve Empezar y ninguna palabra.
2. Al pulsar aparece la cuenta atrás 3-2-1, y después el texto.
3. Escribes durante 30 s, aparece "Comprobando tu partida…" y luego el resultado con "Partida válida".

---

### Task 8: E2E, README y verificación final

**Files:**
- Modify: `playwright.config.ts`, `e2e/i18n.spec.ts`, `README.md`
- Create: `e2e/ranked.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `pnpm test:e2e` con 14 escenarios en escritorio y Pixel 7: 28 ejecuciones, de las que 26 pasan y 2 se omiten (las específicas de escritorio o de móvil).

- [ ] **Step 1: Las migraciones se aplican antes de arrancar el servidor de los E2E**

En `playwright.config.ts`, cambia el `command` del `webServer`:

```ts
    command: `pnpm db:migrate && pnpm build && pnpm start --port ${PORT}`,
```

- [ ] **Step 2: Ajustar el E2E del texto inicial**

La portada ya no lleva palabras, porque las de Ranked las manda el servidor; el texto inicial lo sigue llevando la práctica. Sustituye `e2e/i18n.spec.ts` completo:

```ts
import { expect, test } from "@playwright/test";

test.describe("navegador en español", () => {
  test.use({ locale: "es-ES" });

  test("/ redirige a /es", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿A qué velocidad escribes?");
    await expect(page.getByTestId("timer")).toHaveText("30");
  });
});

test.describe("navegador en portugués", () => {
  test.use({ locale: "pt-BR" });

  test("/ redirige a /pt", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/pt$/);
  });
});

test("la práctica tiene ruta traducida en cada idioma", async ({ page }) => {
  await page.goto("/es/practica");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Práctica");
  await page.goto("/pt/pratica");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prática");
});

test("cambiar de idioma conserva la página", async ({ page }) => {
  await page.goto("/en/practice");
  await page.getByRole("link", { name: "es", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/practica$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Práctica");
});

test("el texto inicial de la práctica está en el idioma de la página", async ({ page }) => {
  await page.goto("/es/practica");
  const words = await page.getByTestId("word").evaluateAll((els) => els.map((el) => el.getAttribute("data-word")));
  expect(words).toHaveLength(160);
  expect(words.some((word) => /[áéíóúñ]/.test(word ?? ""))).toBe(true);
});

test("el idioma elegido se recuerda aunque se cierre el navegador", async ({ page, context }) => {
  await page.goto("/en/practice");
  await page.getByRole("link", { name: "es", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/practica$/);
  const cookie = (await context.cookies()).find((c) => c.name === "NEXT_LOCALE");
  expect(cookie?.value).toBe("es");
  // Una cookie de sesión tiene expires = -1: se perdería al cerrar el navegador.
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);
});
```

- [ ] **Step 3: E2E de Ranked**

`e2e/ranked.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function startRanked(page: Page) {
  await page.goto("/en");
  await page.getByTestId("ranked-start").click();
  await expect(page.getByTestId("countdown")).toBeVisible();
  await expect(page.getByTestId("word").first()).toBeVisible({ timeout: 5_000 });
  return page
    .getByTestId("word")
    .evaluateAll((elements) => elements.slice(0, 6).map((el) => el.getAttribute("data-word") ?? ""));
}

test("el texto de Ranked no viene en el HTML: lo envía el servidor al empezar", async ({ page }) => {
  const html = await (await page.request.get("/en")).text();
  expect(html).not.toContain('data-testid="word"');
  await page.goto("/en");
  await expect(page.getByTestId("ranked-start")).toBeVisible();
  await expect(page.getByTestId("word")).toHaveCount(0);
});

test("partida Ranked completa: cuenta atrás, 30 s y veredicto válido del servidor", async ({ page }) => {
  const words = await startRanked(page);
  await page.keyboard.type(`${words.join(" ")} `, { delay: 120 });
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("ranked-status")).toHaveText("Valid game");
  expect(Number(await page.getByTestId("result-wpm").textContent())).toBeGreaterThan(0);
});

test("texto inyectado por código: la partida no es válida", async ({ page }) => {
  const words = await startRanked(page);
  await page.evaluate((text) => {
    const input = document.querySelector<HTMLInputElement>('[data-testid="typing-input"]')!;
    for (const char of text) {
      input.value += char;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
    }
  }, `${words.join(" ")} `);
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("ranked-status")).toHaveText(/Unrecognized activity/);
});
```

- [ ] **Step 4: Ejecutar los E2E**

Requiere `docker compose up -d` y `.env.local`.

Run: `pnpm test:e2e`
Expected: 26 passed y 2 skipped. Las partidas Ranked tardan ~34 s cada una.

Comprueba en la base de datos que se guardaron:

```bash
docker compose exec -T postgres psql -U qwertyrank -d qwertyrank -c "select input_type, verdict, reject_reason, ip_hash is not null as ip_hashed from games order by created_at desc limit 4;"
```

Expected: partidas `valid` y `rejected` (`untrusted`), con `ip_hashed = t`.

- [ ] **Step 5: README**

Sustituye `README.md` completo:

~~~markdown
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

## Documentación

- Diseño: `docs/superpowers/specs/2026-10-04-qwertyrank-design.md`
- Planes de cada fase: `docs/superpowers/plans/`
~~~

- [ ] **Step 6: Verificación final**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm build && pnpm test:e2e`
Expected: todo en verde; 146 unitarios, 25 de integración, y 26 E2E en verde más 2 omitidos.

**Presupuesto de JavaScript** (spec §7.5), tras el build:

```bash
python3 - <<'EOF'
import json, gzip
stats = json.load(open(".next/diagnostics/route-bundle-stats.json"))
routes = {r["route"]: set(r["firstLoadChunkPaths"]) for r in stats}
base = routes["/_not-found"]
gz = lambda paths: sum(len(gzip.compress(open(p, "rb").read(), 9)) for p in paths)
for route in ["/[locale]", "/[locale]/practice"]:
    print(route, f"{gz(routes[route] - base) / 1024:.1f} KB gzip propios")
EOF
```

Expected: ambas rutas ≤ 30 KB (al escribir el plan: `/[locale]` 27,1 KB y `/[locale]/practice` 25,6 KB). Si se pasa, para y avisa al usuario: es una decisión de spec.

- [ ] **Step 7: Comprobación con Neon y Upstash reales (cuando el usuario tenga las cuentas)**

Si el usuario aún no ha creado las cuentas, **sáltalo y déjalo anotado como pendiente**. Con las credenciales reales en `.env.local`:
- `DATABASE_URL`: URL del pooler de Neon.
- `DATABASE_URL_UNPOOLED`: URL directa de Neon.
- `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`: los de la base de datos de Upstash.

1. **Migración:** `pnpm db:migrate` → `migrations applied successfully!`.
2. **`TIME` en Lua en el Upstash real:**

   ```bash
   set -a; source .env.local; set +a
   curl -s -X POST "$UPSTASH_REDIS_REST_URL" -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" -H "Content-Type: application/json" -d '["EVAL","local t = redis.call(\"TIME\"); return {t[1], t[2]}","0"]'
   ```

   Expected: `{"result":["<segundos>","<microsegundos>"]}`.
3. **Partida completa contra los servicios reales:** `pnpm dev`, juega una partida en `/es` y comprueba que sale "Partida válida".

Si algo de esto falla, **para**: es el Review Focus 1–2 y hay que decidir con el usuario.

- [ ] **Step 8: Prueba en dispositivos reales (manual, la hace el usuario)**

Con el despliegue de Vercel, o con `pnpm dev --hostname 0.0.0.0` y los servicios levantados, juega Ranked en:
1. **Android** con Gboard y con el teclado de Samsung.
2. **iPhone** con Safari.

En cada partida anota qué dice el veredicto y, con la consulta del Step 4, el `input_type` y el `reject_reason`. Son los datos para calibrar el límite de inserciones múltiples en táctil y la clasificación físico/táctil (Review Focus 5).

- [ ] **Step 9: Checkpoint final (sin commit)**

Informa al usuario del resultado de cada comando, del presupuesto de JavaScript y de lo que quede pendiente de los Steps 7 y 8. No hagas commit: lo pedirá el usuario.
