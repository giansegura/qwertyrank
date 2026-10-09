import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFrames, compactFrames, replayInputs, type InputStep } from "@/lib/replay/timeline";
import { typed } from "@/test/typing-events";
import { Replay } from "./replay";

/** "hxla " with one letter every 200 ms: the x arrives at 201 ms; the last one, at 801 ms. */
const STEPS = replayInputs(typed("hxla ", { every: 200 }));

/** The frames as the page passes them, computed on the server. */
const framesOf = (words: string[] | null, steps: InputStep[] = STEPS) => compactFrames(buildFrames(words, steps));

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
  it("the letters appear with their timings and the errors in red; at the end, it stops", async () => {
    render(<Replay words={["hola", "sol"]} frames={framesOf(["hola", "sol"])} />);
    expect(statuses(0)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(screen.getByTestId("replay-time")).toHaveTextContent("0.0 s / 0.8 s");

    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(250);
    expect(statuses(0)).toEqual(["correct", "incorrect", "pending", "pending"]);

    await advance(1_000);
    expect(statuses(0)).toEqual(["correct", "incorrect", "correct", "correct"]);
    expect(screen.getByTestId("replay-words").querySelector('[data-state="active"]')).toHaveAttribute("data-word", "sol");
    expect(screen.getByTestId("replay-play")).toHaveTextContent("Play");
  });

  it("at ×4 it goes four times faster, and pause stops it", async () => {
    render(<Replay words={["hola", "sol"]} frames={framesOf(["hola", "sol"])} />);
    fireEvent.click(screen.getByTestId("replay-speed-4"));
    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(125);
    expect(statuses(0).filter((status) => status !== "pending")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(1_000);
    expect(statuses(0).filter((status) => status !== "pending")).toHaveLength(3);
  });

  it("without words (log from before 4b) it shows what was typed; without keystrokes, it does not break", async () => {
    const { unmount } = render(<Replay words={null} frames={framesOf(null)} />);
    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(1_000);
    expect(screen.getAllByTestId("word")[0]).toHaveAttribute("data-word", "hxla");
    unmount();

    render(<Replay words={null} frames={framesOf(null, [])} />);
    fireEvent.click(screen.getByTestId("replay-play"));
    await advance(100);
    expect(screen.getByTestId("replay-time")).toHaveTextContent("0.0 s / 0.0 s");
  });
});
