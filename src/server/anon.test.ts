import { describe, expect, it } from "vitest";
import { createAnonId, readAnonId } from "./anon";

const SECRET = "x".repeat(32);

describe("anonymous cookie", () => {
  it("reads the id from a signed cookie", () => {
    const { id, value } = createAnonId(SECRET);
    expect(readAnonId(value, SECRET)).toBe(id);
  });

  it("rejects a tampered cookie or one signed with another secret", () => {
    const { value } = createAnonId(SECRET);
    const [id] = value.split(".");
    expect(readAnonId(`${id}.fake-signature`, SECRET)).toBeNull();
    expect(readAnonId(value, "y".repeat(32))).toBeNull();
    expect(readAnonId(`other-id.${value.split(".")[1]}`, SECRET)).toBeNull();
  });

  it("rejects empty or unsigned values", () => {
    expect(readAnonId(undefined, SECRET)).toBeNull();
    expect(readAnonId("", SECRET)).toBeNull();
    expect(readAnonId("id-only", SECRET)).toBeNull();
  });
});
