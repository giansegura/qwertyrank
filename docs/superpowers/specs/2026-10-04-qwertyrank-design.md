# QwertyRank — Diseño v1

- **Fecha:** 2026-10-04
- **Estado:** borrador para revisión
- **Dominio previsto:** `qwertyrank.com` (libre a 2026-10-04; pendiente de compra)

---

## 1. Resumen

QwertyRank es una web para medir y comparar la velocidad de escritura. Su núcleo son los **rankings competitivos** por idioma, tipo de teclado (físico/táctil) y periodo, protegidos por un **anti-trampas en servidor**.

**Objetivo:** producto para crecer (tráfico orgánico, viralidad). La monetización (anuncios, premium) queda fuera de la v1.

### Criterios de éxito de la v1

1. El test con ranking funciona en inglés, español y portugués, en ordenador y en móvil.
2. Ninguna puntuación entra en un top 10 público sin pasar la verificación (§4.6).
3. Falsos positivos del anti-trampas < 1 % sobre el conjunto de partidas humanas grabadas en la beta.
4. Core Web Vitals en p75: LCP < 1,5 s, INP < 50 ms al teclear, CLS = 0.
5. Todas las páginas indexables tienen title/description propios, canonical y `hreflang` en/es/pt + `x-default`.

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Producto | Solo mecanografía |
| Nombre | QwertyRank |
| Idiomas | Inglés, español y portugués (interfaz + test, cada idioma de test con ranking propio) |
| Modo oficial | 30 s, con ranking |
| Modo práctica | 15 s, sin ranking, inicio instantáneo, no se guarda en servidor |
| Categorías | Teclado físico / teclado táctil, decidido por el servidor en cada partida |
| Periodos visibles | Hoy · Semana · Mes · Siempre. "Año" se guarda desde el día 1 y su pestaña se activa el 1 de enero siguiente al lanzamiento |
| Reinicio de periodos | Medianoche UTC; semanas ISO |
| Cuentas | Jugar sin cuenta; cuenta necesaria para entrar en el ranking (Google, Apple, passkey, enlace por email) |
| Stack | Next.js 16 (App Router) + PostgreSQL (Neon) + Redis (Upstash) + Better Auth + Drizzle + Cloudflare Turnstile |
| Alojamiento | Vercel Hobby al lanzar; Pro al monetizar o al alcanzar ~60–70 % de cualquier límite |
| Borrado de cuenta | Se elimina de todos los rankings (también los pasados; los demás suben) y sus partidas se anonimizan |

---

## 3. Producto y experiencia

### 3.1 Alcance de la v1

- Test oficial de 30 s y práctica de 15 s en en/es/pt.
- Pantalla de ranking única con filtros: idioma, teclado y periodo.
- Cuentas, nick, país opcional y perfil público (récords personales e historial).
- Reclamar una partida anónima tras iniciar sesión.
- Compartir resultado con imagen generada (solo partidas validadas).
- Verificación de récords altos, moderación y panel de administración.
- 4–5 guías por idioma.

### 3.2 Texto del test

- Palabras aleatorias de la lista de **~1.000 palabras más comunes** del idioma, curada a mano y sin palabras ofensivas.
- Minúsculas y sin signos de puntuación. **Con tildes, ñ y ç**, porque forman parte del idioma y cada idioma tiene su propio ranking.
- El modo oficial recibe **~160 palabras**, suficientes para el techo de PPM de cualquier categoría (§4.3).
- El idioma del test es por defecto el de la página y se puede cambiar. **El ranking siempre sigue al idioma del test.**

### 3.3 Puntuación y reglas del ranking

- **PPM** = (caracteres correctos ÷ 5) ÷ minutos. También se calculan PPM brutas (todos los caracteres) y **precisión** (pulsaciones correctas ÷ pulsaciones totales).
- Para entrar en el ranking hace falta una **precisión ≥ 90 %**.
- En cada combinación de idioma, teclado y periodo cuenta **solo la mejor partida** de cada usuario.
- Desempate: mayor precisión y, después, quien llegó antes.

### 3.4 Recorrido del modo oficial (30 s)

