import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { ShareResult } from "./share-result";

const ID = "3f6c1e2a-9b4d-4c8e-a1f2-0d9e8b7c6a5f";
const URL_ES = `http://localhost:3000/es/r/${ID}`;

function stubNavigator({ share, writeText }: { share?: () => Promise<void>; writeText?: () => Promise<void> }) {
  vi.stubGlobal("navigator", { ...navigator, share, clipboard: writeText ? { writeText } : undefined });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const render = () => renderWithIntl(<ShareResult gameId={ID} language="pt" wpm={81.6} />, "es");
const click = () => act(async () => fireEvent.click(screen.getByTestId("share-button")));

describe("ShareResult", () => {
  it("con navigator.share abre el menú del sistema con la URL y el texto", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });
    render();
    await click();
    expect(share).toHaveBeenCalledWith({ url: URL_ES, text: "He hecho 82 ppm en portugués en QwertyRank. ¿Puedes superarlo?" });
  });

  it("si el jugador cierra el menú (AbortError), no copia ni cambia nada", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share: vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError")), writeText });
    render();
    await click();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByTestId("share-button")).toHaveTextContent("Compartir");
  });

  it("sin navigator.share, o si falla por otro motivo, copia y avisa 2 s", async () => {
    for (const share of [undefined, vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError"))]) {
      vi.useFakeTimers();
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubNavigator({ share, writeText });
      const { unmount } = render();
      await click();
      expect(writeText).toHaveBeenCalledWith(URL_ES);
      expect(screen.getByTestId("share-button")).toHaveTextContent("¡Enlace copiado!");
      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.getByTestId("share-button")).toHaveTextContent("Compartir");
      unmount();
      vi.useRealTimers();
    }
  });

  it("si tampoco se puede copiar, enseña el enlace", async () => {
    stubNavigator({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    render();
    await click();
    expect(screen.getByRole("link", { name: URL_ES })).toHaveAttribute("href", URL_ES);
  });

  it("enlaza a la página del resultado", () => {
    stubNavigator({});
    render();
    expect(screen.getByRole("link", { name: "Ver resultado" })).toHaveAttribute("href", `/es/r/${ID}`);
  });
});
