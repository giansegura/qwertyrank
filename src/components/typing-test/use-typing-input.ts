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
  /** Tab without modifiers. */
  onRestart: () => void;
  /** Enter. */
  onEnter?: () => void;
  /** Space. Returns `true` if it used it (e.g. to start a Ranked game). */
  onSpace?: () => boolean;
}

const prevent = (event: { preventDefault(): void }) => event.preventDefault();

/**
 * Keyboard capture with a hidden `<input>`: turns each change into `{ deleted, inserted }`,
 * filters dead keys, respects mobile keyboard composition and manages focus.
 */
export function useTypingInput({ target, onRestart, onEnter, onSpace }: Options) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastValueRef = useRef("");
  const deadKeyRef = useRef(false);
  const [focused, setFocused] = useState(false);

  // Focuses on load only with a mouse or trackpad: on mobile, focusing without the user tapping
  // does not open the keyboard and would hide the "tap to start" notice. If the input already had
  // focus before hydration (an early click), React did not see the `focus` event: it is removed
  // and given again so that `onFocus` notices.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const alreadyFocused = document.activeElement === input;
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
    if (!alreadyFocused && !finePointer) return;
    if (alreadyFocused) input.blur();
    input.focus({ preventScroll: true });
  }, []);

  /** Feeds the engine whatever changed in the input since the last time. */
  function processValue(element: HTMLInputElement, composing: boolean, trusted: boolean, at: number) {
    const next = element.value.normalize("NFC");
    const diff = diffInput(lastValueRef.current, next);
    if (isDeadKeyPreview(diff, composing, deadKeyRef.current)) return;
    const changed = diff.deleted > 0 || diff.inserted !== "";
    const state = changed ? target.handleInput(diff, trusted, at) : target.engine;
    if (composing) {
      // While composing (Android keyboards) the value is not touched: it would break the IME.
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

  // When a composition ends, the input returns to the engine's current word. Otherwise the
  // keyboard would keep editing text of already confirmed words.
  function onCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    processValue(event.currentTarget, false, event.nativeEvent.isTrusted, eventTime(event.timeStamp));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    deadKeyRef.current = event.key === "Dead";
    // Only Tab without modifiers restarts: Shift+Tab still works to leave with the keyboard.
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

  /** Empties the input and focuses it: when starting a new game. */
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