1. El usuario pulsa **Empezar** (clic, Espacio o Enter).
2. El servidor crea la partida y devuelve el texto completo. La **hora oficial de inicio** es la hora de envío + 3 s.
3. **Cuenta atrás 3-2-1 con el texto oculto.** La entrada de teclado está bloqueada.
4. En el 0 aparece el texto y corren **30 s que no se pueden pausar**. Cambiar de pestaña o perder la conexión no detiene el reloj.
5. El navegador envía las pulsaciones al servidor **cada ~3 s**.
6. A los 30 s el servidor calcula el resultado y lo devuelve con veredicto y posiciones.
7. **Pantalla de resultado:** PPM, precisión, PPM brutas, gráfica segundo a segundo, teclas falladas y posición en cada periodo. Para anónimos: *"Entrarías el #N de hoy"* + botón **Guárdalo**.
8. **Tab** lanza otra partida directamente con su cuenta atrás. Empezar una partida nueva abandona la que estuviera activa.

### 3.5 Recorrido del modo práctica (15 s)

- El texto ya está visible y el tiempo empieza con la primera pulsación. No hay botón ni cuenta atrás.
- Se ejecuta íntegramente en el navegador, con la lista de palabras cargada en diferido. Muestra el mismo resultado, sin posiciones ni veredicto.
- Tab reinicia al instante.

### 3.6 Cuentas y perfil

- **Acceso:** Google, Apple, passkey y enlace por email (sin contraseñas). Se bloquean los dominios de email desechables.
- **Nick:**
  - 3–20 caracteres `[a-zA-Z0-9_]`, único sin distinguir mayúsculas.
  - Filtro de palabrotas en/es/pt.
  - Botón de denunciar en perfiles y rankings.
- **País:** opcional, ISO 3166-1 alfa-2, se muestra como bandera. En la v1 no se usa para rankings.
- **Perfil público** `/{locale}/u/{nick}`: récords personales por idioma y teclado, e historial de partidas con ranking.

### 3.7 Reclamar una partida anónima

- Las partidas anónimas se asocian a una cookie anónima firmada (`anon_id`).
- Si el usuario inicia sesión **en los 10 minutos siguientes**, la partida pasa a su cuenta y cuenta **para los periodos en que se jugó** (no para el momento de reclamarla).
- Pasados 10 minutos, la partida queda anónima para siempre y no entra en rankings.

### 3.8 Compartir

- Solo las partidas `válidas` tienen página de resultado `/{locale}/r/{gameId}` (`noindex`).
- La imagen OG se genera desde la base de datos (`next/og`). Nadie puede crear con nuestro dominio una imagen con una puntuación falsa.

---

## 4. Anti-trampas

### 4.1 Principio

**El servidor manda:** elige el texto, lleva el reloj y calcula la puntuación. Todo lo que envía el navegador es una declaración que hay que verificar. Los umbrales y reglas viven **solo en el servidor** (`import "server-only"`) y se ajustan con datos reales.

### 4.2 Ciclo de una partida

1. **`start`**
   - Exige un pase humano válido (§4.8) y respeta los límites de partidas.
   - Crea la partida en Redis con caducidad de 2 min: `words`, `issuedAt`, `startsAt = issuedAt + 3 s`, `deadline = startsAt + 30 s + 3 s`, propietario (`userId` o `anonId`).
   - Solo hay una partida activa por propietario; una nueva abandona la anterior.
2. **`keys`** (cada ~3 s)
   - Cada tanda lleva un número de secuencia `seq`; los duplicados se ignoran.
   - Un script Lua añade los eventos y anota la **hora de llegada con `TIME` de Redis**, que es el único reloj oficial.
3. **`finish`**
   - Se reproducen las pulsaciones sobre el texto con `lib/scoring` y se calculan PPM, PPM brutas y precisión. Cualquier puntuación enviada por el navegador se ignora.
   - Se ejecutan las reglas y señales y se emite el veredicto: `valid`, `review` o `rejected`.
   - Es idempotente: repetirlo devuelve el mismo resultado.

**Tiempos de los eventos.** Cada evento lleva `t` = milisegundos desde el 0 según el reloj del navegador (`performance.now()`). Reglas:

- `t < 0` → partida rechazada (pulsaciones durante la cuenta atrás).
- `t > 30000` → el evento se descarta.
- `t` no puede superar el tiempo transcurrido entre `startsAt` y la llegada de su tanda (+250 ms de tolerancia). Si lo supera → partida rechazada (registro fabricado).
- `finish` posterior a `deadline` → partida sin ranking.

