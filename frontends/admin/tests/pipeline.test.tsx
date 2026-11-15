import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pipeline } from "@/components/pipeline";
import { OrderCard } from "@/components/order-card";
import { demoClients, demoOrders } from "@/lib/demo";
import { gateStatus, stages, type View } from "@/lib/models";
import { emptyFilters, scopeToAudience, type PipelineFilters } from "@/lib/pipeline-filters";

const now = new Date("2026-11-07T12:00:00Z");
function Harness({ initial = emptyFilters, audience = "staff", ownClients = [] }: { initial?: PipelineFilters; audience?: View; ownClients?: string[] }) {
  const [filters, setFilters] = useState(initial);
  return <Pipeline data={scopeToAudience(demoOrders, demoClients, audience, ownClients)} filters={filters} onChange={setFilters} now={now} />;
}
const board = () => screen.getByRole("region", { name: "Order pipeline" });
const cards = () => within(board()).queryAllByRole("article");
const chipList = () => screen.getByRole("list", { name: "Active filters" });
const search = () => screen.getByRole("searchbox", { name: "Search orders in the overview" });

describe("stage minimap", () => {
  it("shows a warning before blocked counts without adding it to the accessible name", () => {
    render(<Harness />);
    const minimap = screen.getByRole("group", { name: "Pipeline stages" });
    stages.forEach((label, index) => {
      const orders = demoOrders.filter(order => !order.released && order.stage === index);
      const blocked = orders.some(order => gateStatus(order.gates) === "fail");
      const name = `Stage ${String(index + 1).padStart(2, "0")} ${label}, ${orders.length} ${orders.length === 1 ? "order" : "orders"}`;
      const button = within(minimap).getByRole("button", { name });
      const warning = within(button).queryByText("⚠");
      expect(button.querySelector(".column-count")?.textContent).toBe(`${blocked ? "⚠ " : ""}${orders.length}`);
      if (blocked) {
        expect(warning).toBeVisible();
        expect(warning).toHaveAttribute("aria-hidden", "true");
        expect(button).toHaveAccessibleDescription("Contains blocked orders");
      } else {
        expect(warning).not.toBeInTheDocument();
      }
    });
    fireEvent.change(search(), { target: { value: "nonexistent order" } });
    expect(within(minimap).queryAllByText("⚠")).toHaveLength(0);
  });

  it("exposes all ten scoped counts and blocked states with accessible jump buttons", () => {
    render(<Harness />);
    const minimap = screen.getByRole("group", { name: "Pipeline stages" });
    expect(within(minimap).getAllByRole("button")).toHaveLength(10);
    stages.forEach((label, index) => {
      const orders = demoOrders.filter(order => !order.released && order.stage === index);
      const name = `Stage ${String(index + 1).padStart(2, "0")} ${label}, ${orders.length} ${orders.length === 1 ? "order" : "orders"}`;
      const button = within(minimap).getByRole("button", { name });
      expect(button.querySelector(".column-count")).toHaveAttribute("data-blocked", String(orders.some(order => gateStatus(order.gates) === "fail")));
      expect(button.querySelector(".column-count")).toHaveAttribute("data-empty", String(orders.length === 0));
      expect(document.getElementById(button.getAttribute("aria-controls")!)).toBe(within(board()).getByRole("region", { name: label }));
    });
  });

  it("collapses empty columns and expands them when the filtered scope gets cards", () => {
    render(<Harness initial={{ ...emptyFilters, query: "ORD047" }} />);
    const request = within(board()).getByRole("region", { name: "Request" });
    const sequence = within(board()).getByRole("region", { name: "Sequence exported" });
    expect(request).toHaveAttribute("data-collapsed", "true");
    expect(sequence).toHaveAttribute("data-collapsed", "false");
    fireEvent.change(search(), { target: { value: "ORD042" } });
    expect(request).toHaveAttribute("data-collapsed", "false");
    expect(sequence).toHaveAttribute("data-collapsed", "true");
    expect(within(request).getByRole("article", { name: "ORD042" })).toBeVisible();
  });

  it("scrolls the chosen stage into view without changing filters", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const column = within(board()).getByRole("region", { name: "Excel built" });
    column.scrollIntoView = vi.fn();
    const jump = screen.getByRole("button", { name: /^Stage 10 Excel built,/ });
    jump.focus();
    await user.keyboard("{Enter}");
    expect(column.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(jump).toHaveFocus();
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it("highlights the observed visible range and disconnects on unmount", () => {
    let notify!: IntersectionObserverCallback;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    try {
      const { unmount } = render(<Harness />);
      const columns = within(board()).getAllByRole("region");
      expect(observe).toHaveBeenCalledTimes(10);
      const update = (entries: { target: Element; isIntersecting: boolean }[]) => act(() => notify(entries as IntersectionObserverEntry[], {} as IntersectionObserver));
      update([{ target: columns[0], isIntersecting: true }, { target: columns[1], isIntersecting: true }]);
      expect(screen.getByRole("button", { name: /^Stage 01 / })).toHaveAttribute("data-visible", "true");
      expect(screen.getByRole("button", { name: /^Stage 02 / })).toHaveAttribute("data-visible", "true");
      expect(screen.getByRole("button", { name: /^Stage 10 / })).toHaveAttribute("data-visible", "false");
      update([{ target: columns[0], isIntersecting: false }, { target: columns[9], isIntersecting: true }]);
      expect(screen.getByRole("button", { name: /^Stage 01 / })).toHaveAttribute("data-visible", "false");
      expect(screen.getByRole("button", { name: /^Stage 10 / })).toHaveAttribute("data-visible", "true");
      unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("pipeline cards", () => {
  it("identifies a failed gate in text and a red-edge styling hook", () => {
    const order = demoOrders.find(o => o.gates.some(g => g.status === "fail"))!;
    render(<OrderCard order={order} client={demoClients.find(c => c.id === order.clientId)!} />);
    expect(screen.getByRole("article")).toHaveAttribute("data-gate", "fail");
    expect(screen.getByText("Gate blocked")).toBeVisible();
    expect(screen.getByText(order.code)).toBeVisible();
    expect(screen.getByText(order.description)).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAccessibleName(`${order.code} progress`);
    expect(screen.getByRole("link")).toHaveAttribute("href", `/orders/${order.code}`);
  });
  it("distinguishes ready gates from pending checks", () => {
    const order = demoOrders[0];
    const { rerender } = render(<OrderCard order={{ ...order, gates: [{ label: "Checked", status: "ok" }] }} client={demoClients[0]} />);
    expect(screen.getByText("Ready to advance")).toBeVisible();
    rerender(<OrderCard order={{ ...order, gates: [{ label: "Check", status: "pending" }] }} client={demoClients[0]} />);
    expect(screen.getByText("Awaiting checks")).toBeVisible();
  });
});

describe("global overview", () => {
  it("opens on every client with ten columns, six attention tiles and one row per client", () => {
    render(<Harness />);
    expect(screen.getByText("Lab work / All clients")).toBeVisible();
    expect(within(board()).getAllByRole("region")).toHaveLength(10);
    expect(cards()).toHaveLength(demoOrders.filter(o => !o.released).length);
    expect(within(screen.getByRole("group", { name: "Attention states" })).getAllByRole("button")).toHaveLength(6);
    const strip = screen.getByRole("group", { name: "Filter by client" });
    expect(within(strip).getAllByRole("button")).toHaveLength(demoClients.length + 1);
    expect(within(strip).getByRole("button", { name: /^All clients/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
  });
  it("uses the attention tiles as toggling filters and keeps the other counts visible", () => {
    render(<Harness />);
    const blocked = demoOrders.filter(o => !o.released && gateStatus(o.gates) === "fail");
    const tile = screen.getByRole("button", { name: new RegExp(`^Blocked at a gate ${blocked.length}`) });
    fireEvent.click(tile);
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(cards()).toHaveLength(blocked.length);
    for (const card of cards()) expect(card).toHaveAttribute("data-gate", "fail");
    expect(screen.getByRole("button", { name: /^Ready to advance \d/ })).toBeVisible();
    expect(within(chipList()).getByRole("button", { name: "Remove filter: Blocked at a gate" })).toBeVisible();
    fireEvent.click(tile);
    expect(tile).toHaveAttribute("aria-pressed", "false");
    expect(cards()).toHaveLength(demoOrders.filter(o => !o.released).length);
  });
  it("combines several clients, shows them as removable chips and clears everything at once", () => {
    render(<Harness />);
    const strip = screen.getByRole("group", { name: "Filter by client" });
    fireEvent.click(within(strip).getByRole("button", { name: /Example Cedar/ }));
    fireEvent.click(within(strip).getByRole("button", { name: /Example Harbor/ }));
    const shown = demoOrders.filter(o => !o.released && (o.clientId === "example-cedar" || o.clientId === "example-harbor"));
    expect(cards()).toHaveLength(shown.length);
    expect(screen.getByText("Lab work / 2 clients")).toBeVisible();
    expect(within(chipList()).getAllByRole("button").map(b => b.textContent?.replace("×", "").trim())).toEqual(["Example Cedar", "Example Harbor", "Clear all"]);
    fireEvent.click(within(chipList()).getByRole("button", { name: "Remove filter: Example Cedar" }));
    expect(cards()).toHaveLength(demoOrders.filter(o => !o.released && o.clientId === "example-harbor").length);
    expect(screen.getByText("Lab work / Example Harbor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Ready to advance/ }));
    fireEvent.click(within(chipList()).getByRole("button", { name: "Clear all" }));
    expect(cards()).toHaveLength(demoOrders.filter(o => !o.released).length);
    expect(within(strip).getByRole("button", { name: /^All clients/ })).toHaveAttribute("aria-pressed", "true");
  });
  it("keeps the per-client counts for unselected clients so the scope can be widened", () => {
    render(<Harness initial={{ ...emptyFilters, clients: ["example-atlas"] }} />);
    const strip = screen.getByRole("group", { name: "Filter by client" });
    const cedarOpen = demoOrders.filter(o => !o.released && o.clientId === "example-cedar").length;
    expect(within(strip).getByRole("button", { name: /Example Cedar/ })).toHaveTextContent(`${cedarOpen} open`);
    expect(within(strip).getByRole("button", { name: /Example Atlas/ })).toHaveAttribute("aria-pressed", "true");
  });
  it("explains an empty result without hiding the stage headings", () => {
    render(<Harness initial={{ ...emptyFilters, query: "nonexistent order" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("No orders match these filters.");
    expect(screen.getByRole("status")).toHaveTextContent("Nothing contains “nonexistent order”");
    expect(screen.getByRole("region", { name: "Request" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("combines a stage from the menu with a client, and searches sample codes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Sequence exported/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Filter by client" })).getByRole("button", { name: /Example Cedar/ }));
    expect(cards().map(card => card.getAttribute("aria-label"))).toEqual(["ORD047"]);
    fireEvent.change(search(), { target: { value: "ORD047-S012" } });
    expect(cards()).toHaveLength(1);
    fireEvent.change(search(), { target: { value: "ORD047-S099" } });
    expect(cards()).toHaveLength(0);
  });
  it("groups by client as swimlanes when asked", () => {
    render(<Harness initial={{ ...emptyFilters, group: "client" }} />);
    expect(screen.queryByRole("region", { name: "Order pipeline" })).not.toBeInTheDocument();
    const lanes = screen.getByRole("region", { name: "Orders by client" });
    expect(within(lanes).getAllByRole("region")).toHaveLength(demoClients.length);
    expect(within(within(lanes).getByRole("region", { name: "Example Juniper" })).getAllByRole("article")).toHaveLength(demoOrders.filter(o => !o.released && o.clientId === "example-juniper").length);
    expect(within(lanes).getAllByText(/^0\d · /).length).toBeGreaterThan(0);
  });
  it("shows the released list only for the week when that tile is chosen", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^Released this week/ }));
    expect(screen.queryByRole("region", { name: "Order pipeline" })).not.toBeInTheDocument();
    const list = within(screen.getByRole("region", { name: "Released this week" })).getAllByRole("listitem");
    expect(list).toHaveLength(2);
    expect(screen.queryByText("ORD038")).not.toBeInTheDocument();
  });
  it("lists a release that was withdrawn as such, not as a current release", () => {
    const orders = demoOrders.map(o => (o.code === "ORD038" ? { ...o, releasedAt: undefined, retired: { version: 1, status: "withdrawn" as const, reason: "wrong metadata", at: "2026-11-06T12:00:00Z" } } : o));
    render(<Pipeline data={scopeToAudience(orders, demoClients, "staff", [])} filters={emptyFilters} onChange={() => undefined} now={now} />);
    const item = within(screen.getByRole("region", { name: "Released" })).getByRole("link", { name: "ORD038" }).closest("li")!;
    expect(item).toHaveTextContent(/· then withdrawn$/);
  });
  it("marks mixed batches with both clients for staff", () => {
    render(<Harness />);
    const shared = within(board()).getByRole("article", { name: "ORD046" });
    expect(shared).toHaveTextContent("Batch B2026-031 · shared with Example Cedar");
    expect(shared.querySelector(".companion")).toHaveAttribute("title", "Batch shared with Example Cedar");
  });
  it("shows the attention counts' reference instant in the lab's clock", () => {
    render(<Harness />);
    expect(screen.getByText("07:00 EST")).toBeVisible();
  });
});

describe("client audience (P1-2)", () => {
  const otherNames = demoClients.filter(client => client.id !== "example-meridian").map(client => client.name);
  it("renders nothing from other clients, not even in attributes, and keeps shared runs anonymous", () => {
    const { container } = render(<Harness audience="client" ownClients={["example-meridian"]} />);
    const html = container.innerHTML;
    for (const name of otherNames) expect(html, name).not.toContain(name);
    const shared = within(board()).getByRole("article", { name: "ORD046" });
    expect(shared).toHaveTextContent("Batch B2026-031 · also contains another client’s samples");
    expect(shared.querySelector(".companion")).toHaveAttribute("title", "Shared run");
    expect(cards().map(card => card.getAttribute("aria-label")).sort()).toEqual(demoOrders.filter(o => !o.released && o.clientId === "example-meridian").map(o => o.code).sort());
  });
  it("lists only the user's own clients in the client strip and swimlanes", () => {
    const { container } = render(<Harness audience="client" ownClients={["example-meridian", "example-harbor"]} initial={{ ...emptyFilters, group: "client" }} />);
    const strip = screen.getByRole("group", { name: "Filter by client" });
    expect(within(strip).getAllByRole("button").map(button => button.textContent?.replace(/\d+ open.*$/, "").trim())).toEqual(["All clients", "Example Meridian", "Example Harbor"]);
    expect(within(screen.getByRole("region", { name: "Orders by client" })).getAllByRole("region").map(lane => lane.getAttribute("aria-label"))).toEqual(["Example Meridian", "Example Harbor"]);
    for (const name of ["Example Atlas", "Example Cedar", "Example Juniper"]) expect(container.innerHTML).not.toContain(name);
  });
});

describe("facet counts (P1-3)", () => {
  it("counts the population each menu actually filters, including released orders when the focus is Released", () => {
    render(<Harness initial={{ ...emptyFilters, focus: "released" }} />);
    const option = (name: RegExp) => screen.getByRole("checkbox", { name }).closest("label")!.querySelector(".menu-count")!.textContent;
    expect(option(/Panel A · broad lipidome/)).toBe("1");
    expect(option(/Panel C · sterols/)).toBe("1");
    expect(option(/Demo Operator/)).toBe("2");
    expect(option(/Excel built/)).toBe("2");
    expect(option(/In batch/)).toBe("0");
  });
  it("counts both the board and the released list when no focus is pressed", () => {
    render(<Harness />);
    const excel = screen.getByRole("checkbox", { name: /Excel built/ }).closest("label")!.querySelector(".menu-count")!.textContent;
    expect(excel).toBe(String(demoOrders.filter(o => o.stage === 9).length));
  });
});

describe("chip focus (P2-7)", () => {
  const initial: PipelineFilters = { ...emptyFilters, clients: ["example-atlas", "example-cedar"], stages: [4] };
  it("moves focus to the next chip, then to the previous one, then to the search box", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial} />);
    const chip = (name: string) => within(chipList()).getByRole("button", { name: `Remove filter: ${name}` });
    chip("Example Atlas").focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(chip("Example Cedar"));
    await user.click(chip("Stage: In batch"));
    expect(document.activeElement).toBe(chip("Example Cedar"));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(search());
  });
  it("sends focus to the search box after Clear all", async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial} />);
    await user.click(within(chipList()).getByRole("button", { name: "Clear all" }));
    expect(document.activeElement).toBe(search());
  });
});

describe("long values (P2-9)", () => {
  it("truncates the visible chip label but keeps the full value in the accessible name and the remove control", () => {
    const long = "Panel with a very long name that keeps going ".repeat(3).trim();
    render(<Harness initial={{ ...emptyFilters, panels: [long], query: "x".repeat(200) }} />);
    const chip = within(chipList()).getByRole("button", { name: `Remove filter: Panel: ${long}` });
    expect(chip.querySelector(".chip-label")).toHaveTextContent(`Panel: ${long}`);
    expect(chip).toHaveAttribute("title", `Panel: ${long}`);
    expect(chip.querySelector(".chip-remove")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("x".repeat(200));
  });
});
