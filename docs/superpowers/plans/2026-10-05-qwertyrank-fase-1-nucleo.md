# QwertyRank — Fase 1: núcleo de juego — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un test de mecanografía que funciona entero en el navegador (modo práctica de 15 s y portada de 30 s) en inglés, español y portugués, con el motor de puntuación que reutilizará el servidor en la fase 2.

**Architecture:** El cálculo es un módulo puro (`src/lib/scoring`): un motor que aplica cambios de texto (`applyInput`) y una función `replay(words, events, durationMs)` que reproduce la partida y devuelve PPM, precisión y gráfica. La interfaz (`src/components/typing-test`) captura el texto con un `<input>` oculto, convierte cada cambio en un evento `{ deleted, inserted }` y usa el mismo motor. Las páginas son estáticas (SSG) con next-intl (`[locale]` como raíz, `next/root-params`, rutas traducidas y `proxy.ts`).

**Tech Stack:** Next.js 16.3.8 (App Router, Turbopack, React Compiler), React 19.2.8, TypeScript 5.9 estricto, Tailwind 4, next-intl 4.14.9, Vitest 5 + Testing Library + jsdom, Playwright 1.63, pnpm 10, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-04-qwertyrank-design.md` (fase 1 de la §11).

## Global Constraints

- **No hacer commits ni push.** Regla global del usuario (`~/.claude/CLAUDE.md`): solo se hacen cuando él lo pide. Donde un plan normal diría "Commit", aquí hay un **Checkpoint** de verificación.
- Gestor de paquetes: **pnpm** (hay `pnpm-lock.yaml`). Node **24** (`.nvmrc`).
- Versiones fijadas: `next@16.3.8`, `react@19.2.8`, `next-intl@4.14.9`, `vitest@5.0.3`, `@vitejs/plugin-react@6.1.1`, `vite@^8`, `@types/node@^24`.
- Antes de tocar APIs de Next.js, leer la guía correspondiente en `node_modules/next/dist/docs/` (lo exige `AGENTS.md`). En Next 16 el middleware se llama **`proxy.ts`**.
- Idiomas: `en`, `es`, `pt`. Idioma por defecto: `en`. Rutas de práctica: `/en/practice`, `/es/practica`, `/pt/pratica`.
- Duraciones: oficial **30 000 ms**, práctica **15 000 ms**. Palabras por partida: **160**.
- PPM = (caracteres correctos ÷ 5) ÷ minutos; precisión = pulsaciones correctas ÷ pulsaciones totales (§3.3 del spec).
- Todo texto visible sale de `messages/{en,es,pt}.json`; nada de textos fijos en los componentes salvo la marca "QwertyRank".
- Los tests unitarios viven junto al código (`*.test.ts[x]` en `src/`). Los E2E en `e2e/`.

### Desviaciones del spec aceptadas en esta fase

| Spec | Fase 1 | Cuándo se cierra |
|---|---|---|
| Listas de ~1.000 palabras (§3.2) | 200 palabras por idioma, revisadas a mano | Fase 5, antes del lanzamiento |
| Portada = modo oficial con botón Empezar y cuenta atrás (§3.4) | La portada usa el test local de 30 s que empieza con la primera pulsación | Fase 2 (partida con servidor) |
| Idioma del test seleccionable (§3.2) | El idioma del test es el de la página | Fase 3 |
| Eventos `{ t, type, key, code, trusted }` (§8.3) | Las entradas de texto son `{ t, type: "input", deleted, inserted, trusted }`; las teclas siguen el formato del spec. El spec se actualiza con este formato. | Ya actualizado |

## Review Focus

1. **Acentos con tecla muerta** (macOS en español o portugués: ´ + e = é): el acento suelto que aparece mientras se compone no puede contar como error. Lo cubren el test `isDeadKeyPreview` (Task 5) y el test de componente "no cuenta como error el acento suelto de una tecla muerta" (Task 6).
2. **Doble espacio o espacio al inicio de palabra**: no debe crear palabras vacías ni contar pulsaciones. Lo cubre el test del motor "ignora un espacio al inicio de palabra" (Task 1).
3. **Teclados de móvil**: espacio no separable (NBSP) en vez de espacio y mayúscula automática al empezar. Lo cubren los tests del motor "acepta cualquier espacio en blanco" y "una mayúscula no coincide" (Task 1), más `autoCapitalize="off"` en el input (Task 6).
4. **Entradas que llegan tarde y Tab a mitad de partida**: lo escrito después del tiempo no cuenta, y Tab reinicia sin que salte el temporizador viejo. Lo cubren el test de `replay` "ignora eventos fuera de la partida" (Task 2), los del hook "ignora la entrada después de terminar" y "reiniciar… vuelve al reposo" (Task 5), y el de componente "Tab reinicia a mitad de partida" (Task 6).
5. **Perder el foco a mitad de partida** (clic fuera o cambiar de pestaña): se avisa, pero el tiempo sigue corriendo. Lo cubre el test de componente "al perder el foco avisa, pero el tiempo sigue corriendo" (Task 6).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `vitest.config.mts`, `vitest.setup.ts` | Configuración de tests unitarios (jsdom, alias de `tsconfig`, jest-dom) |
| `playwright.config.ts`, `e2e/*.spec.ts` | Tests E2E en escritorio y móvil emulado |
| `words/{en,es,pt}.json` | Listas de palabras (200 por idioma) |
| `messages/{en,es,pt}.json` | Textos de la interfaz |
| `src/lib/scoring/types.ts` | Tipos de los eventos de una partida |
| `src/lib/scoring/engine.ts` | Motor puro: aplica borrados/inserciones a la palabra actual |
| `src/lib/scoring/metrics.ts` | Caracteres correctos/escritos, PPM y precisión |
| `src/lib/scoring/replay.ts` | Reproduce una partida y devuelve `TestResult` |
| `src/lib/scoring/durations.ts` | Duraciones de los modos |
| `src/lib/words/languages.ts` | Idiomas del test y palabras por partida |
| `src/lib/words/rng.ts` | Generador pseudoaleatorio con semilla |
| `src/lib/words/generate.ts` | Elige palabras sin repetir dos seguidas |
| `src/lib/words/load.ts` | Carga diferida de cada lista |
| `src/lib/words/initial-words.ts` | Texto inicial determinista (páginas estáticas) |
| `src/i18n/routing.ts`, `navigation.ts`, `request.ts` | Configuración de next-intl |
| `src/proxy.ts` | Redirección por idioma y reescritura de rutas traducidas |
| `src/global.d.ts` | Tipado de idiomas y mensajes de next-intl |
| `src/components/typing-test/input-diff.ts` | Convierte cambios del `<input>` en `{ deleted, inserted }` y filtra teclas muertas |
| `src/components/typing-test/use-typing-session.ts` | Estado y reloj de una partida local |
| `src/components/typing-test/word.tsx`, `words-view.tsx` | Texto, letras coloreadas, cursor y desplazamiento de líneas |
| `src/components/typing-test/timer.tsx` | Segundos restantes |
| `src/components/typing-test/wpm-chart.tsx`, `result-view.tsx` | Pantalla de resultado |
| `src/components/typing-test/typing-test.tsx` | Componente que lo une todo |
| `src/components/site-header.tsx`, `locale-switcher.tsx` | Cabecera y selector de idioma |
| `src/app/[locale]/layout.tsx`, `page.tsx`, `practice/page.tsx` | Layout raíz y páginas |
| `src/test/render-with-intl.tsx` | Render de tests con next-intl |

Se borran: `src/app/layout.tsx`, `src/app/page.tsx` y los SVG de ejemplo de `public/`.

---

### Task 1: Herramientas de test y motor de escritura

**Files:**
- Modify: `package.json` (dependencias de desarrollo y scripts)
- Create: `vitest.config.mts`, `vitest.setup.ts`
- Create: `src/lib/scoring/types.ts`, `src/lib/scoring/engine.ts`
- Test: `src/lib/scoring/engine.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `types.ts`: `KeyTypingEvent { t: number; type: "down" | "up"; key: string; code: string; trusted: boolean }`, `InputTypingEvent { t: number; type: "input"; deleted: number; inserted: string; trusted: boolean }`, `TypingEvent = KeyTypingEvent | InputTypingEvent`.
  - `engine.ts`: `MAX_EXTRA_CHARS = 10`, `interface EngineState { words; typed; current; correctInserts; totalInserts; mistakes }`, `createEngine(words: readonly string[]): EngineState`, `isFinished(state: EngineState): boolean`, `applyInput(state: EngineState, deleted: number, inserted: string): EngineState`.

**Reglas del motor** (léelas antes de implementar):
- Solo se escribe en la palabra actual. Un borrado al inicio de la palabra no hace nada; no se puede volver a la palabra anterior.
- Cualquier espacio en blanco (`/\s/u`) confirma la palabra. Si la palabra actual está vacía, se ignora y no cuenta como pulsación.
- El espacio que confirma una palabra cuenta como pulsación correcta solo si la palabra está bien escrita.
- Una letra cuenta como correcta si coincide con la letra esperada en esa posición. Si no coincide, se suma un fallo a `mistakes[letraEsperada]`. Las letras de más son incorrectas, pero no suman a `mistakes`.
- Como máximo se aceptan `MAX_EXTRA_CHARS` letras de más por palabra. Las siguientes se ignoran sin contar.
- Cuando `current === words.length`, la partida ha terminado y `applyInput` devuelve el mismo objeto.
- El estado es inmutable: `applyInput` nunca modifica el estado recibido.

- [ ] **Step 1: Instalar las dependencias de test y añadir scripts**

```bash
pnpm add -D vitest@5.0.3 vite@^8 @vitejs/plugin-react@6.1.1 jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @types/node@^24
```

En `package.json`, añade estos scripts a los existentes (`dev`, `build`, `start`, `lint`):

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Configurar Vitest**

`vitest.config.mts`. Vite 8 resuelve los alias de `tsconfig` con `resolve.tsconfigPaths`, así que no hace falta el plugin `vite-tsconfig-paths` que menciona la guía de Next:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Escribir el test del motor (falla)**

`src/lib/scoring/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_EXTRA_CHARS, applyInput, createEngine, isFinished } from "./engine";

function type(words: string[], ...chunks: string[]) {
  return chunks.reduce((state, chunk) => applyInput(state, 0, chunk), createEngine(words));
}

describe("engine", () => {
  it("empieza en la primera palabra sin nada escrito", () => {
    const state = createEngine(["hola", "mundo"]);
    expect(state.current).toBe(0);
    expect(state.typed).toEqual([""]);
    expect(isFinished(state)).toBe(false);
  });

  it("cuenta las letras correctas y avanza con el espacio", () => {
    const state = type(["hola", "mundo"], "hola ");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
    expect(state.correctInserts).toBe(5);
    expect(state.totalInserts).toBe(5);
  });

  it("registra el carácter esperado como fallo cuando se escribe otro", () => {
    const state = type(["casa"], "cosa");
    expect(state.correctInserts).toBe(3);
    expect(state.totalInserts).toBe(4);
    expect(state.mistakes).toEqual({ a: 1 });
  });

  it("el espacio de una palabra incorrecta cuenta como pulsación incorrecta", () => {
    const state = type(["casa", "azul"], "cosa ");
    expect(state.current).toBe(1);
    expect(state.totalInserts).toBe(5);
    expect(state.correctInserts).toBe(3);
  });

  it("ignora un espacio al inicio de palabra (doble espacio)", () => {
    const state = type(["hola", "mundo"], " ", "hola  ");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
    expect(state.totalInserts).toBe(5);
  });

  it("acepta cualquier espacio en blanco como espacio (p. ej. NBSP de teclados móviles)", () => {
    const state = type(["hola", "mundo"], "hola ");
    expect(state.current).toBe(1);
    expect(state.correctInserts).toBe(5);
  });

  it("cuenta como incorrectos los caracteres de más, hasta un máximo", () => {
    const state = type(["sol"], "sol" + "x".repeat(MAX_EXTRA_CHARS + 5));
    expect(state.typed[0]).toBe("sol" + "x".repeat(MAX_EXTRA_CHARS));
    expect(state.totalInserts).toBe(3 + MAX_EXTRA_CHARS);
    expect(state.mistakes).toEqual({});
  });

  it("borra solo dentro de la palabra actual", () => {
    let state = type(["hola", "mundo"], "hola ", "mu");
    state = applyInput(state, 5, "");
    expect(state.current).toBe(1);
    expect(state.typed).toEqual(["hola", ""]);
  });

  it("borrar y volver a escribir corrige la palabra, pero los fallos siguen contando", () => {
    let state = type(["gato"], "gatp");
    state = applyInput(state, 1, "o");
    expect(state.typed[0]).toBe("gato");
    expect(state.totalInserts).toBe(5);
    expect(state.correctInserts).toBe(4);
    expect(state.mistakes).toEqual({ o: 1 });
  });

  it("una mayúscula no coincide con la minúscula esperada", () => {
    const state = type(["casa"], "Casa");
    expect(state.mistakes).toEqual({ c: 1 });
  });

  it("procesa varios caracteres de golpe, incluidos espacios", () => {
    const state = type(["uno", "dos", "tres"], "uno dos t");
    expect(state.current).toBe(2);
    expect(state.typed).toEqual(["uno", "dos", "t"]);
  });

  it("termina al confirmar la última palabra e ignora lo que llegue después", () => {
    const finished = type(["fin"], "fin ");
    expect(isFinished(finished)).toBe(true);
    expect(applyInput(finished, 0, "abc")).toBe(finished);
  });

  it("ignora un número de borrados no válido", () => {
    const state = applyInput(type(["hola"], "ho"), Number.NaN, "l");
    expect(state.typed[0]).toBe("hol");
  });

  it("no modifica el estado anterior", () => {
    const before = type(["hola"], "h");
    applyInput(before, 0, "o");
    expect(before.typed).toEqual(["h"]);
  });
});
```

- [ ] **Step 4: Ejecutarlo y ver que falla**

Run: `pnpm test src/lib/scoring/engine.test.ts`
Expected: FAIL. No se puede resolver `./engine`.

- [ ] **Step 5: Implementar tipos y motor**

`src/lib/scoring/types.ts`:

```ts
/** Pulsación física o virtual. `t` = ms desde el inicio de la partida. */
export interface KeyTypingEvent {
  t: number;
  type: "down" | "up";
  key: string;
  code: string;
  trusted: boolean;
}