### 4.3 Reglas que rechazan la partida (valores iniciales, configurables)

| Regla | Valor inicial |
|---|---|
| Violación de tiempos (§4.2) | — |
| Ráfaga inhumana: mediana de intervalos entre `keydown` en cualquier ventana de 20 pulsaciones | < 25 ms |
| PPM por encima del techo de la categoría | 320 (físico) / 220 (táctil) |
| Texto insertado sin pulsaciones correspondientes (pegado/inyección) | Cualquier caso |
| Eventos con `isTrusted = false` | Cualquier caso |

El usuario ve *"Partida no válida"* con un motivo genérico (p. ej. *"problema de conexión"* o *"actividad no reconocida"*).

### 4.4 Señales de sospecha → puntuación de riesgo

Cada señal suma a una puntuación de riesgo de 0 a 100:

- **Ritmo:** variación de los intervalos entre teclas; velocidad en pares de letras frecuentes frente a raros (según el idioma); tipo de errores (tecla adyacente, letras invertidas, frenada tras fallar); duración de cada pulsación (teclado físico).
- **Historial:** subida brusca respecto a la media móvil del usuario.
- **Contexto:** antigüedad de la cuenta, IP de centro de datos (lista de ASN), varias cuentas desde el mismo navegador.

El veredicto se decide en este orden:

1. Alguna regla de §4.3 → `rejected`.
2. Riesgo alto (valor inicial ≥ 80) → `valid`, el usuario pasa a shadow-ban (§4.7) y el caso entra en la cola del panel.
3. Entraría en algún top 10 → `review` (§4.6).
4. Resto → `valid`.

Los umbrales de riesgo se calibran con el conjunto de datos de la beta (§9).

### 4.5 Clasificación del tipo de teclado

Se decide en el servidor para cada partida:

- **Señales del navegador** (como declaración): `pointer: coarse`, `maxTouchPoints`, cambios de `visualViewport`.
- **Firma de los eventos** (la señal decisiva):
  - En teclado táctil abundan `key: "Unidentified"` / `keyCode 229`, eventos `beforeinput`/`input`/composition, y una duración de pulsación casi nula.
  - Un teclado físico produce `keydown`/`keyup` con duraciones de pulsación reales.
- Si declara táctil pero la firma es de teclado físico → la partida va al ranking **físico**.

### 4.6 Verificación de récords

- Si una partida entraría en el **top 10** de cualquier ranking, queda en `review` y solo la ve su autor.
- El autor tiene **24 h** para completar **2 partidas de verificación**. En ellas el texto se dibuja en un `canvas` (no está en el DOM como texto) y hay que alcanzar al menos el **85 % de las PPM** del récord.
- **Si las supera,** el récord entra en el ranking con la fecha original.
- **Si no las supera o no las completa,** la partida se queda fuera del ranking.

### 4.7 Sanciones y moderación

- **Shadow-ban:** el usuario sigue viendo sus puntuaciones y una posición calculada "como si estuviera"; nadie más las ve.
- **Ban:** la cuenta no puede jugar con ranking.
- **Panel `/admin`** (rol `admin`, `noindex`): cola de récords en revisión, denuncias, partidas de riesgo alto, aplicar o retirar sanciones. Cada acción se registra en `moderation_actions`.

### 4.8 Barreras de entrada

- **Cloudflare Turnstile** (modo invisible/gestionado). Al superarlo se emite una cookie firmada de **pase humano válido 1 h**. `start` sin pase válido responde `needs_challenge`, y el cliente ejecuta Turnstile y reintenta.
- **Límites de partidas** (`@upstash/ratelimit`): **100 partidas con ranking por hora** por cuenta o `anon_id` y 150 por IP.
- Cuentas con emails desechables bloqueadas.

### 4.9 Límites asumidos

No se puede evitar un bot muy sofisticado que teclee en tiempo real imitando a una persona, ni que otra persona juegue con tu cuenta. El objetivo es que **la parte alta de cada ranking sea creíble**.

---

## 5. Rankings y datos

### 5.1 Dimensiones

