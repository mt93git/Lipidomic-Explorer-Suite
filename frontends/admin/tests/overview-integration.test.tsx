import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { PipelineOverview } from "@/components/pipeline-overview";
import { demoClients, demoOrders, demoSession } from "@/lib/demo";
import { installHistorySync, navigateOnLinkClick } from "./helpers/url-state";

vi.mock("next/navigation", async () => {
  const { useSearchParamsMock } = await import("./helpers/url-state");
  return { useSearchParams: useSearchParamsMock, usePathname: () => "/pipeline", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) };
});
vi.mock("@/app/actions", () => ({ signOut: vi.fn(), switchView: vi.fn() }));

installHistorySync();
beforeEach(() => window.history.replaceState(null, "", "/pipeline"));
const today = "2026-11-07T12:00:00Z";

// Shell and overview together, as the real layout renders them. Link clicks become client-side navigations.
function App({ children }: { children?: ReactNode }) {
  return <div onClickCapture={navigateOnLinkClick}><AppShell session={demoSession}>{children ?? <PipelineOverview orders={demoOrders} clients={demoClients} today={today} />}</AppShell></div>;
}
// Cards are listed column by column; compare as sets.
const codes = () => within(screen.getByRole("region", { name: "Order pipeline" })).queryAllByRole("article").map(card => card.getAttribute("aria-label")).sort();
const open = (clientIds: string[]) => demoOrders.filter(o => !o.released && clientIds.includes(o.clientId)).map(o => o.code).sort();
const scopeSummary = () => document.querySelector("details.scope > summary") as HTMLElement;
const scopeMenu = () => screen.getByRole("group", { name: "Client scope" });
const strip = () => screen.getByRole("group", { name: "Filter by client" });
const chips = () => screen.getByRole("list", { name: "Active filters" });

describe("shell and overview share the URL (P2-10)", () => {
  it("changes scope from the top bar and from the board, removes chips, and every surface agrees", () => {
    render(<App />);
    expect(codes()).toEqual(open(demoClients.map(c => c.id)));

    fireEvent.click(within(scopeMenu()).getByRole("link", { name: "Example Cedar" }));
    expect(window.location.search).toBe("?client=example-cedar");
    expect(codes()).toEqual(open(["example-cedar"]));
    expect(scopeSummary()).toHaveTextContent("Example Cedar");
    expect(screen.getByText("Lab work / Example Cedar")).toBeVisible();
    expect(within(strip()).getByRole("button", { name: /Example Cedar/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(scopeMenu()).getByRole("link", { name: "Example Cedar" })).toHaveAttribute("aria-current", "true");

    fireEvent.click(within(strip()).getByRole("button", { name: /Example Harbor/ }));
    expect(window.location.search).toBe("?client=example-cedar&client=example-harbor");
    expect(codes()).toEqual(open(["example-cedar", "example-harbor"]));
    expect(scopeSummary()).toHaveTextContent("2 clients");
    expect(within(scopeMenu()).getByRole("link", { name: "Example Atlas" })).toHaveAttribute("href", "/pipeline?client=example-cedar&client=example-harbor&client=example-atlas");

    const tile = screen.getByRole("button", { name: /^Blocked at a gate/ });
    fireEvent.click(tile);
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?client=example-cedar&client=example-harbor&focus=blocked");
    expect(codes()).toEqual(["ORD051"]);

    fireEvent.click(within(chips()).getByRole("button", { name: "Remove filter: Example Cedar" }));
    expect(window.location.search).toBe("?client=example-harbor&focus=blocked");
    expect(scopeSummary()).toHaveTextContent("Example Harbor");
    expect(codes()).toEqual(["ORD051"]);
    expect(within(scopeMenu()).getByRole("link", { name: "Example Cedar" })).not.toHaveAttribute("aria-current");

    fireEvent.click(within(scopeMenu()).getByRole("link", { name: "All clients" }));
    expect(window.location.search).toBe("?focus=blocked");
    expect(scopeSummary()).toHaveTextContent("All clients");
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(codes()).toEqual(["ORD041", "ORD048", "ORD051", "ORD056"]);
  });
  it("keeps the other active filters when searching from the top bar", () => {
    window.history.replaceState(null, "", "/pipeline?client=example-cedar&focus=blocked&panel=PC%2C+PE");
    render(<App />);
    const form = screen.getByRole("search") as HTMLFormElement;
    const carried = Array.from(new FormData(form).entries()).filter(([name]) => name !== "q");
    expect(carried).toEqual([["client", "example-cedar"], ["focus", "blocked"], ["panel", "PC, PE"]]);
    const input = screen.getByRole("searchbox", { name: "Search orders" });
    fireEvent.change(input, { target: { value: "pilot run" } });
    fireEvent.submit(form);
    expect(window.location.search).toBe("?client=example-cedar&focus=blocked&panel=PC%2C+PE&q=pilot+run");
    expect(screen.getByRole("searchbox", { name: "Search orders in the overview" })).toHaveValue("pilot run");
    expect(within(chips()).getByRole("button", { name: "Remove filter: Search: “pilot run”" })).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search orders" })).toHaveValue("pilot run");
    expect(screen.getByRole("button", { name: /^Blocked at a gate/ })).toHaveAttribute("aria-pressed", "true");
  });
});
