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
 * Con `afterDeadKey` (el último keydown fue `"Dead"`) se acepta cualquier carácter
 * suelto: así se cubren distribuciones como US-Internacional, que usan ' y ".
 */
export function isDeadKeyPreview(diff: InputDiff, isComposing: boolean, afterDeadKey = false): boolean {
  if (!isComposing || diff.deleted !== 0) return false;
  if (DEAD_KEY_MARKS.test(diff.inserted)) return true;
  return afterDeadKey && [...diff.inserted].length === 1;
}
