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
