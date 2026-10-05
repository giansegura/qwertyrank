import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypingEvent } from "@/lib/scoring/types";
import { GameApiError } from "./api";
import { createBatchSender } from "./batch-sender";

const event = (t: number): TypingEvent => ({ t, type: "input", deleted: 0, inserted: "a", trusted: true });

describe("createBatchSender", () => {
  let events: TypingEvent[];
  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(send = vi.fn(async () => {})) {
    const sender = createBatchSender({ getEvents: () => events, send, intervalMs: 3_000, retryDelaysMs: [100, 200] });
    return { sender, send };
  }

  it("envía cada intervalo solo los eventos nuevos, con seq creciente", async () => {
    const { sender, send } = setup();
    sender.start();
    events.push(event(1), event(2));
    await vi.advanceTimersByTimeAsync(3_000);
    events.push(event(3));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(send.mock.calls).toEqual([
      [1, [event(1), event(2)]],
      [2, [event(3)]],
    ]);
  });

  it("no envía tandas vacías", async () => {
    const { sender, send } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("flush envía lo pendiente, espera a que llegue todo y devuelve el último seq", async () => {
    const { sender, send } = setup();
    sender.start();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(3_000);
    events.push(event(2));
    await expect(sender.flush()).resolves.toEqual({ lastSeq: 2, delivered: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("reintenta los fallos de red", async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(undefined);
    const { sender } = setup(send);
    events.push(event(1));
    const flushed = sender.flush();
    await vi.advanceTimersByTimeAsync(100);
    await expect(flushed).resolves.toEqual({ lastSeq: 1, delivered: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("si una tanda no llega, no envía las siguientes y lo indica", async () => {
    const send = vi.fn().mockRejectedValue(new GameApiError(409, "closed"));
    const { sender } = setup(send);
    sender.start();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(3_000);
    events.push(event(2));
    await expect(sender.flush()).resolves.toEqual({ lastSeq: 2, delivered: false });
    expect(send).toHaveBeenCalledOnce();
  });

  it("stop deja de enviar", async () => {
    const { sender, send } = setup();
    sender.start();
    sender.stop();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(send).not.toHaveBeenCalled();
  });
});
