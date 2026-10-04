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