- **Ranking** = idioma (`en|es|pt`) × teclado (`physical|touch`) × periodo (`day|week|month|year|all`).
- 24 combinaciones visibles al lanzar (3 idiomas × 2 teclados × 4 periodos, con el año oculto); 30 a partir del 1 de enero siguiente al lanzamiento.
- Una sola pantalla con filtros. Por defecto se abre en el idioma del usuario, el teclado detectado y "Hoy", con cuenta atrás hasta el cierre del periodo.

### 5.2 Modelo de datos (PostgreSQL, fuente de verdad)

| Tabla | Campos principales |
|---|---|
| `users` | `id`, `nick` (único, `citext`), `country` (nullable), `role` (`user`/`admin`), `status` (`active`/`shadowbanned`/`banned`), `created_at` |
| tablas de Better Auth | cuentas, sesiones, passkeys, verificaciones |
| `games` | `id`, `user_id` (nullable), `anon_id`, `language`, `input_type`, `wpm`, `raw_wpm`, `accuracy`, `verdict`, `risk_score`, `ip_hash`, `starts_at`, `finished_at`, `claimed_at` |
| `keystroke_logs` | `game_id`, `events` (comprimidos), `created_at` |
| `period_bests` | `user_id`, `language`, `input_type`, `period_type`, `period_key`, `game_id`, `wpm`, `accuracy`, `achieved_at`. Clave única: (`user_id`, `language`, `input_type`, `period_type`, `period_key`) |
| `verifications` | `game_id`, `user_id`, `status`, `attempts`, `expires_at` |
| `reports` | `reporter_id`, `target_user_id`, `reason`, `status` |
| `moderation_actions` | `admin_id`, `target_user_id`, `action`, `reason`, `created_at` |
| `banned_identities` | `email_hash`, `provider_account_hash`, `created_at` |

### 5.3 Claves de periodo (UTC)

| Periodo | Clave |
|---|---|
| Día | `2026-10-04` |
| Semana ISO | `2026-W40` (atención: el 2026-12-31 pertenece a `2026-W53`) |
| Mes | `2026-10` |
| Año | `2026` |
| Siempre | `all` |

### 5.4 Redis

**Rankings:** una lista ordenada por combinación, `lb:{lang}:{input}:{period}:{key}` (p. ej. `lb:es:physical:week:2026-W40`). El miembro es `user_id`.

**Puntuación compuesta** (entero exacto < 2^53):

```
score = wpm_centi × 2^34 + accuracy_permille × 2^24 + (2^24 − 1 − minutes_since_2026_01_01)
```

- `wpm_centi` = PPM × 100 (≤ 40.000).
- `accuracy_permille` = precisión × 1000.
- Al restar los minutos, a igualdad de PPM y precisión gana quien llegó antes (hay margen para ~31 años).

**Partidas activas:** `game:{id}` (hash) y `game:{id}:events` (lista con hora de llegada), con caducidad de 2 min.

**Caducidad de los rankings:** los de día caducan a los 8 días y los de semana a las 6 semanas. Los de mes, año y siempre no caducan. El histórico completo está en `period_bests`.

**Reconstrucción:** un script de administración regenera todos los rankings desde `period_bests`.

### 5.5 Escritura (partida `valid`)

1. En una transacción de Postgres se inserta `games` (y `keystroke_logs`). Si la partida tiene usuario y precisión ≥ 90 %, para cada uno de los 5 periodos se hace un upsert en `period_bests` **solo si mejora**.
2. Para cada periodo mejorado se ejecuta `ZADD GT` en Redis, salvo si el usuario está en shadow-ban.
3. Las partidas anónimas no tocan `period_bests` ni Redis hasta que se reclaman (§3.7). Al reclamarlas se ejecutan los pasos 1–2 con los periodos de `starts_at`.
4. Las partidas `review` se guardan, pero no entran en `period_bests` hasta pasar la verificación.

### 5.6 Lectura

- **Top 100 público:** se renderiza en el servidor y se refresca cada 60 s (`revalidate: 60`).
- **Posición propia:** `GET /api/leaderboard/me`, sin caché.
- **"Entrarías el #N"** (anónimos y shadow-ban): `ZCOUNT` de puntuaciones mayores + 1, sin escribir en el ranking.
- **Periodos pasados:** se leen de `period_bests`, excluyendo a los usuarios en shadow-ban o baneados.

