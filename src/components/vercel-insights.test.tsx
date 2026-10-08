import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VercelInsights } from "./vercel-insights";

describe("VercelInsights", () => {
  it("en producción, los scripts de Web Analytics y Speed Insights con su cola", () => {
    const { container } = render(<VercelInsights enabled />);
    const scripts = [...container.querySelectorAll("script")];
    expect(scripts.map((script) => script.getAttribute("src"))).toEqual([
      null,
      "/_vercel/insights/script.js",
      "/_vercel/speed-insights/script.js",
    ]);
    expect(scripts.slice(1).every((script) => script.defer)).toBe(true);
    expect(scripts[0].textContent).toContain("window.vaq");
    expect(scripts[0].textContent).toContain("window.siq");
  });

  it("fuera de producción, nada", () => {
    const { container } = render(<VercelInsights enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
