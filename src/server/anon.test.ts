import { describe, expect, it } from "vitest";
import { createAnonId, readAnonId } from "./anon";

const SECRET = "x".repeat(32);

describe("cookie anónima", () => {
  it("lee el id de una cookie firmada", () => {
    const { id, value } = createAnonId(SECRET);
    expect(readAnonId(value, SECRET)).toBe(id);
  });

  it("rechaza una cookie manipulada o firmada con otro secreto", () => {
    const { value } = createAnonId(SECRET);
    const [id] = value.split(".");
    expect(readAnonId(`${id}.firma-falsa`, SECRET)).toBeNull();
    expect(readAnonId(value, "y".repeat(32))).toBeNull();
    expect(readAnonId(`otro-id.${value.split(".")[1]}`, SECRET)).toBeNull();
  });

  it("rechaza valores vacíos o sin firma", () => {
    expect(readAnonId(undefined, SECRET)).toBeNull();
    expect(readAnonId("", SECRET)).toBeNull();
    expect(readAnonId("solo-id", SECRET)).toBeNull();
  });
});
