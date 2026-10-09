/** Picks `count` random words from `list`, without repeating the same one twice in a row. */
export function generateWords(
  list: readonly string[],
  count: number,
  random: () => number,
): string[] {
  if (list.length === 0) throw new Error("The word list is empty");
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    let index = Math.min(list.length - 1, Math.floor(random() * list.length));
    if (list.length > 1 && list[index] === words[i - 1]) index = (index + 1) % list.length;
    words.push(list[index]);
  }
  return words;
}
