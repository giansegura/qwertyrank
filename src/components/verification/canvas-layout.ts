/**
 * Colocación del texto de la partida de verificación en el `canvas` (spec 4b §3.2), sin DOM: la misma
 * medida que `WordsView` (`text-2xl`, líneas de 40 px, tres a la vista y la activa en la segunda).
 */

export const FONT_SIZE = 24;
export const LINE_HEIGHT = 40;
export const VISIBLE_LINES = 3;

export type Measure = (text: string) => number;

/** Un trozo de una palabra en una línea: casi siempre la palabra entera; una más ancha que la línea se parte. */
export interface Segment {
  word: number;
  /** Letras [start, end) del texto de la palabra. */
  start: number;
  end: number;
  line: number;
  x: number;
}

/** Lo que se dibuja de una palabra: el objetivo y, detrás, las letras de más que se hayan tecleado. */
export function displayText(target: string, typed: string): string {
  return typed.length > target.length ? target + typed.slice(target.length) : target;
}

/**
 * Ajuste de línea: cada palabra va a la línea siguiente si no cabe en la actual. Una palabra más ancha
 * que la línea empieza en una nueva y se parte por letras (a 360 px, con palabras largas).
 */
export function layoutSegments(texts: readonly string[], measure: Measure, maxWidth: number): Segment[] {
  const space = measure(" ");
  const segments: Segment[] = [];
  let line = 0;
  let x = 0;
  texts.forEach((text, word) => {
    const width = measure(text);
    if (width <= maxWidth) {
      if (x > 0 && x + width > maxWidth) {
        line++;
        x = 0;
      }
      segments.push({ word, start: 0, end: text.length, line, x });
      x += width + space;
      return;
    }
    if (x > 0) {
      line++;
      x = 0;
    }
    let start = 0;
    while (start < text.length) {
      let end = start + 1;
      while (end < text.length && measure(text.slice(start, end + 1)) <= maxWidth) end++;
      segments.push({ word, start, end, line, x: 0 });
      if (end < text.length) line++;
      else x = measure(text.slice(start, end)) + space;
      start = end;
    }
  });
  return segments;
}

/** Dónde va el cursor: en la palabra `current`, tras `index` letras. Al acabar el texto, tras la última. */
export function caretPosition(
  segments: readonly Segment[],
  texts: readonly string[],
  current: number,
  index: number,
  measure: Measure,
): { line: number; x: number } {
  const own = segments.filter((segment) => segment.word === current);
  const last = segments.at(-1);
  if (own.length === 0) return last ? { line: last.line, x: last.x + measure(texts[last.word].slice(last.start, last.end)) } : { line: 0, x: 0 };
  const segment = own.find((candidate) => index < candidate.end) ?? own[own.length - 1];
  return { line: segment.line, x: segment.x + measure(texts[current].slice(segment.start, Math.min(index, segment.end))) };
}

/** Primera línea a la vista: la del cursor queda en la segunda (como `WordsView`). */
export function firstVisibleLine(caretLine: number): number {
  return Math.max(0, caretLine - 1);
}

/**
 * Tamaño del lienzo en píxeles del dispositivo: con `devicePixelRatio` 2 o 3 se dibuja a esa resolución
 * y se escala, para que el texto se vea nítido.
 */
export function canvasSize(cssWidth: number, cssHeight: number, dpr: number): { width: number; height: number; scale: number } {
  const scale = dpr > 0 ? dpr : 1;
  return { width: Math.round(cssWidth * scale), height: Math.round(cssHeight * scale), scale };
}
