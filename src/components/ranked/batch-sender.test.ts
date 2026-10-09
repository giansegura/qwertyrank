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

  it("sends only the new events each interval, with increasing seq", async () => {
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

  it("does not send empty batches", async () => {
    const { sender, send } = setup();
    sender.start();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(send).not.toHaveBeenCalled();
  });

  it("flush sends what is pending, waits for everything to arrive and returns the last seq", async () => {
    const { sender, send } = setup();
    sender.start();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(3_000);
    events.push(event(2));
    await expect(sender.flush()).resolves.toEqual({ lastSeq: 2, delivered: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("retries network failures", async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(undefined);
    const { sender } = setup(send);
    events.push(event(1));
    const flushed = sender.flush();
    await vi.advanceTimersByTimeAsync(100);
    await expect(flushed).resolves.toEqual({ lastSeq: 1, delivered: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("if a batch does not arrive, does not send the following ones and reports it", async () => {
    const send = vi.fn().mockRejectedValue(new GameApiError(409, "closed"));
    const { sender } = setup(send);
    sender.start();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(3_000);
    events.push(event(2));
    await expect(sender.flush()).resolves.toEqual({ lastSeq: 2, delivered: false });
    expect(send).toHaveBeenCalledOnce();
  });

  it("stop stops sending", async () => {
    const { sender, send } = setup();
    sender.start();
    sender.stop();
    events.push(event(1));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(send).not.toHaveBeenCalled();
  });
});
