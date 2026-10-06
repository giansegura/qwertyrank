import { describe, expect, it } from "vitest";
import { isDisposableEmail } from "./disposable";

describe("isDisposableEmail", () => {
  it("detecta dominios desechables, también en subdominios y con mayúsculas", () => {
    expect(isDisposableEmail("someone@mailinator.com")).toBe(true);
    expect(isDisposableEmail("someone@inbox.mailinator.com")).toBe(true);
    expect(isDisposableEmail("Someone@MAILINATOR.COM")).toBe(true);
  });

  it("deja pasar los proveedores normales y los reenviadores de privacidad", () => {
    expect(isDisposableEmail("someone@gmail.com")).toBe(false);
    expect(isDisposableEmail("someone@proton.me")).toBe(false);
    expect(isDisposableEmail("someone@duck.com")).toBe(false);
  });

  it("un texto sin @ no es desechable (lo valida Better Auth)", () => {
    expect(isDisposableEmail("no-es-un-email")).toBe(false);
  });
});