---

## 6. Privacidad (RGPD / LGPD / CCPA)

**Conservación de datos**

- `keystroke_logs` se borran a los **30 días**, salvo los de partidas que sean la mejor marca de su usuario en algún periodo **en curso** (incluido "siempre"). Cuando dejan de serlo, se borran en la siguiente pasada diaria si ya tienen más de 30 días.
- Las IP se guardan solo como hash con sal rotativa.

**Borrado de cuenta**

- Se borran nick, email, país, cuenta, sesiones, passkeys, `keystroke_logs` y `period_bests`.
- Se elimina al usuario de todos los rankings en Redis (los demás suben).
- `games` se anonimiza: `user_id` y `anon_id` a `NULL` e `ip_hash` borrado. Las PPM y la precisión se conservan para estadísticas agregadas.

**Cuentas baneadas**

- Se conserva una huella cifrada del email y del ID del proveedor (`banned_identities`) para impedir el re-registro.
- La base legal es el interés legítimo de prevenir el fraude, documentado en la política de privacidad.

**Analítica**

- Vercel Web Analytics y Speed Insights, que no usan cookies.
- Las únicas cookies son las estrictamente necesarias (sesión, `anon_id`, pase humano).

**Antes del lanzamiento:** revisión de la política de privacidad por un abogado.

---

## 7. SEO e idiomas

### 7.1 URLs

| Página | EN | ES | PT | Indexable |
|---|---|---|---|---|
| Inicio (test 30 s) | `/en` | `/es` | `/pt` | Sí |
| Práctica 15 s | `/en/practice` | `/es/practica` | `/pt/pratica` | Sí |
| Ranking actual | `/en/leaderboard/{physical\|touch}/{today\|week\|month\|all-time}` | `/es/ranking/{fisico\|tactil}/{hoy\|semana\|mes\|siempre}` | `/pt/ranking/{fisico\|tatil}/{hoje\|semana\|mes\|sempre}` | Sí (8 por idioma) |
| Ranking de un mes pasado | `/en/leaderboard/{input}/2026-10` | `/es/ranking/{input}/2026-10` | `/pt/ranking/{input}/2026-10` | Sí |
| Ranking de un día o semana pasados | `…/{input}/2026-10-04`, `…/{input}/2026-W40` | ídem | ídem | No |
| Perfil | `/en/u/{nick}` | `/es/u/{nick}` | `/pt/u/{nick}` | No (v1) |
| Resultado | `/en/r/{id}` | `/es/r/{id}` | `/pt/r/{id}` | No |
| Guías | `/en/guides/{slug}` | `/es/guias/{slug}` | `/pt/guias/{slug}` | Sí |

Cuando se active la pestaña "Año", sus rutas serán `year` (en), `anual` (es; se evita `ano`) y `ano` (pt).

### 7.2 Raíz e idiomas

- `/` redirige (307) al idioma guardado en una cookie o, si no hay, al de `Accept-Language` (por defecto `en`). Una elección manual siempre prevalece.
- Cada página declara canonical y `hreflang` en/es/pt, con `/` como `x-default`.

### 7.3 Metadatos y datos estructurados

- `generateMetadata` con title y description propios por página e idioma.
- `sitemap.xml` con alternativas de idioma, y `robots.txt`.
- JSON-LD: `WebApplication` (portada), `BreadcrumbList`, `WebSite` y `Organization`.
- La portada incluye en el HTML del servidor un H1, el top 10 de hoy y texto explicativo bajo el test.

### 7.4 Contenido

4–5 guías por idioma en MDX (`content/{en,es,pt}/`): velocidad media de escritura, cómo escribir más rápido, PPM frente a CPM, posición de los dedos y teclado físico frente a táctil.

Búsquedas objetivo:

- **EN:** "typing test", "typing speed test", "wpm test"
- **ES:** "test de velocidad de escritura", "test de mecanografía", "ppm"
- **PT:** "teste de digitação", "teste de velocidade de digitação"

### 7.5 Rendimiento

