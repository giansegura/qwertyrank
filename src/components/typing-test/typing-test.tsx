"use client";

import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
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

  /** Lleva al motor lo que haya cambiado en el input desde la última vez. */
  function processValue(element: HTMLInputElement, composing: boolean, trusted: boolean) {
    const next = element.value.normalize("NFC");
    const diff = diffInput(lastValueRef.current, next);
    if (isDeadKeyPreview(diff, composing, deadKeyRef.current)) return;
    const changed = diff.deleted > 0 || diff.inserted !== "";
    const state = changed ? session.handleInput(diff, trusted) : session.engine;
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
    processValue(event.currentTarget, composing, event.nativeEvent.isTrusted);
  }

  // Al acabar una composición, el input vuelve a la palabra actual del motor. Si no, el
  // teclado seguiría editando texto de palabras ya confirmadas.
  function onCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    processValue(event.currentTarget, false, event.nativeEvent.isTrusted);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    deadKeyRef.current = event.key === "Dead";
    // Solo Tab sin modificadores reinicia: Mayús+Tab sigue sirviendo para salir con el teclado.
    const plainTab =
      event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (plainTab || (event.key === "Enter" && session.status === "finished")) {
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

      {/* Altura reservada para el resultado (hasta ~27rem en móvil con la lista de fallos
          en dos líneas): así, al terminar, el contenido de debajo no salta (CLS = 0). */}
      <div className="min-h-[28rem]">
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
      </div>

      <input
        ref={inputRef}
        data-testid="typing-input"
        aria-label={t("inputLabel")}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        readOnly={session.status === "finished"}
        className="absolute left-0 top-0 h-px w-px text-base opacity-0"
        onInput={onInput}
        onCompositionEnd={onCompositionEnd}
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
