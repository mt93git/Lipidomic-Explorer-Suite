import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PipelineOverview } from "@/components/pipeline-overview";
import { demoClients, demoOrders } from "@/lib/demo";
import { installHistorySync } from "./helpers/url-state";

vi.mock("next/navigation", async () => {
  const { useSearchParamsMock } = await import("./helpers/url-state");
  return { useSearchParams: useSearchParamsMock, usePathname: () => "/pipeline" };
});

installHistorySync();
beforeEach(() => window.history.replaceState(null, "", "/admin/pipeline"));
afterEach(() => vi.useRealTimers());
const today = "2026-11-07T12:00:00Z";
const board = () => screen.getByRole("region", { name: "Order pipeline" });
// Cards are listed column by column; compare as sets.
const codes = () => within(board()).queryAllByRole("article").map(card => card.getAttribute("aria-label")).sort();

describe("overview URL state", () => {
  it("writes each filter change to the query string without navigating away, and the view follows", () => {
    render(<PipelineOverview orders={demoOrders} clients={demoClients} today={today} />);
    const tile = screen.getByRole("button", { name: /^Blocked at a gate/ });
    fireEvent.click(tile);
    expect(window.location.pathname).toBe("/admin/pipeline");
    expect(window.location.search).toBe("?focus=blocked");
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(codes()).toEqual(["ORD041", "ORD048", "ORD051", "ORD056"]);
  });
  it("restores a shared view from the query string, including the legacy comma form for client ids", () => {
    window.history.replaceState(null, "", "/admin/pipeline?client=example-cedar%2Cexample-atlas&stage=in-batch&group=client");
    render(<PipelineOverview orders={demoOrders} clients={demoClients} today={today} />);
    expect(screen.getByText("Lab work / 2 clients")).toBeVisible();
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getAllByRole("button").map(b => b.textContent?.replace("×", "").trim())).toEqual(["Example Cedar", "Example Atlas", "Stage: In batch", "Clear all"]);
    expect(screen.getByRole("button", { name: "By client" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Orders by client" })).toBeVisible();
  });
  it("keeps spaces while typing a multiword search, character by character (P1-1)", async () => {
    const user = userEvent.setup();
    render(<PipelineOverview orders={demoOrders} clients={demoClients} today={today} />);
    const input = screen.getByRole("searchbox", { name: "Search orders in the overview" });
    await user.type(input, "shared run");
    expect(input).toHaveValue("shared run");
    expect(window.location.search).toBe("?q=shared+run");
    expect(codes()).toEqual(["ORD053"]);
    await user.type(input, " ");
    expect(input).toHaveValue("shared run ");
    expect(window.location.search).toBe("?q=shared+run+");
    expect(codes()).toEqual(["ORD053"]);
  });
  it("round-trips commas in panel and owner values through the URL (P1-4)", () => {
    const orders = [{ ...demoOrders[0], panel: "PC, PE", owner: "Doe, Jane" }, ...demoOrders.slice(1)];
    render(<PipelineOverview orders={orders} clients={demoClients} today={today} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /^PC, PE/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^Doe, Jane/ }));
    expect(window.location.search).toBe("?panel=PC%2C+PE&owner=Doe%2C+Jane");
    expect(codes()).toEqual(["ORD041"]);
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getByRole("button", { name: "Remove filter: Panel: PC, PE" })).toBeVisible();
    expect(within(chips).getByRole("button", { name: "Remove filter: Owner: Doe, Jane" })).toBeVisible();
  });
});

describe("as-of clock (P2-6)", () => {
  it("starts from the server instant, then follows real time on interaction and every minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T15:41:00Z"));
    render(<PipelineOverview orders={demoOrders} clients={demoClients} today={today} />);
    expect(screen.getByText("07:00 EST")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Ready to advance/ }));
    expect(screen.getByText("10:41 EST")).toBeVisible();
    vi.setSystemTime(new Date("2026-11-07T15:43:30Z"));
    act(() => { vi.advanceTimersByTime(60_000); }); // the tick fires at 15:44:30 fake time
    expect(screen.getByText("10:44 EST")).toBeVisible();
  });
});
