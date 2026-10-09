import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getViewer } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { ReportButton } from "./report-button";

vi.mock("@/lib/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/en/u/ana",
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ReportButton", () => {
  it("without a session, goes to sign in and back to the profile", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    renderWithIntl(<ReportButton nick="ana" />);
    expect(await screen.findByTestId("report-sign-in")).toHaveAttribute("href", "/en/sign-in?next=%2Fen%2Fu%2Fana");
  });

  it("does not show on the player's own profile", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "Ana" });
    const { container } = renderWithIntl(<ReportButton nick="ana" />);
    await waitFor(() => expect(getViewer).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("reports with the chosen reason and says thanks", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "gian" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    renderWithIntl(<ReportButton nick="ana" />);
    fireEvent.click(await screen.findByTestId("report-open"));
    fireEvent.click(screen.getByLabelText("Offensive nick"));
    fireEvent.click(screen.getByTestId("report-send"));
    expect(await screen.findByTestId("report-sent")).toHaveTextContent("Thanks, we'll look into it.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ nick: "ana", reason: "offensive_nick" }) }),
    );
  });

  it("if it fails, says so and allows retrying", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "gian" });
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    renderWithIntl(<ReportButton nick="ana" />);
    fireEvent.click(await screen.findByTestId("report-open"));
    fireEvent.click(screen.getByTestId("report-send"));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't send the report.");
    expect(screen.getByTestId("report-send")).toBeEnabled();
  });
});
