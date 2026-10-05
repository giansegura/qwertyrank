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