/**
 * Cambio en el texto escrito: primero se borran `deleted` caracteres del final
 * de la palabra actual y después se insertan los de `inserted` (un espacio, o
 * cualquier otro espacio en blanco, confirma la palabra).
 */
export interface InputTypingEvent {
  t: number;
  type: "input";
  deleted: number;
  inserted: string;
  trusted: boolean;
}

export type TypingEvent = KeyTypingEvent | InputTypingEvent;
```

`src/lib/scoring/engine.ts`:

```ts
/** Caracteres de más que se aceptan al final de una palabra; el resto se ignora. */
export const MAX_EXTRA_CHARS = 10;

export interface EngineState {
  readonly words: readonly string[];
  /** typed[i] = lo escrito para la palabra i. Siempre existe typed[current]. */
  readonly typed: readonly string[];
  /** Índice de la palabra activa; igual a words.length cuando se han escrito todas. */
  readonly current: number;
  readonly correctInserts: number;
  readonly totalInserts: number;
  /** Carácter esperado → veces que se escribió otro en su lugar. */
  readonly mistakes: Readonly<Record<string, number>>;
}

const WHITESPACE = /\s/u;

export function createEngine(words: readonly string[]): EngineState {
  return { words, typed: [""], current: 0, correctInserts: 0, totalInserts: 0, mistakes: {} };
}

export function isFinished(state: EngineState): boolean {
  return state.current >= state.words.length;
}

export function applyInput(state: EngineState, deleted: number, inserted: string): EngineState {
  if (isFinished(state)) return state;

  const typed = [...state.typed];
  let { current, correctInserts, totalInserts, mistakes } = state;

  const toDelete = Number.isFinite(deleted) ? Math.max(0, Math.floor(deleted)) : 0;
  if (toDelete > 0) {
    typed[current] = typed[current].slice(0, Math.max(0, typed[current].length - toDelete));
  }

  for (const char of inserted) {
    if (current >= state.words.length) break;
    const target = state.words[current];
    const soFar = typed[current];

    if (WHITESPACE.test(char)) {
      if (soFar.length === 0) continue;
      totalInserts++;
      if (soFar === target) correctInserts++;
      current++;
      typed.push("");
      continue;
    }

    if (soFar.length >= target.length + MAX_EXTRA_CHARS) continue;
    totalInserts++;
    const expected = target[soFar.length];
    if (char === expected) {
      correctInserts++;
    } else if (expected !== undefined) {
      mistakes = { ...mistakes, [expected]: (mistakes[expected] ?? 0) + 1 };
    }
    typed[current] = soFar + char;
  }

  return { words: state.words, typed, current, correctInserts, totalInserts, mistakes };
}
```

- [ ] **Step 6: Ejecutar el test y ver que pasa**

Run: `pnpm test src/lib/scoring/engine.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 7: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: sin errores; 14 tests en verde.

---

### Task 2: Métricas y reproducción de partidas

**Files:**
- Create: `src/lib/scoring/metrics.ts`, `src/lib/scoring/replay.ts`, `src/lib/scoring/durations.ts`
- Test: `src/lib/scoring/metrics.test.ts`, `src/lib/scoring/replay.test.ts`

**Interfaces:**
- Consumes: `createEngine`, `applyInput`, `EngineState` (Task 1); `TypingEvent`, `InputTypingEvent` (Task 1).
- Produces:
  - `metrics.ts`: `round2(value: number): number`, `countCorrectChars(state: EngineState): number`, `countTypedChars(state: EngineState): number`, `wordsPerMinute(chars: number, elapsedMs: number): number`, `accuracyPercent(correct: number, total: number): number`.
  - `replay.ts`: `interface TestResult { wpm: number; rawWpm: number; accuracy: number; correctChars: number; typedChars: number; perSecond: number[]; mistakes: Record<string, number> }`, `replay(words: readonly string[], events: readonly TypingEvent[], durationMs: number): TestResult`.
  - `durations.ts`: `OFFICIAL_DURATION_MS = 30_000`, `PRACTICE_DURATION_MS = 15_000`.

