import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl, withIntl } from "@/test/render-with-intl";
import { PeriodCountdown, splitRemaining } from "./period-countdown";

// Como en Next, el mismo router en cada render.
const { router, refresh } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { router: { refresh }, refresh };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const MIDNIGHT = Date.parse("2026-10-05T00:00:00Z");

afterEach(() => {
  vi.useRealTimers();
  refresh.mockClear();
});

async function mountAt(time: string, endsAt: number | null, locale: "en" | "es" = "en") {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(time));
  const view = renderWithIntl(<PeriodCountdown endsAt={endsAt} />, locale);
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  return view;
}

describe("splitRemaining", () => {
  it("días y horas, horas y minutos, o minutos (redondeando hacia arriba)", () => {
    expect(splitRemaining(2 * 86_400_000 + 5 * 3_600_000)).toEqual({ unit: "days", days: 2, hours: 5, minutes: 0 });
    expect(splitRemaining(3 * 3_600_000 + 12 * 60_000)).toEqual({ unit: "hours", days: 0, hours: 3, minutes: 12 });
    expect(splitRemaining(90_000)).toMatchObject({ unit: "minutes", minutes: 2 });
    expect(splitRemaining(10_000)).toMatchObject({ unit: "minutes", minutes: 1 });
  });
});

describe("PeriodCountdown", () => {
  it("cuenta hasta el final del periodo, con las unidades de cada idioma", async () => {
    await mountAt("2026-10-04T21:00:00Z", MIDNIGHT);
    expect(screen.getByTestId("period-countdown")).toHaveTextContent("Resets in 3h 0m");
  });

  it("en español", async () => {
    await mountAt("2026-10-04T20:48:00Z", MIDNIGHT, "es");
    expect(screen.getByTestId("period-countdown")).toHaveTextContent("Se reinicia en 3 h 12 min");
  });

  it("«Siempre» no se reinicia", () => {
    renderWithIntl(<PeriodCountdown endsAt={null} />);
    expect(screen.queryByTestId("period-countdown")).toBeNull();
  });

  it("al acabar el periodo pide la página hasta que llega la del nuevo", async () => {
    const { rerender } = await mountAt("2026-10-05T00:00:05Z", MIDNIGHT);
    expect(screen.getByTestId("period-countdown")).toHaveTextContent("Resetting…");
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);

    rerender(withIntl(<PeriodCountdown endsAt={MIDNIGHT + 86_400_000} />));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("period-countdown")).toHaveTextContent(/^Resets in 23h/);
  });
});
