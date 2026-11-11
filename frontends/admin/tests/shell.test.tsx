import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { demoSession } from "@/lib/demo";

const pathname = vi.hoisted(() => ({ current: "/pipeline" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams("client=example-cedar") }));
vi.mock("@/app/actions", () => ({ signOut: vi.fn(), switchView: vi.fn() }));

const nav = () => screen.getByRole("navigation", { name: "Admin navigation" });
const groupLinks = (title: string) => within(within(nav()).getByText(title).closest(".nav-group") as HTMLElement).getAllByRole("link").map(link => link.getAttribute("href"));

describe("app shell", () => {
  it("shows the brand, client scope, staff role, example label, and the working screens grouped by the flow", () => {
    render(<AppShell session={demoSession}><h1>Pipeline content</h1></AppShell>);
    expect(screen.getByText("Lipidomic Explorer")).toBeVisible();
    expect(screen.getByText("ADMIN")).toBeVisible();
    expect(screen.getByText("Example data")).toBeVisible();
    expect(screen.getByText("Operator")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search orders" })).toBeVisible();
    expect(groupLinks("LAB WORK")).toEqual(["/pipeline", "/new-order", "/receive-shipment", "/sample-registry", "/batch-builder", "/storage", "/batch-run", "/ingest-results", "/name-dictionary", "/qc-review", "/release", "/datasets"]);
    expect(groupLinks("CLIENTS")).toEqual(["/clients"]);
    expect(groupLinks("ORGANIZATION")).toEqual(["/people", "/roles-permissions", "/audit-log", "/release-policy", "/shipping-instructions", "/instruments-panels", "/notifications"]);
    for (const name of ["Pipeline", "Receive shipment", "Sample registry", "Ingest results", "Name dictionary", "Release", "Datasets", "Audit log"]) expect(within(nav()).getByRole("link", { name })).toBeVisible();
    expect(within(nav()).getByRole("link", { name: "Release policy" })).toHaveAttribute("href", "/release-policy");
    expect(within(nav()).getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
    for (const gone of ["Sign in", "Choose client", "Order detail", "Sample detail", "Client detail"]) expect(within(nav()).queryByRole("link", { name: gone })).not.toBeInTheDocument();
    expect(within(nav()).queryByText("ACCESS")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lab staff" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("main")).toHaveTextContent("Pipeline content");
  });
  it("shows no Coming next group once every screen is ready", () => {
    render(<AppShell session={demoSession}>Board</AppShell>);
    expect(within(nav()).queryByText(/Coming next/)).not.toBeInTheDocument();
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
  it("shows only the portal navigation for a client, with the client chooser in the top bar", () => {
    render(<AppShell session={{ ...demoSession, view: "client", role: "Client admin", selectedClient: demoSession.clients[0] }}>Portal</AppShell>);
    expect(screen.getByRole("link", { name: /Example Atlas/ })).toHaveAttribute("href", "/choose-client");
    expect(screen.queryByRole("group", { name: "Client scope" })).not.toBeInTheDocument();
    expect(within(nav()).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/client/home", "/client/request-order", "/notifications"]);
    expect(within(nav()).getByRole("link", { name: "Home" })).toBeVisible();
    expect(within(nav()).queryByText(/Coming next/)).not.toBeInTheDocument();
    expect(screen.queryByText("ORGANIZATION")).not.toBeInTheDocument();
  });
  it("never offers the mock view switch or example label in live mode", () => {
    render(<AppShell session={{ ...demoSession, mock: false }}>Live</AppShell>);
    expect(screen.queryByRole("button", { name: "Lab staff" })).not.toBeInTheDocument();
    expect(screen.queryByText("Example data")).not.toBeInTheDocument();
  });
});

describe("phone top bar menu", () => {
  const menu = () => document.getElementById("topbar-menu") as HTMLElement;
  it("renders a Menu button that starts collapsed and controls the panel holding the tools", () => {
    render(<AppShell session={demoSession}>Board</AppShell>);
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "topbar-menu");
    expect(menu()).not.toHaveAttribute("data-open");
    // brand and search stay in the bar itself, the rest moves into the panel
    expect(menu()).not.toContainElement(screen.getByRole("searchbox", { name: "Search orders" }));
    expect(menu()).not.toContainElement(screen.getByText("Lipidomic Explorer"));
    for (const control of [screen.getByRole("button", { name: "Lab staff" }), screen.getByRole("button", { name: "Client" }), screen.getByRole("group", { name: "Client scope" }), screen.getByText("Operator"), screen.getByRole("button", { name: "Sign out" })]) expect(menu()).toContainElement(control);
  });
  it("toggles open and closed from the button", async () => {
    const user = userEvent.setup();
    render(<AppShell session={demoSession}>Board</AppShell>);
    const button = screen.getByRole("button", { name: "Menu" });
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(menu()).toHaveAttribute("data-open", "true");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(menu()).not.toHaveAttribute("data-open");
  });
  it("closes on Escape and returns focus to the button", async () => {
    const user = userEvent.setup();
    render(<AppShell session={demoSession}>Board</AppShell>);
    const button = screen.getByRole("button", { name: "Menu" });
    await user.click(button);
    screen.getByRole("button", { name: "Sign out" }).focus();
    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(menu()).not.toHaveAttribute("data-open");
    expect(button).toHaveFocus();
  });
  it("leaves Escape alone while the menu is closed", async () => {
    const user = userEvent.setup();
    render(<AppShell session={demoSession}>Board</AppShell>);
    screen.getByRole("button", { name: "Sign out" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
  });
  it("still posts sign-out and the view switch to the same server actions", async () => {
    const user = userEvent.setup();
    const actions = await import("@/app/actions");
    render(<AppShell session={demoSession}>Board</AppShell>);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(actions.signOut).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Client" }));
    await waitFor(() => expect(actions.switchView).toHaveBeenCalledTimes(1));
    expect((vi.mocked(actions.switchView).mock.calls[0][0] as FormData).get("view")).toBe("client");
  });
  it("offers the client chooser and no view switch in a live client session", () => {
    render(<AppShell session={{ ...demoSession, mock: false, view: "client", role: "Client admin", selectedClient: demoSession.clients[0] }}>Portal</AppShell>);
    expect(menu()).toContainElement(screen.getByRole("link", { name: /Example Atlas/ }));
    expect(screen.queryByRole("button", { name: "Lab staff" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });
});