**Definiciones:**
- **Caracteres correctos:** los de cada palabra confirmada que esté bien escrita, más 1 por su espacio, y además el prefijo de la palabra activa si coincide con el inicio de la palabra esperada.
- **Caracteres escritos:** todo lo que sigue en pantalla, más 1 por cada palabra confirmada.
- **PPM** = correctos ÷ 5 ÷ (ms ÷ 60 000), redondeado a 2 decimales. **PPM brutas:** lo mismo con los caracteres escritos.
- **Precisión** = `correctInserts / totalInserts × 100`, redondeada a 2 decimales; es 0 si no hay pulsaciones.
- **`replay`:**
  - Solo usa eventos `input` con `0 ≤ t ≤ durationMs`, ordenados por `t`.
  - `perSecond[i]` son las PPM acumuladas al final del segundo `i + 1`.
  - Un evento con `t` exactamente en la frontera de un segundo cuenta para ese segundo.

- [ ] **Step 1: Escribir los tests (fallan)**

`src/lib/scoring/metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyInput, createEngine } from "./engine";
import { accuracyPercent, countCorrectChars, countTypedChars, round2, wordsPerMinute } from "./metrics";

const typed = (words: string[], text: string) => applyInput(createEngine(words), 0, text);

describe("metrics", () => {
  it("countCorrectChars suma palabras correctas con su espacio", () => {
    expect(countCorrectChars(typed(["hola", "mundo", "azul"], "hola mundo "))).toBe(11);
  });

  it("countCorrectChars no suma palabras confirmadas con errores", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mumdo "))).toBe(5);
  });

  it("countCorrectChars suma el prefijo correcto de la palabra activa", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mun"))).toBe(8);
  });

  it("countCorrectChars no suma la palabra activa si tiene un error", () => {
    expect(countCorrectChars(typed(["hola", "mundo"], "hola mon"))).toBe(5);
  });

  it("countTypedChars cuenta todo lo escrito, incluidos errores", () => {
    expect(countTypedChars(typed(["hola", "mundo"], "hola mon"))).toBe(8);
  });

  it("wordsPerMinute usa palabras de 5 caracteres", () => {
    expect(wordsPerMinute(50, 30_000)).toBe(20);
    expect(wordsPerMinute(10, 0)).toBe(0);
  });

  it("accuracyPercent devuelve 0 sin pulsaciones y redondea a 2 decimales", () => {
    expect(accuracyPercent(0, 0)).toBe(0);
    expect(accuracyPercent(2, 3)).toBe(66.67);
  });

  it("round2 redondea a 2 decimales", () => {
    expect(round2(3.14159)).toBe(3.14);
    expect(round2(66.666)).toBe(66.67);
  });
});
```

`src/lib/scoring/replay.test.ts`:

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

Run: `pnpm test src/lib/scoring`
Expected: FAIL en `metrics.test.ts` y `replay.test.ts` (no se pueden resolver `./metrics` ni `./replay`); `engine.test.ts` sigue pasando.

- [ ] **Step 3: Implementar**

`src/lib/scoring/metrics.ts`:

```ts
import type { EngineState } from "./engine";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Caracteres de palabras correctas (con su espacio) + prefijo correcto de la palabra activa. */
export function countCorrectChars(state: EngineState): number {
  let total = 0;
  const committed = Math.min(state.current, state.words.length);
  for (let i = 0; i < committed; i++) {
    if (state.typed[i] === state.words[i]) total += state.words[i].length + 1;
  }
  if (state.current < state.words.length) {
    const soFar = state.typed[state.current];
    if (state.words[state.current].startsWith(soFar)) total += soFar.length;
  }
  return total;
}

/** Todos los caracteres escritos que siguen en pantalla, con los espacios de las palabras confirmadas. */
export function countTypedChars(state: EngineState): number {
  let total = 0;
  const committed = Math.min(state.current, state.words.length);
  for (let i = 0; i < committed; i++) total += state.typed[i].length + 1;
  if (state.current < state.words.length) total += state.typed[state.current].length;
  return total;
}

export function wordsPerMinute(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return round2(chars / 5 / (elapsedMs / 60_000));
}

export function accuracyPercent(correct: number, total: number): number {
  if (total === 0) return 0;
  return round2((correct / total) * 100);
}
```

`src/lib/scoring/replay.ts`:

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

