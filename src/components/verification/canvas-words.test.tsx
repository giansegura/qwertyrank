import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyInput, createEngine } from "@/lib/scoring/engine";
import { renderWithIntl } from "@/test/render-with-intl";
import { CanvasWords } from "./canvas-words";

/** Un contexto 2D que apunta lo que se dibuja (jsdom no dibuja). */
function fakeContext() {
  const drawn: { text: string; x: number; y: number; color: string }[] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 14.4 }),
    fillText(text: string, x: number, y: number) {
      drawn.push({ text, x, y, color: context.fillStyle });
    },
  };
  return { context, drawn };
}

let fontsReady: () => void = () => {};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(328);
  vi.stubGlobal("devicePixelRatio", 3);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: vi.fn(async () => []),
      ready: new Promise<void>((resolve) => {
        fontsReady = resolve;
      }),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
});

describe("CanvasWords", () => {
  it("no dibuja hasta que han cargado las fuentes; después, a la resolución del dispositivo", async () => {
    const { context, drawn } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    renderWithIntl(<CanvasWords engine={createEngine(["hola", "mundo"])} />);
    const canvas = screen.getByTestId("verify-canvas") as HTMLCanvasElement;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(drawn).toEqual([]);
    expect(canvas).toHaveAttribute("data-ready", "false");

    await act(async () => fontsReady());
    await waitFor(() => expect(canvas).toHaveAttribute("data-ready", "true"));
    expect(drawn.map((letter) => letter.text).join("")).toBe("holamundo");
    expect(context.setTransform).toHaveBeenLastCalledWith(3, 0, 0, 3, 0, 0);
    expect([canvas.width, canvas.height]).toEqual([984, 360]);
  });

  it("pinta los errores en rojo y el texto no está en el DOM", async () => {
    const { context, drawn } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    fontsReady();
    const engine = applyInput(createEngine(["hola", "mundo"]), 0, "hx");
    const { container } = renderWithIntl(<CanvasWords engine={engine} />);
    await waitFor(() => expect(drawn.length).toBeGreaterThan(0));

    expect(drawn.slice(0, 4).map((letter) => letter.color)).toEqual(["#18181b", "#dc2626", "#a1a1aa", "#a1a1aa"]);
    expect(container.textContent).not.toContain("hola");
    expect(screen.getByRole("img", { name: "Text to type, shown as an image" })).toBe(screen.getByTestId("verify-canvas"));
  });
});
