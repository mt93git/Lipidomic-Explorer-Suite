// Datasets (a16), Clients (a17) and Client detail (a18): the columns, the colour squares, members by name or email
// (never a raw user id, 0037's client_people in live mode), the cards, and the client filter. Synthetic data only.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { jar, state } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  state: { mock: true, session: null as unknown },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => { jar.set(name, value); }, getAll: () => [] }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: () => state.mock ? { mock: true, url: "", anonKey: "" } : { mock: false, url: "https://example.test", anonKey: "anon-example" } }));
vi.mock("@/lib/session", () => ({
  getAppSession: vi.fn(async () => state.session),
  requireWorkspace: vi.fn(async () => state.session),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));

const { createAdminClient } = await import("@/lib/supabase/server");
const { getClient } = await import("@/lib/data/clients");
const { buildDataset, signDataset } = await import("@/lib/data/release");
const { default: ClientsPage } = await import("@/app/(workspace)/clients/page");
const { default: ClientPage } = await import("@/app/(workspace)/clients/[id]/page");
const { default: DatasetsPage } = await import("@/app/(workspace)/datasets/page");
const { fakePostgrest } = await import("./helpers/fake-postgrest");

const staff = (role = "Operator") => ({ userId: "example-staff", role, view: "staff", displayName: "Demo Operator", mock: true, clients: [], selectedClient: null });
const headers = (table: HTMLElement) => within(table).getAllByRole("columnheader").map(cell => cell.textContent);
const squareOf = (element: HTMLElement) => element.querySelector(".color-square")?.getAttribute("data-color");

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  state.mock = true;
  state.session = staff();
});

describe("a17 Clients", () => {
  it("lists each client with its colour square, code, type, billing, users, open orders and released; New client opens its form", async () => {
    render(await ClientsPage({ searchParams: Promise.resolve({}) }));
    const table = screen.getByRole("table", { name: "Active clients" });
    expect(headers(table)).toEqual(["Client", "Type", "Billing", "Users", "Open orders", "Released"]);
    const atlas = within(table).getByRole("link", { name: "Example Atlas" }).closest("tr")!;
    expect(squareOf(atlas)).toBe("atlas"); // the pipeline's colour
    const cells = within(atlas).getAllByRole("cell").map(cell => cell.textContent);
    expect(cells[0]).toContain("CL-001");
    expect(cells.slice(1)).toEqual(["PI lab", "charge code", "1", expect.stringMatching(/^\d+$/), expect.stringMatching(/^\d+$/)]);
    expect(Number(cells[5])).toBeGreaterThan(0); // Atlas has released example orders
    expect(screen.getByRole("link", { name: "New client" })).toHaveAttribute("href", "/clients/new");
    expect(screen.queryByRole("region", { name: "New client" })).toBeNull();
  });
});