export function replay(
  words: readonly string[],
  events: readonly TypingEvent[],
  durationMs: number,
): TestResult {
  const inputs = events
    .filter((event): event is InputTypingEvent =>
      event.type === "input" && event.t >= 0 && event.t <= durationMs,
    )
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

`src/lib/scoring/durations.ts`:

```ts
export const OFFICIAL_DURATION_MS = 30_000;
export const PRACTICE_DURATION_MS = 15_000;
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/lib/scoring`
Expected: PASS, 27 tests.

- [ ] **Step 5: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: sin errores.

---

### Task 3: Listas de palabras y generación del texto

**Files:**
- Create: `words/en.json`, `words/es.json`, `words/pt.json`
- Modify: `tsconfig.json` (alias `@words/*`)
- Create: `src/lib/words/languages.ts`, `rng.ts`, `generate.ts`, `load.ts`, `initial-words.ts`
- Test: `src/lib/words/rng.test.ts`, `generate.test.ts`, `word-lists.test.ts`, `initial-words.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `languages.ts`: `TEST_LANGUAGES = ["en", "es", "pt"] as const`, `type TestLanguage`, `WORDS_PER_TEST = 160`.
  - `rng.ts`: `mulberry32(seed: number): () => number`.
  - `generate.ts`: `generateWords(list: readonly string[], count: number, random: () => number): string[]`.
  - `load.ts`: `loadWordList(language: TestLanguage): Promise<readonly string[]>`.
  - `initial-words.ts`: `INITIAL_WORDS_SEED = 20_261_004`, `getInitialWords(language: TestLanguage): Promise<string[]>`.

**Reglas:**
- `generateWords` nunca repite la misma palabra dos veces seguidas. Si sale repetida, toma la siguiente de la lista; nunca vuelve a sortear, para no quedarse en bucle con un generador constante.
- Si el generador devuelve 1, se limita al último índice.
- Con una lista vacía lanza `"La lista de palabras está vacía"`.
- El texto inicial usa una semilla fija para que las páginas sean estáticas y no haya diferencias de hidratación entre servidor y navegador.

- [ ] **Step 1: Añadir el alias `@words/*`**

En `tsconfig.json`, dentro de `compilerOptions.paths`:

```json
"paths": {
  "@/*": ["./src/*"],
  "@words/*": ["./words/*"]
}
```

- [ ] **Step 2: Crear las listas de palabras**

Cada lista tiene 200 palabras comunes, en minúsculas, sin signos ni nombres propios, en forma NFC, revisadas a mano para que no haya palabras ofensivas. Copia el contenido exacto.

`words/en.json`:

```json
["the","be","of","and","a","to","in","he","have","it","that","for","they","with","as","not","on","she","at","by","this","we","you","do","but","from","or","which","one","would","all","will","there","say","who","make","when","can","more","if","no","man","out","other","so","what","time","up","go","about","than","into","could","state","only","new","year","some","take","come","these","know","see","use","get","like","then","first","any","work","now","may","such","give","over","think","most","even","find","day","also","after","way","many","must","look","before","great","back","through","long","where","much","should","well","people","down","own","just","because","good","each","those","feel","seem","how","high","too","place","little","world","very","still","nation","hand","old","life","tell","write","become","here","show","house","both","between","need","mean","call","develop","under","last","right","move","thing","general","school","never","same","another","begin","while","number","part","turn","real","leave","might","want","point","form","off","child","few","small","since","against","ask","late","home","interest","large","person","end","open","public","follow","during","present","without","again","hold","govern","around","possible","head","consider","word","program","problem","however","lead","system","set","order","eye","plan","run","keep","face","fact","group","play","stand","increase","early","course","change","help","line","power"]
```

`words/es.json`:

```json
["de","la","que","el","en","y","a","los","se","del","las","un","por","con","no","una","su","para","es","al","lo","como","más","o","pero","sus","le","ha","me","si","sin","sobre","este","ya","entre","cuando","todo","esta","ser","son","dos","también","fue","había","era","muy","años","hasta","desde","está","mi","porque","qué","solo","han","yo","hay","vez","puede","todos","así","nos","ni","parte","tiene","él","uno","donde","bien","tiempo","mismo","ese","ahora","cada","vida","otro","después","te","otros","aunque","esa","eso","hace","otra","gobierno","tan","durante","siempre","día","tanto","ella","tres","sí","dijo","sido","gran","país","según","menos","mundo","año","antes","estado","contra","forma","caso","nada","hacer","general","estaba","poco","estos","mayor","unos","algo","hacia","casa","ellos","hecho","primera","mucho","mientras","además","quien","momento","esto","hombre","están","pues","hoy","lugar","nacional","trabajo","otras","mejor","nuevo","decir","algunos","entonces","todas","días","debe","política","cómo","casi","toda","tal","luego","pasado","primer","medio","va","estas","sea","tenía","nunca","poder","aquí","ver","veces","partido","personas","grupo","cuenta","pueden","tienen","misma","nueva","fueron","mujer","frente","cosas","fin","ciudad","social","manera","tener","sistema","será","historia","muchos","tipo","cuatro","dentro","nuestro","punto","dice","cualquier","noche","aún","agua","parece","haber","situación","fuerza","mañana","niños","pequeño","señor","familia"]
```

`words/pt.json`:

```json
["de","a","o","que","e","do","da","em","um","para","é","com","não","uma","os","no","se","na","por","mais","as","dos","como","mas","foi","ao","ele","das","tem","à","seu","sua","ou","ser","quando","muito","há","nos","já","está","eu","também","só","pelo","pela","até","isso","ela","entre","era","depois","sem","mesmo","aos","ter","seus","quem","nas","me","esse","eles","estão","você","tinha","foram","essa","nem","suas","meu","às","minha","têm","elas","havia","seja","qual","será","nós","lhe","este","dele","vocês","nosso","nossa","dela","esta","isto","ano","anos","dia","dias","vez","vida","tempo","casa","mundo","país","cidade","trabalho","governo","pessoas","coisa","coisas","parte","lugar","forma","caso","nome","homem","mulher","água","noite","hoje","agora","ainda","sempre","nunca","aqui","lá","bem","pouco","grande","novo","nova","melhor","primeiro","primeira","outro","outra","outros","todos","todo","toda","cada","assim","então","porque","onde","sobre","contra","desde","durante","antes","fazer","dizer","poder","ver","dar","ir","saber","querer","ficar","deve","pode","podem","vai","vão","estar","faz","fez","disse","diz","sabe","quer","vem","sim","mãe","pai","filho","criança","escola","amigo","coração","mão","olhos","cabeça","história","problema","questão","situação","informação","educação","público","política","social","três","mês","família","difícil","fácil","último","música","café","força","começo","serviço","espaço","razão","irmão","livro"]
```

- [ ] **Step 3: Escribir los tests (fallan)**

`src/lib/words/rng.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";

describe("mulberry32", () => {
  it("es determinista para una misma semilla", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("devuelve valores en [0, 1)", () => {
    const random = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
```

`src/lib/words/generate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateWords } from "./generate";
import { mulberry32 } from "./rng";

describe("generateWords", () => {
  it("devuelve el número de palabras pedido, todas de la lista", () => {
    const list = ["uno", "dos", "tres"];
    const words = generateWords(list, 50, mulberry32(1));
    expect(words).toHaveLength(50);
    expect(words.every((word) => list.includes(word))).toBe(true);
  });

  it("no repite la misma palabra dos veces seguidas", () => {
    const words = generateWords(["a", "b"], 200, mulberry32(3));
    for (let i = 1; i < words.length; i++) expect(words[i]).not.toBe(words[i - 1]);
  });

  it("no se bloquea con un generador constante", () => {
    expect(generateWords(["a", "b", "c"], 4, () => 0)).toEqual(["a", "b", "a", "b"]);
  });

  it("tolera un generador que devuelve 1", () => {
    expect(generateWords(["a", "b"], 1, () => 1)).toEqual(["b"]);
  });

  it("con una sola palabra la repite", () => {
    expect(generateWords(["solo"], 3, Math.random)).toEqual(["solo", "solo", "solo"]);
  });

  it("falla con una lista vacía", () => {
    expect(() => generateWords([], 3, Math.random)).toThrow("La lista de palabras está vacía");
  });
});
```

`src/lib/words/word-lists.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEST_LANGUAGES, type TestLanguage } from "./languages";
import { loadWordList } from "./load";

const ALLOWED: Record<TestLanguage, RegExp> = {
  en: /^[a-z]+$/u,
  es: /^[a-záéíóúüñ]+$/u,
  pt: /^[a-záàâãçéêíóôõú]+$/u,
};

describe.each(TEST_LANGUAGES)("lista de palabras %s", (language) => {
  it("tiene 200 palabras únicas", async () => {
    const list = await loadWordList(language);
    expect(list).toHaveLength(200);
    expect(new Set(list).size).toBe(200);
  });

  it("solo usa minúsculas del idioma, en forma NFC", async () => {
    const list = await loadWordList(language);
    for (const word of list) {
      expect(word, word).toMatch(ALLOWED[language]);
      expect(word.normalize("NFC"), word).toBe(word);
    }
  });
});
```

`src/lib/words/initial-words.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getInitialWords } from "./initial-words";
import { WORDS_PER_TEST } from "./languages";

describe("getInitialWords", () => {
  it("devuelve siempre las mismas palabras para un idioma", async () => {
    const first = await getInitialWords("es");
    const second = await getInitialWords("es");
    expect(first).toHaveLength(WORDS_PER_TEST);
    expect(second).toEqual(first);
  });

  it("cambia según el idioma", async () => {
    expect(await getInitialWords("en")).not.toEqual(await getInitialWords("pt"));
  });
});
```

- [ ] **Step 4: Ejecutarlos y ver que fallan**

Run: `pnpm test src/lib/words`
Expected: FAIL. No se pueden resolver `./rng`, `./generate`, `./languages`, `./load` ni `./initial-words`.

- [ ] **Step 5: Implementar**

`src/lib/words/languages.ts`:

```ts
export const TEST_LANGUAGES = ["en", "es", "pt"] as const;
export type TestLanguage = (typeof TEST_LANGUAGES)[number];

/** Palabras por partida: cubre el techo de PPM de cualquier categoría en 30 s. */
export const WORDS_PER_TEST = 160;
```

`src/lib/words/rng.ts`:

```ts
/** Generador pseudoaleatorio determinista (mulberry32). Devuelve valores en [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
```

`src/lib/words/generate.ts`:

```ts
/** Elige `count` palabras al azar de `list`, sin repetir la misma dos veces seguidas. */
export function generateWords(
  list: readonly string[],
  count: number,
  random: () => number,
): string[] {
  if (list.length === 0) throw new Error("La lista de palabras está vacía");
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    let index = Math.min(list.length - 1, Math.floor(random() * list.length));
    if (list.length > 1 && list[index] === words[i - 1]) index = (index + 1) % list.length;
    words.push(list[index]);
  }
  return words;
}
```

`src/lib/words/load.ts`:

```ts
import type { TestLanguage } from "./languages";

/** Carga la lista de palabras de un idioma en un chunk aparte. */
export async function loadWordList(language: TestLanguage): Promise<readonly string[]> {
  switch (language) {
    case "en":
      return (await import("@words/en.json")).default;
    case "es":
      return (await import("@words/es.json")).default;
    case "pt":
      return (await import("@words/pt.json")).default;
  }
}
```

`src/lib/words/initial-words.ts`:

```ts
import { generateWords } from "./generate";
import { WORDS_PER_TEST, type TestLanguage } from "./languages";
import { loadWordList } from "./load";
import { mulberry32 } from "./rng";

/** Semilla fija: el texto inicial es determinista para que la página sea estática. */
export const INITIAL_WORDS_SEED = 20_261_004;

export async function getInitialWords(language: TestLanguage): Promise<string[]> {
  const list = await loadWordList(language);
  return generateWords(list, WORDS_PER_TEST, mulberry32(INITIAL_WORDS_SEED));
}
```

- [ ] **Step 6: Ejecutar y ver que pasan**

Run: `pnpm test src/lib/words`
Expected: PASS, 16 tests (2 + 6 + 6 + 2).

- [ ] **Step 7: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: sin errores.

---

### Task 4: Idiomas (next-intl), layout y páginas

**Files:**
- Modify: `package.json` (dependencia `next-intl`), `next.config.ts`, `src/app/globals.css`
- Create: `messages/en.json`, `messages/es.json`, `messages/pt.json`
- Create: `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/request.ts`, `src/proxy.ts`, `src/global.d.ts`
- Create: `src/components/site-header.tsx`, `src/components/locale-switcher.tsx`
- Create: `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `src/app/[locale]/practice/page.tsx`
- Delete: `src/app/layout.tsx`, `src/app/page.tsx`, `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`
- Test: `src/i18n/messages.test.ts`

**Interfaces:**
- Consumes: `getInitialWords` (Task 3), `OFFICIAL_DURATION_MS`, `PRACTICE_DURATION_MS` (Task 2).
- Produces:
  - `routing` (`defineRouting`) con `locales: ["en", "es", "pt"]` y `pathnames` `"/"` y `"/practice"`; `type Locale`.
  - `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname` (de `createNavigation`).
  - Claves de mensajes: `Metadata.{title,description}`, `Nav.{home,practice}`, `LocaleSwitcher.label`, `Home.{title,intro}`, `Practice.{title,intro}`, `TypingTest.{label,inputLabel,focusPrompt,restartHint}`, `Result.{wpm,accuracy,raw,chartLabel,mistakesTitle,noMistakes,restart,restartHint}`.
  - Las páginas `/[locale]` y `/[locale]/practice` (en esta tarea solo con H1 e intro; el test se añade en la Task 6).

