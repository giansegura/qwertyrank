import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRedis } from "../redis";
import { createOutboxMailer } from "./mailer";

const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = process.env.REDIS_KEY_PREFIX!;

describe("buzón de emails en Redis", () => {
  it("sin Resend, el email queda en Redis, el más reciente primero y con caducidad", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const send = createOutboxMailer(redis, prefix);
    const to = `${randomUUID()}@Example.com`;
    await send({ to, subject: "uno", html: "<p>1</p>", text: "1" });
    await send({ to, subject: "dos", html: "<p>2</p>", text: "2" });

    const key = `${prefix}outbox:${to.toLowerCase()}`;
    const [latest] = await redis.lrange(key, 0, 0);
    expect(JSON.parse(latest)).toMatchObject({ subject: "dos" });
    expect(await redis.ttl(key)).toBeGreaterThan(0);
  });
});
