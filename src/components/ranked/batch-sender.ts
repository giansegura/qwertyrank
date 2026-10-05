import type { TypingEvent } from "@/lib/scoring/types";
import { isRetryable } from "./api";

export interface BatchSender {
  start(): void;
  /** Envía lo pendiente y espera a que lleguen todas las tandas. */
  flush(): Promise<{ lastSeq: number; delivered: boolean }>;
  stop(): void;
}

interface Options {
  getEvents: () => readonly TypingEvent[];
  send: (seq: number, events: TypingEvent[]) => Promise<void>;
  intervalMs?: number;
  retryDelaysMs?: readonly number[];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envía las pulsaciones al servidor cada ~3 s, en orden y una tanda detrás de otra (spec §3.4).
 * Si una tanda no llega tras los reintentos, las siguientes ya no se envían: el servidor
 * marcará la partida como incompleta.
 */
export function createBatchSender({
  getEvents,
  send,
  intervalMs = 3_000,
  retryDelaysMs = [250, 500, 1_000, 2_000],
}: Options): BatchSender {
  let sentEvents = 0;
  let seq = 0;
  let failed = false;
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function deliver(batchSeq: number, events: TypingEvent[]) {
    for (let attempt = 0; ; attempt++) {
      try {
        await send(batchSeq, events);
        return;
      } catch (error) {
        if (attempt >= retryDelaysMs.length || !isRetryable(error)) {
          failed = true;
          return;
        }
        await wait(retryDelaysMs[attempt]);
      }
    }
  }

  function enqueue() {
    const pending = getEvents().slice(sentEvents);
    if (pending.length === 0) return;
    sentEvents += pending.length;
    const batchSeq = ++seq;
    chain = chain.then(() => (failed ? undefined : deliver(batchSeq, pending)));
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  return {
    start() {
      stop();
      timer = setInterval(enqueue, intervalMs);
    },
    async flush() {
      stop();
      enqueue();
      await chain;
      return { lastSeq: seq, delivered: !failed };
    },
    stop,
  };
}
