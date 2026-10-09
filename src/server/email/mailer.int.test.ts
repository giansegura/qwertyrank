import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRedis } from "../redis";
import { createOutboxMailer } from "./mailer";

const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = process.env.REDIS_KEY_PREFIX!;

describe("email outbox in Redis", () => {
  it("without Resend, the email stays in Redis, most recent first and with an expiry", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const send = createOutboxMailer(redis, prefix);
    const to = `${randomUUID()}@Example.com`;
    await send({ to, subject: "one", html: "<p>1</p>", text: "1" });
    await send({ to, subject: "two", html: "<p>2</p>", text: "2" });

    const key = `${prefix}outbox:${to.toLowerCase()}`;
    const [latest] = await redis.lrange(key, 0, 0);
    expect(JSON.parse(latest)).toMatchObject({ subject: "two" });
    expect(await redis.ttl(key)).toBeGreaterThan(0);
  });
});
