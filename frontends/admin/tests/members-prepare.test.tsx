// The per-client "members prepare in Nexo" switch (0024's admin.client.members_prepare): lab Owner or Admin, in the
// client's settings right next to the Nexo access switch, shown and changeable only while Nexo access is on; client
// members never change it. Demo seam, live RPC, server action and page. Synthetic data only.
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
  requireWorkspace: vi.fn(async (audience: string) => {
    const session = state.session as { view: string } | null;
    if (!session) throw new Error("redirect:/sign-in");
    if (audience === "staff" && session.view !== "staff") throw new Error("redirect:/client/home");
    return session;
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/action-redirect", () => ({ redirectAfterAction: async (url: string) => { throw new Error(`redirect:${url}`); } }));

const { createAdminClient } = await import("@/lib/supabase/server");
const { getClient, setClientMembersPrepare, setClientNexoAccess } = await import("@/lib/data/clients");
const { setMembersPrepareAction } = await import("@/app/(workspace)/clients/actions");
const { default: ClientPage } = await import("@/app/(workspace)/clients/[id]/page");

const staff = (role = "Operator") => ({ userId: "example-staff", role, view: "staff", displayName: "Demo lab person", mock: true, clients: [], selectedClient: null });
const member = { userId: "example-client", role: "Client admin", view: "client", displayName: "Rowan Example", mock: true, clients: [{ id: "example-cedar", name: "Example Cedar", color: "cedar" }], selectedClient: null };
const EXPLANATION = "Members of this client may prepare datasets and upload their own Excel in Nexo";
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
const page = (id = "example-cedar") => ClientPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  state.mock = true;
  state.session = staff();
});

describe("data seam (demo)", () => {
  it("off by default; an Owner or Admin turns it on only while Nexo access is on, and off again; the Operator is refused", async () => {
    expect((await getClient("example-cedar"))?.membersPrepare).toBe(false);
    await expect(setClientMembersPrepare({ clientId: "example-cedar", enabled: true, actorId: "example-owner" })).rejects.toThrow("Turn Nexo access on for this client first");
    await setClientNexoAccess({ clientId: "example-cedar", enabled: true, actorId: "example-owner" });
    await expect(setClientMembersPrepare({ clientId: "example-cedar", enabled: true })).rejects.toThrow(/Owner or Admin/);
    await setClientMembersPrepare({ clientId: "example-cedar", enabled: true, actorId: "example-owner" });
    expect((await getClient("example-cedar"))?.membersPrepare).toBe(true);
    expect((await getClient("example-harbor"))?.membersPrepare).toBe(false);
    await setClientMembersPrepare({ clientId: "example-cedar", enabled: false, actorId: "example-reviewer-a" });
    expect((await getClient("example-cedar"))?.membersPrepare).toBe(false);
  });
});

describe("data seam (live)", () => {
  it("calls set_client_members_prepare and reads members_prepare with the client", async () => {
    state.mock = false;
    state.session = staff("Admin");
    const rpc = vi.fn(async () => ({ error: null }));
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ error: null, data: {
      id: "00000000-0000-4000-8000-000000000100", name: "Synthetic Lab Alpha", kind: "pi_lab", billing_method: null, notes: null, archived_at: null, archived_reason: null,
      nexo_access: true, members_prepare: true, client_member: [], order: [] } })) };
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ rpc, from: () => query }) } as never);
    await setClientMembersPrepare({ clientId: "00000000-0000-4000-8000-000000000100", enabled: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("set_client_members_prepare", { p_client_id: "00000000-0000-4000-8000-000000000100", p_enabled: true });
    expect((await getClient("00000000-0000-4000-8000-000000000100"))?.membersPrepare).toBe(true);
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("members_prepare"));
  });
});

describe("server action", () => {
  it("turns it on for an Owner and returns to the client with a confirmation", async () => {
    await setClientNexoAccess({ clientId: "example-cedar", enabled: true, actorId: "example-owner" });
    await expect(setMembersPrepareAction({}, form({ clientId: "example-cedar", enabled: "true", actor: "example-owner" }))).rejects.toThrow("redirect:/clients/example-cedar?prepare=on");
    expect((await getClient("example-cedar"))?.membersPrepare).toBe(true);
  });
  it("answers a refusal as the form's error", async () => {
    expect(await setMembersPrepareAction({}, form({ clientId: "example-cedar", enabled: "true", actor: "example-owner" }))).toEqual({ error: "Turn Nexo access on for this client first." });
  });
  it("a client member never changes it", async () => {
    state.session = member;
    await expect(setMembersPrepareAction({}, form({ clientId: "example-cedar", enabled: "true", actor: "example-owner" }))).rejects.toThrow("redirect:/client/home");
    state.session = staff();
    expect((await getClient("example-cedar"))?.membersPrepare).toBe(false);
  });
});

describe("client settings page", () => {
  it("with Nexo access off, the members switch is not shown", async () => {
    render(await page());
    expect(screen.queryByText(EXPLANATION, { exact: false })).toBeNull();
    expect(screen.queryByTestId("prepare-state")).toBeNull();
  });
  it("with Nexo access on, shows it next to the Nexo switch with its one-line explanation and the button to change it", async () => {
    await setClientNexoAccess({ clientId: "example-cedar", enabled: true, actorId: "example-owner" });
    render(await page());
    const nexo = screen.getByRole("region", { name: "Nexo access" });
    expect(within(nexo).getByText(`${EXPLANATION}.`)).toBeInTheDocument();
    expect(within(nexo).getByTestId("prepare-state")).toHaveTextContent("Off");
    expect(within(nexo).getByRole("button", { name: "Let members prepare in Nexo" })).toBeInTheDocument();
    expect(within(nexo).getByRole("button", { name: "Turn Nexo access off" })).toBeInTheDocument();
  });
  it("on: says so and offers to turn it off", async () => {
    await setClientNexoAccess({ clientId: "example-cedar", enabled: true, actorId: "example-owner" });
    await setClientMembersPrepare({ clientId: "example-cedar", enabled: true, actorId: "example-owner" });
    render(await page());
    expect(screen.getByTestId("prepare-state")).toHaveTextContent("On");
    expect(screen.getByRole("button", { name: "Stop members preparing in Nexo" })).toBeInTheDocument();
  });
  it("lab staff who are not Owner or Admin see the state but no button (live)", async () => {
    state.mock = false;
    state.session = staff("Operator");
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ error: null, data: {
      id: "00000000-0000-4000-8000-000000000100", name: "Synthetic Lab Alpha", kind: "pi_lab", billing_method: null, notes: null, archived_at: null, archived_reason: null,
      nexo_access: true, members_prepare: false, client_member: [], order: [] } })) };
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ from: () => query }) } as never);
    render(await page("00000000-0000-4000-8000-000000000100"));
    expect(screen.getByTestId("prepare-state")).toHaveTextContent("Off");
    expect(screen.queryByRole("button", { name: /members prepar/ })).toBeNull();
  });
  it("a client member cannot open the page", async () => {
    state.session = member;
    await expect(page()).rejects.toThrow("redirect:/client/home");
  });
});