**Notas para quien implementa:**
- **Lectura previa:** `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` y `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`.
- **Ubicación del layout raíz:** `src/app/[locale]/layout.tsx`. No queda ningún `src/app/layout.tsx`.
- **Cómo se resuelve el idioma:** `next/root-params` existe por defecto desde Next 16.3, y `src/i18n/request.ts` lee el idioma con `rootParams.locale()`. Con esto y `generateStaticParams` en el layout, las páginas son estáticas sin llamar a `setRequestLocale`.
- **Plugin de next-intl:** `createNextIntlPlugin()` encuentra solo `src/i18n/request.ts`.

- [ ] **Step 1: Instalar next-intl**

```bash
pnpm add next-intl@4.14.9
```

- [ ] **Step 2: Escribir el test de mensajes (falla)**

`src/i18n/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import pt from "../../messages/pt.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("mensajes", () => {
  it.each([
    ["es", es],
    ["pt", pt],
  ])("%s tiene exactamente las mismas claves que en", (_, messages) => {
    expect(keys(messages).toSorted()).toEqual(keys(en).toSorted());
  });

  it.each([
    ["en", en],
    ["es", es],
    ["pt", pt],
  ])("%s no tiene textos vacíos", (_, messages) => {
    const empty = keys(messages).filter((path) => {
      const value = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
      return typeof value !== "string" || value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
```

- [ ] **Step 3: Ejecutarlo y ver que falla**

Run: `pnpm test src/i18n`
Expected: FAIL. No se puede resolver `../../messages/en.json`.

- [ ] **Step 4: Crear los mensajes**

`messages/en.json`:

```json
{
  "Metadata": {
    "title": "QwertyRank — Typing speed test",
    "description": "How fast do you type? Take a 30-second typing test and compare your words per minute."
  },
  "Nav": {
    "home": "Test",
    "practice": "Practice"
  },
  "LocaleSwitcher": {
    "label": "Language"
  },
  "Home": {
    "title": "How fast do you type?",
    "intro": "Type the words as fast and accurately as you can. The 30-second timer starts with your first keystroke."
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
    "home": "Test",
    "practice": "Práctica"
  },
  "LocaleSwitcher": {
    "label": "Idioma"
  },
  "Home": {
    "title": "¿A qué velocidad escribes?",
    "intro": "Escribe las palabras lo más rápido y preciso que puedas. Los 30 segundos empiezan con tu primera pulsación."
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
    "home": "Teste",
    "practice": "Prática"
  },
  "LocaleSwitcher": {
    "label": "Idioma"
  },
  "Home": {
    "title": "Qual é a sua velocidade de digitação?",
    "intro": "Digite as palavras o mais rápido e com a maior precisão possível. Os 30 segundos começam na primeira tecla."
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
  }
}
```

- [ ] **Step 5: Ejecutar el test y ver que pasa**

Run: `pnpm test src/i18n`
Expected: PASS, 5 tests.

- [ ] **Step 6: Configurar next-intl**

`src/i18n/routing.ts`:

```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "pt"],
  defaultLocale: "en",
  pathnames: {
    "/": "/",
    "/practice": {
      en: "/practice",
      es: "/practica",
      pt: "/pratica",
    },
  },
});

export type Locale = (typeof routing.locales)[number];
```

`src/i18n/navigation.ts`:

```ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```

`src/i18n/request.ts`:

```ts
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  let resolved = locale;
  if (!resolved) {
    const param = await rootParams.locale();
    if (!hasLocale(routing.locales, param)) notFound();
    resolved = param;
  }
  return {
    locale: resolved,
    messages: (await import(`../../messages/${resolved}.json`)).default,
  };
});
```

`src/proxy.ts`:

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Todo excepto /api, /trpc, /_next, /_vercel y archivos con extensión (favicon.ico, etc.)
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
```

`src/global.d.ts`:

```ts
import type messages from "../messages/en.json";
import type { routing } from "./i18n/routing";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
```

`next.config.ts` (sustituye el archivo completo):

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 7: Cabecera y selector de idioma**

`src/components/locale-switcher.tsx`:

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")}>
      <ul className="flex gap-2">
        {routing.locales.map((option) => (
          <li key={option}>
            <Link
              href={pathname}
              locale={option}
              aria-current={option === locale ? "true" : undefined}
              className="rounded px-1.5 py-0.5 font-mono text-xs uppercase text-zinc-500 aria-[current]:bg-zinc-200 aria-[current]:text-zinc-900 dark:aria-[current]:bg-zinc-800 dark:aria-[current]:text-zinc-100"
            >
              {option}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`src/components/site-header.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

export function SiteHeader() {
  const t = useTranslations("Nav");

  return (
    <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4">
      <Link href="/" className="font-mono text-lg font-semibold">
        QwertyRank
      </Link>
      <div className="flex items-center gap-6 text-sm">
        <Link href="/">{t("home")}</Link>
        <Link href="/practice">{t("practice")}</Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
```

- [ ] **Step 8: Layout y páginas (sin el test todavía)**

Borra los archivos del scaffold:

```bash
rm src/app/layout.tsx src/app/page.tsx public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

`src/app/[locale]/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { routing } from "@/i18n/routing";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<LayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <SiteHeader />
          <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`src/app/[locale]/page.tsx` (versión provisional; la Task 6 añade el test):

```tsx
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Home");

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
    </>
  );
}
```

`src/app/[locale]/practice/page.tsx` (versión provisional):

```tsx
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

export default async function PracticePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Practice");

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
    </>
  );
}
```

En `src/app/globals.css`, cambia la fuente del `body` para usar Geist en lugar de Arial:

```css
body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
```

- [ ] **Step 9: Verificar build y rutas**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: sin errores. El build lista `● /en`, `● /es`, `● /pt` y `● /en/practice`, `● /es/practice`, `● /pt/practice` (SSG) y `ƒ Proxy (Middleware)`.

Después, con `pnpm start --port 3100` en otra terminal:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -H "Accept-Language: es-ES" http://localhost:3100/
curl -s http://localhost:3100/es/practica | grep -o "<h1[^>]*>[^<]*</h1>"
curl -s http://localhost:3100/pt/pratica | grep -o "<h1[^>]*>[^<]*</h1>"
```

Expected: `307 http://localhost:3100/es`, después `<h1 …>Práctica</h1>` y `<h1 …>Prática</h1>`. Para el servidor al acabar.

- [ ] **Step 10: Checkpoint (sin commit)**

Todo lo anterior en verde. Arranca `pnpm dev` y abre `http://localhost:3000/en`: la cabecera muestra "QwertyRank · Test · Practice · EN ES PT", y al cambiar de idioma estando en la práctica se pasa a `/es/practica`.

---

### Task 5: Captura de entrada y hook de la partida

**Files:**
- Create: `src/components/typing-test/input-diff.ts`, `src/components/typing-test/use-typing-session.ts`
- Test: `src/components/typing-test/input-diff.test.ts`, `src/components/typing-test/use-typing-session.test.ts`

**Interfaces:**
- Consumes: `createEngine`, `applyInput`, `isFinished`, `EngineState` (Task 1); `replay`, `TestResult` (Task 2); `TypingEvent` (Task 1).
- Produces:
  - `input-diff.ts`: `interface InputDiff { deleted: number; inserted: string }`, `diffInput(previous: string, next: string): InputDiff`, `isDeadKeyPreview(diff: InputDiff, isComposing: boolean): boolean`.
  - `use-typing-session.ts`: `type SessionStatus = "idle" | "running" | "finished"`, `interface KeyInfo { type: "down" | "up"; key: string; code: string; trusted: boolean }`, `useTypingSession({ initialWords, durationMs, nextWords, now? })`, que devuelve `{ engine: EngineState; status: SessionStatus; endsAt: number | null; result: TestResult | null; handleInput(diff: InputDiff, trusted: boolean): EngineState; handleKey(key: KeyInfo): void; restart(): void; getEvents(): readonly TypingEvent[] }`.

**Comportamiento del hook:**
- El reloj empieza con la **primera entrada de texto** (`t = 0`). Desde ese momento:
  - `status` pasa a `"running"`;
  - `endsAt = now() + durationMs`;
  - se programa `setTimeout(finish, durationMs)`.
- `finish` calcula `result = replay(words, events, durationMs)` y pasa a `"finished"`. También se llama si se escriben todas las palabras.
- Tras terminar, `handleInput` no cambia nada y `handleKey` no registra nada.
- `handleKey` solo registra mientras `status === "running"`. Esas teclas son para el anti-trampas de la fase 2 y no afectan a la puntuación.
- `restart` cancela el temporizador, pide `nextWords()`, borra los eventos y vuelve a `"idle"`.
- Se usan refs (`engineRef`, `statusRef`, `eventsRef`) para que el `setTimeout` y los manejadores nunca lean estado viejo. Las refs solo se leen dentro de manejadores, nunca durante el render (lo exige el React Compiler).
- `now` se puede inyectar para los tests; por defecto es `performance.now()`.

- [ ] **Step 1: Escribir los tests (fallan)**