describe("a18 Client detail", () => {
  it("header: colour square, name, code · kind · billing, Invite user and New order for this client", async () => {
    render(await ClientPage({ params: Promise.resolve({ id: "example-atlas" }), searchParams: Promise.resolve({}) }));
    const heading = screen.getByRole("heading", { level: 1, name: "Example Atlas" });
    expect(squareOf(heading)).toBe("atlas");
    expect(screen.getByText("CL-001 · PI lab · billing by charge code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Invite user" })).toHaveAttribute("href", "/people?client=example-atlas#invite-title");
    expect(screen.getByRole("link", { name: "New order" })).toHaveAttribute("href", "/new-order?client=example-atlas");
  });

  it("Users: person by name, role, last active; no two-step column and no user id; Orders: order, panel, samples, stage pill", async () => {
    render(await ClientPage({ params: Promise.resolve({ id: "example-atlas" }), searchParams: Promise.resolve({}) }));
    const users = screen.getByRole("table", { name: "Client members" });
    expect(headers(users)).toEqual(["Person", "Role", "Last active"]);
    const row = within(users).getAllByRole("row")[1];
    expect(row).toHaveTextContent("Demo Client Admin");
    expect(row).toHaveTextContent("Client admin");
    expect(within(row).getAllByRole("cell")[2].textContent).toMatch(/^(today|\d+ d|\d{1,2} [A-Z][a-z]{2} \d{4})$/);
    expect(document.body.textContent).not.toMatch(/example-client-member|user id|2-step|two-step/i);
    const orders = screen.getByRole("table", { name: "Client orders" });
    expect(headers(orders)).toEqual(["Order", "Panel", "Samples", "Stage"]);
    const first = within(orders).getAllByRole("row")[1];
    const cells = within(first).getAllByRole("cell");
    expect(cells[0].textContent).toMatch(/^ORD\d{3}$/);
    expect(cells[1].textContent).not.toBe("—");
    expect(cells[2].textContent).toMatch(/^\d+$/);
    expect(cells[3].querySelector("[data-tone]")).not.toBeNull();
  });

  it("cards: Nexo access (instead of a Team workspace), Documents and Billing; editing and archiving stay", async () => {
    render(await ClientPage({ params: Promise.resolve({ id: "example-cedar" }), searchParams: Promise.resolve({}) }));
    const nexo = screen.getByRole("region", { name: "Nexo access" });
    expect(within(nexo).getByTestId("nexo-state")).toHaveTextContent("Off");
    expect(within(nexo).getByRole("button", { name: "Turn Nexo access on" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Documents" })).getByText(/No documents yet/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Billing" })).getByText("charge code")).toBeInTheDocument();
    expect(screen.queryByText(/Team workspace/)).toBeNull();
    expect(screen.getByRole("region", { name: "Edit client" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Archive client" })).toBeInTheDocument();
  });

  it("live: members come from client_people by name or email with their last sign-in; when it cannot be read, names stay and the id never shows", async () => {
    state.mock = false;
    state.session = staff("Operator");
    const id = "00000000-0000-4000-8000-000000000100";
    const tables = { client: [{ id, code: "CL-007", name: "Synthetic Lab Alpha", kind: "internal_group", billing_method: "charge_code", notes: null, archived_at: null, archived_reason: null,
      nexo_access: false, members_prepare: false,
      client_member: [{ user_id: "00000000-0000-4000-8000-000000000011", role: "client_admin", archived_at: null, display_name: "Ada Example" }, { user_id: "00000000-0000-4000-8000-000000000012", role: "viewer", archived_at: null, display_name: null }],
      order: [] }], order: [], lab_staff: [], deliverable: [] };
    const db = fakePostgrest(tables);
    const rpc = vi.fn(async () => ({ error: null, data: [
      { user_id: "00000000-0000-4000-8000-000000000011", display_name: "Ada Example", email: "ada@alpha.example.test", role: "client_admin", last_sign_in_at: new Date().toISOString() },
      { user_id: "00000000-0000-4000-8000-000000000012", display_name: null, email: "kai@alpha.example.test", role: "viewer", last_sign_in_at: null },
    ] }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ ...db, from: db.from, rpc }) } as never);
    const client = await getClient(id);
    expect(rpc).toHaveBeenCalledWith("client_people", { p_client_id: id });
    expect(client?.members.map(member => [member.name, member.email, member.role])).toEqual([["Ada Example", "ada@alpha.example.test", "client_admin"], [null, "kai@alpha.example.test", "viewer"]]);
    render(await ClientPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }));
    const users = screen.getByRole("table", { name: "Client members" });
    expect(within(users).getAllByRole("row").slice(1).map(row => within(row).getAllByRole("cell").map(cell => cell.textContent))).toEqual([
      ["Ada Exampleada@alpha.example.test", "Client admin", "today"], ["kai@alpha.example.test", "Viewer", "never"]]);
    expect(screen.getByText("CL-007 · Internal group · billing by charge code")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("00000000-0000-4000-8000-0000000000");

    rpc.mockResolvedValueOnce({ error: { message: "function admin.client_people(uuid) does not exist" }, data: null } as never);
    const fallback = await getClient(id);
    expect(fallback?.members.map(member => member.name ?? member.email ?? null)).toEqual(["Ada Example", null]);
  });
});

describe("a16 Datasets", () => {
  it("columns, colour square, dataset name + version, counts, status pills incl. processing, released day; the client filter", async () => {
    state.session = { ...staff("Owner"), userId: "example-owner" };
    const built = await buildDataset({ orderId: "ORD048" });
    await signDataset({ datasetId: built.datasetId, role: "reviewed", note: null, actorId: "example-reviewer-a" });
    render(await DatasetsPage({ searchParams: Promise.resolve({}) }));
    const table = screen.getByRole("table", { name: "Dataset versions" });
    expect(headers(table)).toEqual(["Client", "Order", "Dataset", "Panel", "Samples", "Lipids", "Status", "Released"]);
    const row = within(table).getByRole("link", { name: "ORD048" }).closest("tr")!;
    expect(squareOf(row)).toBe("atlas");
    const cells = within(row).getAllByRole("cell").map(cell => cell.textContent);
    expect(cells[0]).toBe("Example Atlas");
    expect(cells[2]).toMatch(/ v1$/);
    expect(cells[3]).toMatch(/^Panel/);
    expect(Number(cells[4])).toBeGreaterThan(0);
    expect(Number(cells[5].replace(/,/g, ""))).toBeGreaterThan(0);
    expect(cells[6]).toContain("awaiting 2nd signature");
    expect(cells[7]).toBe("—");
    // Orders whose results were accepted and whose Excel is not built yet.
    expect(within(table).getAllByText("processing").length).toBeGreaterThan(0);
    expect(screen.getByText("Filter: all clients")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Clients" })).getByRole("link", { name: "Example Cedar" })).toHaveAttribute("href", "/datasets?client=example-cedar");
  });

  it("?client= keeps that client's rows only and names it on the filter", async () => {
    render(await DatasetsPage({ searchParams: Promise.resolve({ client: "example-harbor" }) }));
    expect(screen.getByText("Filter: Example Harbor")).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "Dataset versions" })).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("Example Harbor");
  });
});
