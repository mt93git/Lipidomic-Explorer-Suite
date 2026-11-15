import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChooseClientPage from "../src/app/(workspace)/choose-client/page";
import { requireSession } from "@/lib/session";
import { demoSession } from "@/lib/demo";

vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/app/actions", () => ({ chooseClient: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

beforeEach(() => vi.mocked(requireSession).mockResolvedValue(demoSession));
const props = () => ({ searchParams: Promise.resolve({}) });

describe("client chooser", () => {
  it("sends lab staff to the all-clients overview instead of asking for a client", async () => {
    await expect(ChooseClientPage(props())).rejects.toThrow("redirect:/pipeline");
  });
  it("shows all memberships to a client user with several clients", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ...demoSession, view: "client", role: "Client admin" });
    render(await ChooseClientPage(props()));
    expect(screen.getByRole("heading", { name: "Choose client" })).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(demoSession.clients.length);
    expect(screen.getByRole("button", { name: /Example Cedar/ })).toBeVisible();
  });
  it("continues directly to the portal for a single client", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ...demoSession, view: "client", clients: [demoSession.clients[0]] });
    await expect(ChooseClientPage(props())).rejects.toThrow("redirect:/client/home");
  });
  it("allows lab staff without client memberships to use their lab workspace", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ...demoSession, clients: [], selectedClient: null });
    await expect(ChooseClientPage(props())).rejects.toThrow("redirect:/pipeline");
  });
  it("explains missing memberships to a client with no access", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ...demoSession, view: "client", clients: [], selectedClient: null });
    render(await ChooseClientPage(props()));
    expect(screen.getByText(/No client memberships are assigned/)).toBeVisible();
  });
});