`src/components/typing-test/input-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffInput, isDeadKeyPreview } from "./input-diff";

describe("diffInput", () => {
  it("detecta una letra añadida", () => {
    expect(diffInput("hol", "hola")).toEqual({ deleted: 0, inserted: "a" });
  });

  it("detecta un borrado", () => {
    expect(diffInput("hola", "hol")).toEqual({ deleted: 1, inserted: "" });
  });

  it("detecta un reemplazo (autocorrector o composición)", () => {
    expect(diffInput("cosa", "casa")).toEqual({ deleted: 3, inserted: "asa" });
  });

  it("sin cambios devuelve un diff vacío", () => {
    expect(diffInput("hola", "hola")).toEqual({ deleted: 0, inserted: "" });
  });
});

describe("isDeadKeyPreview", () => {
  it("ignora el acento suelto mientras se compone", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "´" }, true)).toBe(true);
    expect(isDeadKeyPreview({ deleted: 0, inserted: "~" }, true)).toBe(true);
  });

  it("no ignora la letra compuesta final", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "é" }, true)).toBe(false);
  });

  it("no ignora nada si no se está componiendo", () => {
    expect(isDeadKeyPreview({ deleted: 0, inserted: "´" }, false)).toBe(false);
  });
});
```

`src/components/typing-test/use-typing-session.test.ts`:

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

  function setup(words = ["hola", "mundo", "azul"], durationMs = 15_000) {
    const nextWords = vi.fn(() => ["nuevo", "texto"]);
    const hook = renderHook(() => useTypingSession({ initialWords: words, durationMs, nextWords, now }));
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
});
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `pnpm test src/components/typing-test`
Expected: FAIL. No se pueden resolver `./input-diff` ni `./use-typing-session`.

- [ ] **Step 3: Implementar**

`src/components/typing-test/input-diff.ts`:

```ts
export interface InputDiff {
  deleted: number;
  inserted: string;
}

/** Diferencia entre dos valores del input: cuántos caracteres se borraron del final y qué se añadió. */
export function diffInput(previous: string, next: string): InputDiff {
  const max = Math.min(previous.length, next.length);
  let common = 0;
  while (common < max && previous[common] === next[common]) common++;
  return { deleted: previous.length - common, inserted: next.slice(common) };
}

const DEAD_KEY_MARKS = /^[´`^¨~˜ˆ̀́̂̃̈]+$/u;

/**
 * En macOS, una tecla muerta (´ ` ^ ¨ ~) muestra el acento suelto mientras se compone
 * la letra. Ese paso intermedio no es una pulsación y no debe contar como error.
 */
export function isDeadKeyPreview(diff: InputDiff, isComposing: boolean): boolean {
  return isComposing && diff.deleted === 0 && DEAD_KEY_MARKS.test(diff.inserted);
}
```

`src/components/typing-test/use-typing-session.ts`:

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
  now?: () => number;
}

const defaultNow = () => performance.now();

/**
 * Lógica de una partida local: el reloj empieza con la primera entrada de texto,
 * termina a los `durationMs` y el resultado sale de `replay`, la misma función
 * que usará el servidor.
 */
export function useTypingSession({ initialWords, durationMs, nextWords, now = defaultNow }: Options) {
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
    setStatus("finished");
    setResult(replay(engineRef.current.words, eventsRef.current, durationMs));
  }

  function handleInput(diff: InputDiff, trusted: boolean): EngineState {
    if (statusRef.current === "finished") return engineRef.current;

    let t: number;
    if (startRef.current === null) {
      startRef.current = now();
      statusRef.current = "running";
      setStatus("running");
      setEndsAt(startRef.current + durationMs);
      timeoutRef.current = setTimeout(finish, durationMs);
      t = 0;
    } else {
      t = now() - startRef.current;
    }

    eventsRef.current.push({ t, type: "input", deleted: diff.deleted, inserted: diff.inserted, trusted });
    const next = applyInput(engineRef.current, diff.deleted, diff.inserted);
    engineRef.current = next;
    setEngine(next);
    if (isFinished(next)) finish();
    return next;
  }

  function handleKey(key: KeyInfo) {
    if (statusRef.current !== "running" || startRef.current === null) return;
    eventsRef.current.push({ t: now() - startRef.current, ...key });
  }

  function restart() {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const fresh = createEngine(nextWords());
    engineRef.current = fresh;
    statusRef.current = "idle";
    eventsRef.current = [];
    startRef.current = null;
    setEngine(fresh);
    setStatus("idle");
    setEndsAt(null);
    setResult(null);
  }

  function getEvents(): readonly TypingEvent[] {
    return [...eventsRef.current];
  }

  return { engine, status, endsAt, result, handleInput, handleKey, restart, getEvents };
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/components/typing-test`
Expected: PASS, 14 tests (7 + 7).

- [ ] **Step 5: Checkpoint (sin commit)**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: sin errores. Presta atención a los avisos de `react-hooks` (reglas del React Compiler) en `use-typing-session.ts`: debe salir limpio.

---

### Task 6: Interfaz del test y páginas completas

**Files:**
- Create: `src/components/typing-test/word.tsx`, `words-view.tsx`, `timer.tsx`, `wpm-chart.tsx`, `result-view.tsx`, `typing-test.tsx`
- Create: `src/test/render-with-intl.tsx`
- Modify: `src/app/[locale]/page.tsx`, `src/app/[locale]/practice/page.tsx`
- Test: `src/components/typing-test/typing-test.test.tsx`

**Interfaces:**
- Consumes: `useTypingSession`, `diffInput`, `isDeadKeyPreview` (Task 5); `generateWords`, `loadWordList`, `WORDS_PER_TEST`, `TestLanguage`, `getInitialWords` (Task 3); `EngineState` (Task 1); `TestResult` (Task 2); mensajes `TypingTest.*` y `Result.*` (Task 4).
- Produces:
  - `TypingTest({ language: TestLanguage; durationMs: number; initialWords: readonly string[] })`.
  - `data-testid` que usan los E2E: `typing-area`, `typing-input`, `timer`, `words`, `word` (con `data-index`, `data-word`, `data-state`), `focus-prompt`, `result`, `result-wpm`, `result-accuracy`, `result-raw`, `result-mistakes`, `wpm-chart`. Las letras llevan `data-letter` y `data-status` (`pending|correct|incorrect|extra|missed`).

**Decisiones de la interfaz** (no cambiar sin motivo):
- **Captura con un `<input>` oculto:**
  - Opacidad 0, 1 px y **`text-base`**: con 16 px iOS no hace zoom al enfocar.
  - Atributos: `autoComplete`, `autoCorrect` y `autoCapitalize="off"`, `spellCheck={false}`.
  - Pegar y soltar texto están bloqueados.
- **Conversión de cada `input` en `{ deleted, inserted }`:** se compara el valor anterior con el nuevo, normalizado a NFC.
  - Mientras se compone (`isComposing`), el valor del input no se toca, para no romper el teclado de Android.
  - Al terminar de componer, el input se iguala a lo que el motor tiene en la palabra actual.
- **`Word` va memoizado:** al teclear solo cambian las props de la palabra activa.
- **El cursor y el desplazamiento de líneas se calculan en `useLayoutEffect`,** escribiendo directamente `style.transform`, sin estado de React. Así ninguna pulsación provoca un segundo render.
- **Altura del texto:** 3 líneas de 2,5 rem (`h-30`), con la palabra activa en la segunda línea.
- **`Timer`:** actualiza con `requestAnimationFrame`, pero solo cambia de estado cuando cambia el segundo.
- **Atajos:** Tab reinicia siempre; Enter solo desde el resultado.
- **Gráfica:** SVG sin librerías, con `preserveAspectRatio="none"` y `vectorEffect="non-scaling-stroke"` para que ocupe todo el ancho sin deformar la línea.
- **Siguientes partidas:** la lista de palabras del idioma se carga en diferido al montar, y `restart` la usa. Si aún no ha llegado, reutiliza las palabras iniciales.

- [ ] **Step 1: Helper de render con next-intl**

`src/test/render-with-intl.tsx`:

```tsx
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import messages from "../../messages/en.json";

export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}
```

- [ ] **Step 2: Escribir los tests del componente (fallan)**

`src/components/typing-test/typing-test.test.tsx`:

