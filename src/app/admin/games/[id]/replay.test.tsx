import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replayInputs } from "@/lib/replay/timeline";
import { typed } from "@/test/typing-events";
import { Replay } from "./replay";

/** "hxla " con una letra cada 200 ms: la x llega a los 201 ms; la última, a los 801 ms. */
const STEPS = replayInputs(typed("hxla ", { every: 200 }));

const statuses = (index: number) =>
  [...screen.getAllByTestId("word")[index].querySelectorAll("[data-letter]")].map((letter) => letter.getAttribute("data-status"));

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Replay", () => {
  it("las letras aparecen con sus tiempos y los errores en rojo; al acabar, se para", async () => {
    render(<Replay words={["hola", "sol"]} steps={STEPS} />);
    expect(statuses(0)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(screen.getByTestId("replay-time")).toHaveTextContent("0.0 s / 0.8 s");

    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(250);
    expect(statuses(0)).toEqual(["correct", "incorrect", "pending", "pending"]);

    await advance(1_000);
    expect(statuses(0)).toEqual(["correct", "incorrect", "correct", "correct"]);
    expect(screen.getByTestId("replay-words").querySelector('[data-state="active"]')).toHaveAttribute("data-word", "sol");
    expect(screen.getByTestId("replay-play")).toHaveTextContent("Reproducir");
  });

  it("a ×4 va cuatro veces más rápido, y la pausa la para", async () => {
    render(<Replay words={["hola", "sol"]} steps={STEPS} />);
    fireEvent.click(screen.getByTestId("replay-speed-4"));
    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(125);
    expect(statuses(0).filter((status) => status !== "pending")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(1_000);
    expect(statuses(0).filter((status) => status !== "pending")).toHaveLength(3);
  });

  it("sin palabras (registro anterior a la 4b) enseña lo tecleado; sin pulsaciones, no se rompe", async () => {
    const { unmount } = render(<Replay words={null} steps={STEPS} />);
    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(1_000);
    expect(screen.getAllByTestId("word")[0]).toHaveAttribute("data-word", "hxla");
    unmount();

    render(<Replay words={null} steps={[]} />);
    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(100);
    expect(screen.getByTestId("replay-time")).toHaveTextContent("0.0 s / 0.0 s");
  });
});
