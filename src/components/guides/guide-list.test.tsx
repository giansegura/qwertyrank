import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { GuideList } from "./guide-list";

describe("GuideList", () => {
  it("lists every guide with its localized route and description", () => {
    renderWithIntl(<GuideList />, "es");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(within(items[2]).getByRole("link", { name: "PPM y CPM: cómo se mide la velocidad de escritura" })).toHaveAttribute(
      "href",
      "/es/guias/ppm-y-cpm",
    );
    expect(items[2]).toHaveTextContent("Qué significan PPM y CPM");
  });

  it("can leave out the current guide", () => {
    renderWithIntl(<GuideList exclude="wpm-vs-cpm" />, "en");
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toHaveLength(4);
    expect(hrefs).not.toContain("/en/guides/wpm-vs-cpm");
  });
});