```tsx
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { TypingTest } from "./typing-test";

const WORDS = ["hola", "mundo", "azul", "casa"];

function setup(durationMs = 15_000) {
  renderWithIntl(<TypingTest language="es" durationMs={durationMs} initialWords={WORDS} />);
  return screen.getByTestId("typing-input") as HTMLInputElement;
}

/** Simula escribir carácter a carácter como lo hace el navegador: cambia el valor y dispara `input`. */
function typeText(input: HTMLInputElement, text: string) {
  for (const char of text) {
    fireEvent.input(input, { target: { value: input.value + char } });
  }
}

function letterStatuses(wordIndex: number) {
  const word = screen.getAllByTestId("word")[wordIndex];
  return [...word.querySelectorAll("[data-letter]")].map((el) => el.getAttribute("data-status"));
}

describe("TypingTest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("muestra las palabras iniciales y el tiempo completo", () => {
    setup();
    const words = screen.getAllByTestId("word");
    expect(words).toHaveLength(WORDS.length);
    expect(words[0]).toHaveAttribute("data-word", "hola");
    expect(screen.getByTestId("timer")).toHaveTextContent("15");
  });

  it("marca las letras correctas e incorrectas mientras se escribe", () => {
    const input = setup();
    typeText(input, "hp");
    expect(letterStatuses(0)).toEqual(["correct", "incorrect", "pending", "pending"]);
  });

  it("el espacio pasa a la palabra siguiente y vacía el input", () => {
    const input = setup();
    typeText(input, "hola ");
    expect(screen.getAllByTestId("word")[1]).toHaveAttribute("data-state", "active");
    expect(input.value).toBe("");
  });

  it("borrar con retroceso corrige la letra", () => {
    const input = setup();
    typeText(input, "hp");
    fireEvent.input(input, { target: { value: "h" } });
    typeText(input, "o");
    expect(letterStatuses(0)).toEqual(["correct", "correct", "pending", "pending"]);
  });

  it("no cuenta como error el acento suelto de una tecla muerta", () => {
    renderWithIntl(<TypingTest language="es" durationMs={15_000} initialWords={["más"]} />);
    const input = screen.getByTestId("typing-input") as HTMLInputElement;
    typeText(input, "m");
    fireEvent.input(input, { target: { value: "m´" }, isComposing: true });
    fireEvent.input(input, { target: { value: "má" }, isComposing: false });
    typeText(input, "s ");
    expect(screen.getByTestId("result")).toBeInTheDocument();
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("100%");
  });

  it("muestra el resultado al acabar el tiempo", () => {
    const input = setup();
    typeText(input, "hola mundo ");
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByTestId("result")).toBeInTheDocument();
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("100%");
    expect(screen.getByTestId("wpm-chart")).toBeInTheDocument();
    expect(input).toHaveAttribute("readonly");
  });

  it("Tab reinicia a mitad de partida", () => {
    const input = setup();
    typeText(input, "ho");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
    expect(input.value).toBe("");
    expect(letterStatuses(0).every((status) => status === "pending")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
  });

  it("Enter reinicia desde el resultado", () => {
    const input = setup();
    typeText(input, "h");
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
    expect(screen.getByTestId("timer")).toHaveTextContent("15");
  });

  it("Enter durante la partida no reinicia", () => {
    const input = setup();
    typeText(input, "ho");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(letterStatuses(0)).toEqual(["correct", "correct", "pending", "pending"]);
  });

  it("al perder el foco avisa, pero el tiempo sigue corriendo", () => {
    const input = setup();
    fireEvent.focus(input);
    typeText(input, "ho");
    fireEvent.blur(input);
    expect(screen.getByTestId("focus-prompt")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByTestId("result")).toBeInTheDocument();
  });

  it("bloquea pegar texto", () => {
    const input = setup();
    const notCancelled = fireEvent.paste(input, { clipboardData: { getData: () => "hola mundo" } });
    expect(notCancelled).toBe(false);
  });
});
```

- [ ] **Step 3: Ejecutarlos y ver que fallan**

Run: `pnpm test src/components/typing-test/typing-test.test.tsx`
Expected: FAIL. No se puede resolver `./typing-test`.

- [ ] **Step 4: Implementar los componentes**

`src/components/typing-test/word.tsx`:

```tsx
import { memo } from "react";

export type WordState = "done" | "active" | "pending";
type LetterStatus = "pending" | "correct" | "incorrect" | "extra" | "missed";

const LETTER_CLASS: Record<LetterStatus, string> = {
  pending: "text-zinc-400 dark:text-zinc-500",
  correct: "text-zinc-900 dark:text-zinc-100",
  incorrect: "text-red-600 dark:text-red-400",
  extra: "text-red-800 opacity-70 dark:text-red-300",
  missed: "text-zinc-400 dark:text-zinc-500",
};

interface WordProps {
  index: number;
  target: string;
  typed: string;
  state: WordState;
}

function letterStatus(expected: string | undefined, actual: string | undefined, state: WordState): LetterStatus {
  if (actual === undefined) return state === "done" ? "missed" : "pending";
  if (expected === undefined) return "extra";
  return actual === expected ? "correct" : "incorrect";
}

/** Una palabra del texto. Memoizada: al teclear solo se vuelve a pintar la palabra activa. */
export const Word = memo(function Word({ index, target, typed, state }: WordProps) {
  const length = Math.max(target.length, typed.length);
  const letters = [];
  for (let i = 0; i < length; i++) {
    const status = letterStatus(target[i], typed[i], state);
    letters.push(
      <span key={i} data-letter="" data-status={status} className={LETTER_CLASS[status]}>
        {status === "extra" ? typed[i] : target[i]}
      </span>,
    );
  }
  const wrong = state === "done" && typed !== target;
  return (
    <div
      data-testid="word"
      data-index={index}
      data-word={target}
      data-state={state}
      className={`relative mr-[1ch] h-10 leading-10 ${wrong ? "underline decoration-red-500" : ""}`}
    >
      {letters}
    </div>
  );
});
```

`src/components/typing-test/words-view.tsx`:

```tsx
"use client";

import { useLayoutEffect, useRef } from "react";
import type { EngineState } from "@/lib/scoring/engine";
import { Word } from "./word";

/**
 * Muestra 3 líneas de texto. Mantiene la palabra activa en la segunda línea y
 * mueve el cursor con `transform`, sin volver a pintar las palabras.
 */
export function WordsView({ engine }: { engine: EngineState }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const caret = caretRef.current;
    if (!inner || !caret) return;
    const word = inner.querySelector<HTMLElement>(`[data-index="${engine.current}"]`);
    if (!word) return;

    const lineHeight = word.offsetHeight;
    const scroll = Math.max(0, word.offsetTop - lineHeight);
    inner.style.transform = `translateY(${-scroll}px)`;

    const letters = word.querySelectorAll<HTMLElement>("[data-letter]");
    const typedLength = engine.typed[engine.current]?.length ?? 0;
    const next = letters[typedLength];
    const last = letters[letters.length - 1];
    const left = next
      ? word.offsetLeft + next.offsetLeft
      : last
        ? word.offsetLeft + last.offsetLeft + last.offsetWidth
        : word.offsetLeft;
    caret.style.transform = `translate(${left}px, ${word.offsetTop - scroll}px)`;
  });

  return (
    <div className="relative h-30 overflow-hidden font-mono text-2xl" data-testid="words">
      <div
        ref={innerRef}
        className="relative flex flex-wrap transition-transform duration-100 motion-reduce:transition-none"
      >
        {engine.words.map((word, index) => (
          <Word
            key={index}
            index={index}
            target={word}
            typed={engine.typed[index] ?? ""}
            state={index < engine.current ? "done" : index === engine.current ? "active" : "pending"}
          />
        ))}
      </div>
      <span
        ref={caretRef}
        aria-hidden="true"
        className="absolute left-0 top-1 h-8 w-0.5 bg-amber-500 transition-transform duration-75 motion-reduce:transition-none"
      />
    </div>
  );
}
```

`src/components/typing-test/timer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

const defaultNow = () => performance.now();

/** Segundos restantes. Se actualiza solo, sin hacer que se vuelva a pintar el texto. */
export function Timer({
  endsAt,
  durationMs,
  now = defaultNow,
}: {
  endsAt: number | null;
  durationMs: number;
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
    <span data-testid="timer" className="font-mono text-2xl tabular-nums text-amber-600 dark:text-amber-400">
      {seconds}
    </span>
  );
}
```

`src/components/typing-test/wpm-chart.tsx`:

