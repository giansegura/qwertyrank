import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl, withIntl } from "@/test/render-with-intl";
import { TypingTest } from "./typing-test";

const WORDS = ["hola", "mundo", "azul", "casa"];

function setup(durationMs = 15_000) {
  renderWithIntl(<TypingTest language="es" durationMs={durationMs} initialWords={WORDS} />);
  return screen.getByTestId("typing-input") as HTMLInputElement;
}

/** Simulates typing character by character the way the browser does: changes the value and fires `input`. */
function typeText(input: HTMLInputElement, text: string) {
  for (const char of text) {
    fireEvent.input(input, { target: { value: input.value + char } });
  }
}

function letterStatuses(wordIndex: number) {
  const word = screen.getAllByTestId("word")[wordIndex];
  return [...word.querySelectorAll("[data-letter]")].map((el) => el.getAttribute("data-status"));
}

describe("TypingTest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the initial words and the full time", () => {
    setup();
    const words = screen.getAllByTestId("word");
    expect(words).toHaveLength(WORDS.length);
    expect(words[0]).toHaveAttribute("data-word", "hola");
    expect(screen.getByTestId("timer")).toHaveTextContent("15");
  });

  it("marks correct and incorrect letters while typing", () => {
    const input = setup();
    typeText(input, "hp");
    expect(letterStatuses(0)).toEqual(["correct", "incorrect", "pending", "pending"]);
  });

  it("space moves to the next word and empties the input", () => {
    const input = setup();
    typeText(input, "hola ");
    expect(screen.getAllByTestId("word")[1]).toHaveAttribute("data-state", "active");
    expect(input.value).toBe("");
  });

  it("deleting with backspace corrects the letter", () => {
    const input = setup();
    typeText(input, "hp");
    fireEvent.input(input, { target: { value: "h" } });
    typeText(input, "o");
    expect(letterStatuses(0)).toEqual(["correct", "correct", "pending", "pending"]);
  });

  it("does not count the standalone accent of a dead key as an error", () => {
    renderWithIntl(<TypingTest language="es" durationMs={15_000} initialWords={["más"]} />);
    const input = screen.getByTestId("typing-input") as HTMLInputElement;
    typeText(input, "m");
    fireEvent.input(input, { target: { value: "m´" }, isComposing: true });
    fireEvent.input(input, { target: { value: "má" }, isComposing: false });
    typeText(input, "s ");
    expect(screen.getByTestId("result")).toBeInTheDocument();
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("100%");
  });

  it("shows the result when time runs out", () => {
    const input = setup();
    typeText(input, "hola mundo ");
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByTestId("result")).toBeInTheDocument();
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("100%");
    expect(screen.getByTestId("wpm-chart")).toBeInTheDocument();
    expect(input).toHaveAttribute("readonly");
  });

  it("Tab restarts mid-game", () => {
    const input = setup();
    typeText(input, "ho");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
    expect(input.value).toBe("");
    expect(letterStatuses(0).every((status) => status === "pending")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
  });

  it("Enter restarts from the result", () => {
    const input = setup();
    typeText(input, "h");
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
    expect(screen.getByTestId("timer")).toHaveTextContent("15");
  });

  it("Enter during the game does not restart", () => {
    const input = setup();
    typeText(input, "ho");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(letterStatuses(0)).toEqual(["correct", "correct", "pending", "pending"]);
  });

  it("on losing focus shows a notice, but the time keeps running", () => {
    const input = setup();
    fireEvent.focus(input);
    typeText(input, "ho");
    fireEvent.blur(input);
    expect(screen.getByTestId("focus-prompt")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByTestId("result")).toBeInTheDocument();
  });

  it("blocks pasting text", () => {
    const input = setup();
    const notCancelled = fireEvent.paste(input, { clipboardData: { getData: () => "hola mundo" } });
    expect(notCancelled).toBe(false);
  });

  it("if the input already had focus before hydration, does not show the focus notice", () => {
    const ui = withIntl(<TypingTest language="es" durationMs={15_000} initialWords={WORDS} />);
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(ui);
    container.querySelector<HTMLInputElement>("[data-testid=typing-input]")!.focus();
    render(ui, { container, hydrate: true });
    expect(screen.queryByTestId("focus-prompt")).not.toBeInTheDocument();
  });

  it("on desktop focuses the input on load", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)" }));
    const input = setup();
    expect(input).toHaveFocus();
    expect(screen.queryByTestId("focus-prompt")).not.toBeInTheDocument();
  });

  it("on mobile does not focus by itself: waits for the text to be tapped", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const input = setup();
    expect(input).not.toHaveFocus();
    expect(screen.getByTestId("focus-prompt")).toBeInTheDocument();
  });

  it("Shift+Tab neither restarts nor traps focus", () => {
    const input = setup();
    typeText(input, "ho");
    const notPrevented = fireEvent.keyDown(input, { key: "Tab", code: "Tab", shiftKey: true });
    expect(notPrevented).toBe(true);
    expect(letterStatuses(0)).toEqual(["correct", "correct", "pending", "pending"]);
  });

  it("when a composition ends (Android keyboard) the input returns to the current word", () => {
    const input = setup();
    for (const value of ["h", "ho", "hol", "hola "]) {
      fireEvent.input(input, { target: { value }, isComposing: true });
    }
    fireEvent.compositionEnd(input);
    expect(input.value).toBe("");
    expect(screen.getAllByTestId("word")[1]).toHaveAttribute("data-state", "active");
    fireEvent.input(input, { target: { value: "m" }, isComposing: true });
    expect(letterStatuses(1)).toEqual(["correct", "pending", "pending", "pending", "pending"]);
  });

  it("dead key in Chrome's order (the final letter arrives while still composing)", () => {
    renderWithIntl(<TypingTest language="es" durationMs={15_000} initialWords={["más"]} />);
    const input = screen.getByTestId("typing-input") as HTMLInputElement;
    typeText(input, "m");
    fireEvent.input(input, { target: { value: "m´" }, isComposing: true });
    fireEvent.input(input, { target: { value: "má" }, isComposing: true });
    fireEvent.compositionEnd(input);
    typeText(input, "s ");
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("100%");
  });

  it("the US-International dead key (') does not count as an error", () => {
    renderWithIntl(<TypingTest language="es" durationMs={15_000} initialWords={["más"]} />);
    const input = screen.getByTestId("typing-input") as HTMLInputElement;
    typeText(input, "m");
    fireEvent.keyDown(input, { key: "Dead", code: "Quote" });
    fireEvent.input(input, { target: { value: "m'" }, isComposing: true });
    fireEvent.keyDown(input, { key: "a", code: "KeyA" });
    fireEvent.input(input, { target: { value: "má" }, isComposing: true });
    fireEvent.compositionEnd(input);
    typeText(input, "s ");
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("100%");
  });
});
