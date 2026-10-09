import { describe, expect, it } from "vitest";
import { isDisposableEmail } from "./disposable";

describe("isDisposableEmail", () => {
  it("detects disposable domains, also in subdomains and in uppercase", () => {
    expect(isDisposableEmail("someone@mailinator.com")).toBe(true);
    expect(isDisposableEmail("someone@inbox.mailinator.com")).toBe(true);
    expect(isDisposableEmail("Someone@MAILINATOR.COM")).toBe(true);
  });

  it("lets regular providers and privacy forwarders through", () => {
    expect(isDisposableEmail("someone@gmail.com")).toBe(false);
    expect(isDisposableEmail("someone@proton.me")).toBe(false);
    expect(isDisposableEmail("someone@duck.com")).toBe(false);
  });

  it("a text without @ is not disposable (Better Auth validates it)", () => {
    expect(isDisposableEmail("not-an-email")).toBe(false);
  });
});