- Objetivos (p75): LCP < 1,5 s, INP < 50 ms al teclear, CLS = 0.
- **JavaScript propio de la portada ≤ 30 KB gzip** por encima de la base del framework. La base son los chunks que carga `/_not-found`, que solo incluyen Next.js y React (~130 KB gzip con Next 16.3), y no se cuentan porque no los controlamos. Se mide tras el build con `.next/diagnostics/route-bundle-stats.json`. Al cerrar la fase 1: 24,9 KB.
- Fuentes propias con `next/font`.
- El componente del test pinta las palabras una vez y en cada pulsación solo actualiza la letra afectada y la posición del cursor (`transform`). Nunca vuelve a renderizar la lista entera.

### 7.6 Internacionalización

- **next-intl** para los textos de la interfaz y las rutas traducidas.
- Listas de palabras en `words/{en,es,pt}.json`.

---

## 8. Arquitectura técnica

### 8.1 Servicios

| Pieza | Elección |
|---|---|
| Framework | Next.js 16 (App Router, React 19, React Compiler), TypeScript, Tailwind 4 |
| Alojamiento | Vercel (Hobby → Pro, §8.7) |
| Base de datos | Neon PostgreSQL + Drizzle ORM / drizzle-kit |
| Redis | Upstash Redis + `@upstash/ratelimit` |
| Autenticación | Better Auth (Google, Apple, passkeys, enlace por email) |
| Email | Resend |
| Anti-bots | Cloudflare Turnstile |
| Validación | Zod |
| Observabilidad | Sentry, Vercel Web Analytics, Speed Insights |

### 8.2 Módulos

```
src/
  app/[locale]/…             páginas (RSC)
  app/admin/…                panel de moderación
  app/api/game/…             start · [id]/keys · [id]/finish · [id]/claim
  app/api/leaderboard/me     posición propia
  components/typing-test/    componente del test (cliente)
  lib/scoring/               reproducción de pulsaciones → PPM y precisión (compartido cliente/servidor)
  server/game/               ciclo de vida de la partida (Redis)
  server/anticheat/          reglas, señales, veredicto
  server/input-type/         clasificación físico/táctil
  server/leaderboard/        claves de periodo, period_bests, Redis
  server/auth/               configuración de Better Auth
  server/db/                 esquema y cliente de Drizzle
  i18n/
content/{en,es,pt}/          guías MDX
words/{en,es,pt}.json        listas de palabras
```

- `lib/scoring` es una función pura. En el cliente solo sirve para mostrar el progreso en directo; en el servidor es la puntuación oficial.
- Todo `server/**` importa `server-only`.

### 8.3 API

| Endpoint | Entrada | Salida |
|---|---|---|
| `POST /api/game/start` | `{ language, env: { coarse, touchPoints }, turnstileToken? }` | `{ gameId, words, countdownMs: 3000, durationMs: 30000 }` o `needs_challenge` |
| `POST /api/game/{id}/keys` | `{ seq, events: TypingEvent[] }`, donde `TypingEvent` es `{ t, type: "down"\|"up", key, code, trusted }` o `{ t, type: "input", deleted, inserted, trusted }` (definido en `src/lib/scoring/types.ts`) | `{ ok }` |
| `POST /api/game/{id}/finish` | `{ lastSeq }` | `{ wpm, rawWpm, accuracy, inputType, verdict, ranks: { day, week, month, all }, wouldRank? }` |
| `POST /api/game/{id}/claim` | sesión iniciada | `{ ok, ranks }` |
| `GET /api/leaderboard/me` | `?lang&input&period` | `{ rank, score }` |

Todas las entradas se validan con Zod.

### 8.4 Errores y degradación

| Situación | Comportamiento |
|---|---|
| Fallo al enviar una tanda | Reintento con backoff; las tandas se reenvían en orden |
| `finish` fuera de plazo | Resultado mostrado como "sin ranking" |
| Corte de red en mitad de la partida | La partida continúa con palabras locales y queda marcada "sin ranking" |
| Redis o Postgres no disponibles | `start` se desactiva; la práctica sigue funcionando; aviso "ranking no disponible temporalmente" |
| Turnstile no carga | Se puede practicar; para el modo oficial se muestra un mensaje para reintentar |

### 8.5 Tareas programadas

Una **tarea diaria** (Vercel Cron, compatible con Hobby):

- Borra `keystroke_logs` caducados.
- Hace caducar las `verifications` vencidas.
- Anonimiza las partidas anónimas sin reclamar con más de 30 días: borra `anon_id` e `ip_hash` y conserva las PPM y la precisión para estadísticas.

