"use client";

import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EngineState } from "@/lib/scoring/engine";
import { letterStatus, type LetterStatus, type WordState } from "../typing-test/letter-status";
import {
  FONT_SIZE,
  LINE_HEIGHT,
  VISIBLE_LINES,
  canvasSize,
  caretPosition,
  displayText,
  firstVisibleLine,
  layoutSegments,
} from "./canvas-layout";

type Palette = Record<LetterStatus | "caret", string>;

// Los colores de `Word` (zinc, rojo y ámbar de Tailwind), en claro y en oscuro.
const LIGHT: Palette = {
  pending: "#a1a1aa",
  missed: "#a1a1aa",
  correct: "#18181b",
  incorrect: "#dc2626",
  extra: "#991b1b",
  caret: "#f59e0b",
};
const DARK: Palette = {
  pending: "#71717a",
  missed: "#71717a",
  correct: "#f4f4f5",
  incorrect: "#f87171",
  extra: "#fca5a5",
  caret: "#f59e0b",
};

/**
 * Espera a que la fuente esté cargada: medir con la de reserva y redibujar con la buena movería el
 * texto a mitad de partida. Sin `document.fonts` (navegadores antiguos, jsdom), al momento.
 */
export async function fontReady(font: string): Promise<void> {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts) return;
  await fonts.load(font).catch(() => []);
  await fonts.ready;
}

/** Dibuja las tres líneas a la vista, con cada letra de su color y el cursor. */
export function paintWords(
  context: CanvasRenderingContext2D,
  engine: EngineState,
  { width, font, scale, palette }: { width: number; font: string; scale: number; palette: Palette },
): void {
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, LINE_HEIGHT * VISIBLE_LINES);
  context.font = font;
  context.textBaseline = "middle";
  const measure = (text: string) => context.measureText(text).width;
  const texts = engine.words.map((target, index) => displayText(target, engine.typed[index] ?? ""));
  const segments = layoutSegments(texts, measure, width);
  const caret = caretPosition(segments, texts, engine.current, engine.typed[engine.current]?.length ?? 0, measure);
  const first = firstVisibleLine(caret.line);

  for (const segment of segments) {
    if (segment.line < first || segment.line >= first + VISIBLE_LINES) continue;
    const y = (segment.line - first) * LINE_HEIGHT + LINE_HEIGHT / 2;
    const target = engine.words[segment.word];
    const typed = engine.typed[segment.word] ?? "";
    const state: WordState = segment.word < engine.current ? "done" : segment.word === engine.current ? "active" : "pending";
    const text = texts[segment.word];
    for (let i = segment.start; i < segment.end; i++) {
      context.fillStyle = palette[letterStatus(target[i], typed[i], state)];
      context.fillText(text[i], segment.x + measure(text.slice(segment.start, i)), y);
    }
  }
  context.fillStyle = palette.caret;
  context.fillRect(caret.x, (caret.line - first) * LINE_HEIGHT + 4, 2, LINE_HEIGHT - 8);
}

/**
 * El texto de la partida de verificación dibujado en un `canvas` (spec 4b §3.2): no está en el DOM,
 * así que las extensiones que leen la página no lo ven. Se teclea en el mismo campo oculto de siempre.
 */
export function CanvasWords({ engine }: { engine: EngineState }) {
  const t = useTranslations("Verification");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [font, setFont] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    // La familia de `font-mono` (Geist Mono y su reserva), la misma que el texto de Ranked.
    const spec = `${FONT_SIZE}px ${getComputedStyle(canvas).fontFamily || "monospace"}`;
    void fontReady(spec).then(() => {
      if (active) setFont(spec);
    });
    const readWidth = () => {
      if (active) setWidth(canvas.clientWidth);
    };
    const first = setTimeout(readWidth, 0);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(readWidth);
    observer?.observe(canvas);
    return () => {
      active = false;
      clearTimeout(first);
      observer?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || font === null || width === 0) return;
    const size = canvasSize(width, LINE_HEIGHT * VISIBLE_LINES, window.devicePixelRatio);
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    paintWords(context, engine, { width, font, scale: size.scale, palette: dark ? DARK : LIGHT });
  }, [engine, font, width]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="verify-canvas"
      data-ready={font !== null && width > 0 ? "true" : "false"}
      role="img"
      aria-label={t("canvasLabel")}
      className="block h-30 w-full font-mono"
    />
  );
}
