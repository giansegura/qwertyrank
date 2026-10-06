import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { PeriodCountdown, formatRemaining } from "./period-countdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRemaining", () => {
  it("días y horas, horas y minutos, o minutos (redondeando hacia arriba)", () => {
    expect(formatRemaining(2 * 86_400_000 + 5 * 3_600_000)).toBe("2 d 5 h");
    expect(formatRemaining(3 * 3_600_000 + 12 * 60_000)).toBe("3 h 12 min");
    expect(formatRemaining(90_000)).toBe("2 min");
    expect(formatRemaining(10_000)).toBe("1 min");
  });
});

describe("PeriodCountdown", () => {
  it("cuenta hasta la siguiente medianoche UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "setInterval"] });
    vi.setSystemTime(new Date("2026-10-04T21:00:00Z"));
    renderWithIntl(<PeriodCountdown period="day" />);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId("period-countdown")).toHaveTextContent("Resets in 3 h 0 min");
  });

  it("«Siempre» no se reinicia", () => {
    renderWithIntl(<PeriodCountdown period="all" />);
    expect(screen.queryByTestId("period-countdown")).toBeNull();
  });
});