Además, un script de administración reconstruye Redis desde Postgres.

### 8.6 Entornos

- Despliegue de vista previa por PR con una rama de Neon propia.
- Producción en `qwertyrank.com`; `www` redirige al dominio raíz; HSTS.

### 8.7 Infraestructura y costes

- **Lanzamiento en Vercel Hobby (gratis).** Está permitido mientras no haya anuncios, pagos ni afiliados; las donaciones sí están permitidas. Límites mensuales relevantes:

  | Límite | Capacidad aproximada |
  |---|---|
  | 1 M ejecuciones de funciones | ~12 por partida → ~83.000 partidas/mes |
  | 1 M peticiones CDN | ~50.000–100.000 visitas/mes |
  | 4 h de CPU activa | Holgado |
  | 100 GB de transferencia | Holgado |

  Superar un límite en Hobby **pausa el servicio hasta 30 días**.
- **Paso a Pro** (20 $/mes) cuando ocurra lo primero de:
  - se incluyan anuncios o pagos;
  - cualquier límite llegue al 60–70 % (revisión semanal del panel de uso).
- **Resto de servicios:** Neon, Upstash, Resend, Turnstile y Sentry en sus planes gratuitos al inicio. Redis cobra por comando (~20–30 por partida); con volumen, pasar a un plan de precio fijo.

---

## 9. Pruebas

| Nivel | Herramienta | Cubre |
|---|---|---|
| Unitarias (TDD) | Vitest | `lib/scoring`; claves de periodo (medianoche UTC, semanas ISO, cambio de año, `2026-W53`); puntuación compuesta y desempates; clasificador físico/táctil; reglas y señales del anti-trampas |
| Datos de prueba del anti-trampas | Vitest + fixtures | Partidas humanas grabadas en la beta; bots sintéticos (ritmo uniforme, ritmo aleatorio, registros humanos acelerados, texto inyectado). Objetivo: bots `rejected` o en riesgo alto; falsos positivos humanos < 1 % |
| Integración | Vitest + Postgres y Redis en Docker | Endpoints de `game` completos, `period_bests`, sincronización con Redis, `claim`, borrado de cuenta |
| E2E | Playwright | Partida oficial en ordenador y en móvil emulado; práctica; reclamar partida anónima; rutas en/es/pt; `hreflang`/canonical presentes |
| Rendimiento | Lighthouse CI + Playwright | Límites de LCP, CLS y tamaño de JS; INP medido tecleando |
| Carga | k6 | `start`/`keys`/`finish` antes del lanzamiento |
| CI | GitHub Actions | lint, tipos, unitarias, integración, E2E, Lighthouse |

---

## 10. Fuera del alcance de la v1

Duelos en directo, más modos con ranking (p. ej. 15 s), ranking por país, reto diario, página de estadísticas globales, historial de partidas de práctica, anuncios o premium, app nativa, indexación de perfiles.

---

## 11. Orden de construcción

El alcance es grande para un solo plan. Se construye en fases y cada una termina en algo que funciona y se puede probar:

1. **Núcleo de juego:** `lib/scoring`, componente del test, modo práctica, palabras en/es/pt, i18n básico.
2. **Partida con servidor:** esquema de Drizzle, Redis, `start`/`keys`/`finish`, reglas de tiempo, clasificación físico/táctil.
3. **Cuentas y rankings:** Better Auth, nick y perfil, `period_bests`, rankings en Redis, pantalla de ranking, reclamar partidas anónimas.
4. **Anti-trampas completo:** señales y riesgo, Turnstile y límites, verificación de récords, shadow-ban, panel `/admin`, conjunto de datos de bots.
5. **SEO y lanzamiento:** rutas traducidas, metadatos, sitemap, JSON-LD, guías, compartir con imagen, privacidad y tarea diaria, Lighthouse CI y pruebas de carga.

---

## 12. Pendientes fuera del código

1. Comprar `qwertyrank.com` (y opcionalmente `.app`/`.io` para protegerlo). `.es` no se pudo verificar.
2. Comprobar que no exista la marca "QwertyRank" registrada (EUIPO / USPTO).
3. Revisión legal de la política de privacidad y los términos antes del lanzamiento.