```tsx
const WIDTH = 600;
const HEIGHT = 160;
const PADDING = 8;

/** Gráfica de PPM por segundo, en SVG para no añadir dependencias. */
export function WpmChart({ perSecond, label }: { perSecond: readonly number[]; label: string }) {
  const max = Math.max(10, ...perSecond);
  const points = perSecond
    .map((value, i) => {
      const x =
        perSecond.length === 1
          ? WIDTH / 2
          : PADDING + (i * (WIDTH - 2 * PADDING)) / (perSecond.length - 1);
      const y = HEIGHT - PADDING - (value / max) * (HEIGHT - 2 * PADDING);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      data-testid="wpm-chart"
      className="h-40 w-full text-amber-500"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

`src/components/typing-test/result-view.tsx`:

```tsx
import { useTranslations } from "next-intl";
import type { TestResult } from "@/lib/scoring/replay";
import { WpmChart } from "./wpm-chart";

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd data-testid={testId} className="font-mono text-4xl font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export function ResultView({ result, onRestart }: { result: TestResult; onRestart: () => void }) {
  const t = useTranslations("Result");
  const mistakes = Object.entries(result.mistakes)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div data-testid="result" role="status" aria-live="polite" className="flex flex-col gap-6">
      <dl className="grid grid-cols-3 gap-4">
        <Stat label={t("wpm")} value={String(Math.round(result.wpm))} testId="result-wpm" />
        <Stat label={t("accuracy")} value={`${Math.floor(result.accuracy)}%`} testId="result-accuracy" />
        <Stat label={t("raw")} value={String(Math.round(result.rawWpm))} testId="result-raw" />
      </dl>
      <WpmChart perSecond={result.perSecond} label={t("chartLabel")} />
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("mistakesTitle")}</h2>
        {mistakes.length === 0 ? (
          <p>{t("noMistakes")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="result-mistakes">
            {mistakes.map(([char, count]) => (
              <li key={char} className="rounded bg-zinc-100 px-2 py-1 font-mono dark:bg-zinc-800">
                <kbd>{char}</kbd> ×{count}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-md bg-amber-500 px-4 py-2 font-medium text-zinc-950 hover:bg-amber-400"
        >
          {t("restart")}
        </button>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("restartHint")}</span>
      </div>
    </div>
  );
}
```

`src/components/typing-test/typing-test.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { generateWords } from "@/lib/words/generate";
import { WORDS_PER_TEST, type TestLanguage } from "@/lib/words/languages";
import { loadWordList } from "@/lib/words/load";
import { diffInput, isDeadKeyPreview } from "./input-diff";
import { ResultView } from "./result-view";
import { Timer } from "./timer";
import { useTypingSession } from "./use-typing-session";
import { WordsView } from "./words-view";

export interface TypingTestProps {
  language: TestLanguage;
  durationMs: number;
  initialWords: readonly string[];
}

export function TypingTest({ language, durationMs, initialWords }: TypingTestProps) {
  const t = useTranslations("TypingTest");
  const listRef = useRef<readonly string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastValueRef = useRef("");
  const [focused, setFocused] = useState(false);

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
    lastValueRef.current = "";
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }

  function onInput(event: FormEvent<HTMLInputElement>) {
    const element = event.currentTarget;
    const composing = (event.nativeEvent as InputEvent).isComposing === true;
    const next = element.value.normalize("NFC");
    const diff = diffInput(lastValueRef.current, next);
    if (isDeadKeyPreview(diff, composing)) return;
    if (diff.deleted === 0 && diff.inserted === "") {
      lastValueRef.current = next;
      return;
    }
    const state = session.handleInput(diff, event.nativeEvent.isTrusted);
    if (composing) {
      lastValueRef.current = next;
      return;
    }
    const expected = state.typed[state.current] ?? "";
    if (element.value !== expected) element.value = expected;
    lastValueRef.current = expected;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab" || (event.key === "Enter" && session.status === "finished")) {
      event.preventDefault();
      restart();
      return;
    }
    session.handleKey({ type: "down", key: event.key, code: event.code, trusted: event.nativeEvent.isTrusted });
  }

  function onKeyUp(event: KeyboardEvent<HTMLInputElement>) {
    session.handleKey({ type: "up", key: event.key, code: event.code, trusted: event.nativeEvent.isTrusted });
  }

  return (
    <section
      aria-label={t("label")}
      data-testid="typing-area"
      className="relative flex flex-col gap-4"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center justify-between">
        <Timer endsAt={session.endsAt} durationMs={durationMs} />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("restartHint")}</span>
      </div>

      {session.status === "finished" && session.result ? (
        <ResultView result={session.result} onRestart={restart} />
      ) : (
        <div className="relative">
          <div className={focused ? "" : "opacity-40 blur-[2px]"}>
            <WordsView engine={session.engine} />
          </div>
          {!focused && (
            <p
              data-testid="focus-prompt"
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-center font-medium"
            >
              {t("focusPrompt")}
            </p>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        data-testid="typing-input"
        aria-label={t("inputLabel")}
        type="text"
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        readOnly={session.status === "finished"}
        className="absolute left-0 top-0 h-px w-px text-base opacity-0"
        onInput={onInput}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onPaste={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </section>
  );
}
```

- [ ] **Step 5: Ejecutar y ver que pasan**

Run: `pnpm test src/components/typing-test`
Expected: PASS, 25 tests (7 + 7 + 11).

- [ ] **Step 6: Añadir el test a las páginas**

`src/app/[locale]/page.tsx` (versión final):

```tsx
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TypingTest } from "@/components/typing-test/typing-test";
import { routing } from "@/i18n/routing";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import { getInitialWords } from "@/lib/words/initial-words";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Home");
  const initialWords = await getInitialWords(locale);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <TypingTest language={locale} durationMs={OFFICIAL_DURATION_MS} initialWords={initialWords} />
      <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
    </>
  );
}
```

`src/app/[locale]/practice/page.tsx` (versión final):

```tsx
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TypingTest } from "@/components/typing-test/typing-test";
import { routing } from "@/i18n/routing";
import { PRACTICE_DURATION_MS } from "@/lib/scoring/durations";
import { getInitialWords } from "@/lib/words/initial-words";

export default async function PracticePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations("Practice");
  const initialWords = await getInitialWords(locale);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <TypingTest language={locale} durationMs={PRACTICE_DURATION_MS} initialWords={initialWords} />
      <p className="text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
    </>
  );
}
```

- [ ] **Step 7: Verificar**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: sin errores; 73 tests en verde; las 6 páginas siguen siendo `●` (SSG).

Comprobación manual con `pnpm dev` en `http://localhost:3000/es/practica`:
1. El cursor parpadea al principio y, al escribir, las letras se ponen en negro o en rojo.
2. Al terminar una línea, el texto sube y la palabra activa queda en la segunda línea.
3. A los 15 s aparece el resultado con la gráfica a todo el ancho.
4. Tab o Enter empiezan otra partida.
5. Con el teclado en español de macOS, escribe "más" (´ + a): la precisión debe seguir en 100 %.

- [ ] **Step 8: Checkpoint (sin commit)**

Todo en verde.

---

### Task 7: Tests E2E y verificación final

**Files:**
- Modify: `package.json` (dependencia `@playwright/test`, script `test:e2e`), `.gitignore`
- Create: `playwright.config.ts`, `e2e/practice.spec.ts`, `e2e/i18n.spec.ts`

**Interfaces:**
- Consumes: los `data-testid` de la Task 6, las rutas y los textos de la Task 4.
- Produces: `pnpm test:e2e`, que ejecuta 7 escenarios en 2 proyectos (escritorio y Pixel 7): 14 tests.

- [ ] **Step 1: Instalar Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

En `package.json`, añade el script:

```json
"test:e2e": "playwright test"
```

Al final de `.gitignore`, añade:

```gitignore
# playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

- [ ] **Step 2: Configurar Playwright**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

- [ ] **Step 3: Escribir los E2E**

`e2e/practice.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("una partida de práctica termina con resultado y Tab reinicia", async ({ page }) => {
  await page.goto("/en/practice");
  await expect(page.getByTestId("timer")).toHaveText("15");

  const words = await page
    .getByTestId("word")
    .evaluateAll((elements) => elements.slice(0, 8).map((el) => el.getAttribute("data-word")));
  await page.getByTestId("typing-area").click();
  await page.keyboard.type(`${words.join(" ")} `, { delay: 20 });

  await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-accuracy")).toHaveText("100%");
  expect(Number(await page.getByTestId("result-wpm").textContent())).toBeGreaterThan(0);

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("result")).toBeHidden();
  await expect(page.getByTestId("timer")).toHaveText("15");
});

test("los errores se marcan y aparecen en el resultado", async ({ page }) => {
  await page.goto("/en/practice");
  const first = await page.getByTestId("word").first().getAttribute("data-word");
  await page.getByTestId("typing-area").click();
  await page.keyboard.type("q".repeat(first!.length) + " ", { delay: 20 });
  await expect(page.getByTestId("word").first()).toHaveAttribute("data-state", "done");

  await expect(page.getByTestId("result")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-accuracy")).toHaveText("0%");
  await expect(page.getByTestId("result-mistakes")).toBeVisible();
});
```

`e2e/i18n.spec.ts`:

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

test("el texto inicial está en el idioma de la página", async ({ page }) => {
  await page.goto("/es");
  const words = await page.getByTestId("word").evaluateAll((els) => els.map((el) => el.getAttribute("data-word")));
  expect(words).toHaveLength(160);
  expect(words.some((word) => /[áéíóúñ]/.test(word ?? ""))).toBe(true);
});
```

- [ ] **Step 4: Ejecutar los E2E**

Run: `pnpm test:e2e`
Expected: 14 passed. Los de práctica tardan ~15 s cada uno porque esperan la partida completa.

Si un E2E falla, usa `superpowers:systematic-debugging` antes de cambiar nada. `pnpm exec playwright show-trace` sirve para ver la traza.

- [ ] **Step 5: Verificación final de la fase**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`
Expected: todo en verde; 73 tests unitarios y 14 E2E.

- [ ] **Step 6: Prueba en dispositivos reales (manual, la hace el usuario)**

Playwright emula el móvil, pero no usa un teclado virtual real. Con `pnpm dev --hostname 0.0.0.0`, desde un móvil en la misma red:
1. **Android (Chrome + Gboard):** las letras aparecen una a una mientras escribes, no solo al pulsar espacio, y el espacio pasa a la palabra siguiente.
2. **iPhone (Safari):** al tocar el texto se abre el teclado, la página no hace zoom y el texto queda visible por encima del teclado.
3. **En ambos:** las tildes (á, ñ, ã, ç) cuentan como correctas.

Anota lo que falle para corregirlo antes de la fase 2.

- [ ] **Step 7: Checkpoint final (sin commit)**

Comunica al usuario el resultado de cada comando y los fallos encontrados en dispositivos reales. No hagas commit: lo pedirá el usuario.

---

## Fuera de esta fase

- Partida con servidor, botón Empezar, cuenta atrás y envío de pulsaciones (fase 2).
- Cuentas, rankings y selector de idioma del test (fase 3).
- Anti-trampas completo (fase 4).
- Metadatos SEO completos, `hreflang`, sitemap, guías, listas de ~1.000 palabras y CI en GitHub Actions (fase 5).
