import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { demoSession } from "@/lib/demo";
import { navigation } from "@/lib/navigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/pipeline", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams("client=example-cedar") }));
vi.mock("@/app/actions", () => ({ signOut: vi.fn(), switchView: vi.fn() }));

describe("app shell", () => {
  it("shows the brand, client scope, staff role, example label, and grouped navigation", () => {
    render(<AppShell session={demoSession}><h1>Pipeline content</h1></AppShell>);
    expect(screen.getByText("Lipidomic Explorer")).toBeVisible();
    expect(screen.getByText("ADMIN")).toBeVisible();
    expect(screen.getByText("Example data")).toBeVisible();
    expect(screen.getByText("Operator")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search orders" })).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Admin navigation" });
    for (const group of navigation.filter(g => g.audience !== "client")) {
      expect(within(nav).getByText(group.title)).toBeVisible();
      for (const item of group.items.filter(item => item.href !== "/choose-client")) expect(within(nav).getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
    expect(within(nav).queryByRole("link", { name: "Choose client" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lab staff" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("main")).toHaveTextContent("Pipeline content");
  });
  it("reflects the overview's client filter in the top-bar scope and links every client into it", () => {
    render(<AppShell session={demoSession}>Board</AppShell>);
    const scope = screen.getByRole("group", { name: "Client scope" });
    expect(screen.getByText(/^Example Cedar/, { selector: "summary" })).toBeVisible();
    expect(within(scope).getByRole("link", { name: "All clients" })).toHaveAttribute("href", "/pipeline");
    expect(within(scope).getByRole("link", { name: "Example Cedar" })).toHaveAttribute("aria-current", "true");
    expect(within(scope).getByRole("link", { name: "Example Atlas" })).toHaveAttribute("href", "/pipeline?client=example-cedar&client=example-atlas");
    expect(screen.queryByRole("link", { name: /Choose client/ })).not.toBeInTheDocument();
  });
  it("shows only access and portal navigation for a client, with the client chooser", () => {
    render(<AppShell session={{ ...demoSession, view: "client", role: "Client admin", selectedClient: demoSession.clients[0] }}>Portal</AppShell>);
    expect(screen.getByRole("link", { name: /Example Atlas/ })).toHaveAttribute("href", "/choose-client");
    expect(screen.queryByRole("group", { name: "Client scope" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Client home" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Client order" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
    expect(screen.queryByText("ORGANIZATION")).not.toBeInTheDocument();
  });
  it("never offers the mock view switch or example label in live mode", () => {
    render(<AppShell session={{ ...demoSession, mock: false }}>Live</AppShell>);
    expect(screen.queryByRole("button", { name: "Lab staff" })).not.toBeInTheDocument();
    expect(screen.queryByText("Example data")).not.toBeInTheDocument();
  });
});
