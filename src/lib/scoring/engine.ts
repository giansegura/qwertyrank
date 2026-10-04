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
