// New order wizard (0033): the rate sheet and order drafts through the seam (demo store and live RPCs), the server
// actions, the page and the wizard itself (steps, estimate, sample list, save draft). Synthetic data only.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWizard, type WizardData } from "@/lib/order-wizard";

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
const catalog = await import("@/lib/data/instruments-panels");
const drafts = await import("@/lib/data/order-drafts");
const { listOrders } = await import("@/lib/data/orders");
const actions = await import("@/app/(workspace)/new-order/actions");
const { default: Page } = await import("@/app/(workspace)/new-order/page");
const { default: CatalogPage } = await import("@/app/(workspace)/instruments-panels/page");
const { OrderWizard } = await import("@/app/(workspace)/new-order/order-wizard");

const staff = (role = "Operator", mock = true) => ({ userId: "example-staff", role, view: "staff", displayName: "Demo lab person", mock, clients: [], selectedClient: null });
const owner = "example-owner";
const PANEL_A = "Panel A · broad lipidome";
const wizard = (fields: Partial<WizardData>): WizardData => ({ ...emptyWizard(), ...fields });
const page = (query: Record<string, string> = {}) => Page({ searchParams: Promise.resolve(query) });
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  state.mock = true;
  state.session = staff();
});

describe("rate sheet (demo)", () => {
  it("starts empty: the demo invents no money", async () => {
    expect(await catalog.listPanelRates()).toEqual([]);
    expect((await drafts.listWizardPanels()).find(panel => panel.id === PANEL_A)).toMatchObject({ instrumentName: "Demo QQQ 1", rate: null });
  });

  it("an Owner sets and clears a panel's line; the wizard reads it", async () => {
    await catalog.setPanelRate({ panelId: PANEL_A, ratePerSample: 70, currency: " usd ", minutesPerInjection: 33, actorId: owner });
    expect((await drafts.listWizardPanels()).find(panel => panel.id === PANEL_A)?.rate).toEqual({ panelId: PANEL_A, ratePerSample: 70, currency: "USD", minutesPerInjection: 33 });
    await catalog.setPanelRate({ panelId: PANEL_A, ratePerSample: null, currency: null, minutesPerInjection: null, actorId: owner });
    expect(await catalog.listPanelRates()).toEqual([{ panelId: PANEL_A, ratePerSample: null, currency: null, minutesPerInjection: null }]);
  });

  it("refuses what set_panel_rate refuses, and an Operator", async () => {
    await expect(catalog.setPanelRate({ panelId: PANEL_A, ratePerSample: 10, currency: null, minutesPerInjection: null, actorId: owner })).rejects.toThrow("A rate needs its currency, and a currency needs a rate.");
    await expect(catalog.setPanelRate({ panelId: PANEL_A, ratePerSample: 10, currency: "dollars", minutesPerInjection: null, actorId: owner })).rejects.toThrow(/three-letter code/);
    await expect(catalog.setPanelRate({ panelId: PANEL_A, ratePerSample: null, currency: null, minutesPerInjection: 0, actorId: owner })).rejects.toThrow(/more than 0/);
    await expect(catalog.setPanelRate({ panelId: "missing", ratePerSample: null, currency: null, minutesPerInjection: 5, actorId: owner })).rejects.toThrow("Panel not found.");
    await expect(catalog.setPanelRate({ panelId: PANEL_A, ratePerSample: 1, currency: "USD", minutesPerInjection: null, actorId: "example-staff" })).rejects.toThrow(/Owner or Admin/);
    expect(await catalog.listPanelRates()).toEqual([]);
  });

  it("the Instruments & panels action reads the form (12,5 is 12.5) and returns with a confirmation", async () => {
    const { setRateAction } = await import("@/app/(workspace)/instruments-panels/actions");
    await expect(setRateAction({}, form({ panelId: PANEL_A, ratePerSample: "12,5", currency: "eur", minutesPerInjection: "", actor: owner }))).rejects.toThrow("redirect:/instruments-panels?done=rate-saved");
    expect(await catalog.listPanelRates()).toEqual([{ panelId: PANEL_A, ratePerSample: 12.5, currency: "EUR", minutesPerInjection: null }]);
    expect(await setRateAction({}, form({ panelId: PANEL_A, ratePerSample: "twelve", currency: "EUR", actor: owner }))).toEqual({ error: "Rate per sample must be a number." });
  });

  it("the Instruments & panels page lists the rate sheet with not set, and opens a panel's rate form", async () => {
    await catalog.setPanelRate({ panelId: PANEL_A, ratePerSample: 70, currency: "USD", minutesPerInjection: 33, actorId: owner });
    render(await CatalogPage({ searchParams: Promise.resolve({ rate: PANEL_A }) }));
    const table = screen.getByRole("table", { name: "Rate sheet" });
    expect(within(table).getByText(PANEL_A).closest("tr")).toHaveTextContent(`${PANEL_A}USD 70.0033 min`);
    expect(within(table).getByText("Custom MRM list").closest("tr")).toHaveTextContent("Not set");
    const section = screen.getByRole("region", { name: `Rate for ${PANEL_A}` });
    expect(within(section).getByLabelText("Rate per sample")).toHaveValue("70");
    expect(within(section).getByLabelText("Currency")).toHaveValue("USD");
  });
});

describe("drafts and placing (demo)", () => {
  it("saves, resumes, lists and discards a draft", async () => {
    const id = await drafts.saveOrderDraft({ id: null, step: 2, data: wizard({ clientId: "example-atlas", title: "Synthetic draft", expectedSamples: "67" }) });
    expect(await drafts.getOpenDraft(id)).toEqual({ id, step: 2, data: wizard({ clientId: "example-atlas", title: "Synthetic draft", expectedSamples: "67" }) });
    expect(await drafts.saveOrderDraft({ id, step: 3, data: wizard({ clientId: "example-atlas", title: "Synthetic draft 2" }) })).toBe(id);
    expect(await drafts.listOpenDrafts()).toEqual([{ id, step: 3, clientId: "example-atlas", title: "Synthetic draft 2", updatedAt: expect.any(String), updatedBy: "Demo lab person" }]);
    await drafts.discardOrderDraft(id);
    expect(await drafts.listOpenDrafts()).toEqual([]);
    expect(await drafts.getOpenDraft(id)).toBeNull();
    await expect(drafts.saveOrderDraft({ id, step: 1, data: wizard({}) })).rejects.toThrow("This draft was discarded.");
  });

  it("places a draft as an order at Request and closes the draft; a placed draft cannot be placed again", async () => {
    const data = wizard({ clientId: "example-atlas", title: "Synthetic placed", panelId: PANEL_A, matrix: "Serum", expectedSamples: "67", studyDesign: "Groups", billingMethod: "po", billingRef: "PO-1", notes: "Dry ice." });
    const id = await drafts.saveOrderDraft({ id: null, step: 4, data });
    const code = await drafts.placeOrder({ draftId: id, data });
    expect((await listOrders()).find(order => order.code === code)).toMatchObject({ description: "Synthetic placed", panel: PANEL_A, sampleCount: 67, sampleType: "Serum", stage: 0 });
    expect(await drafts.listOpenDrafts()).toEqual([]);
    await expect(drafts.placeOrder({ draftId: id, data })).rejects.toThrow(`This draft was already placed as order ${code}.`);
  });

  it("the place action checks every step again and keeps a pasted list on a draft linked to the order", async () => {
    expect(await actions.placeOrderAction({ draftId: null, data: wizard({ clientId: "example-atlas" }) })).toEqual({ errors: { title: "Enter a title", panelId: "Choose a panel" } });
    const data = wizard({ clientId: "example-atlas", title: "Synthetic with list", panelId: PANEL_A, sampleList: "FullName\nS1\nS2" });
    await expect(actions.placeOrderAction({ draftId: null, data })).rejects.toThrow(/^redirect:\/new-order\?created=ORD\d+$/);
    const { readDemoOrderDrafts } = await import("@/lib/data/demo-store");
    expect((await readDemoOrderDrafts())[0]).toMatchObject({ orderCode: expect.stringMatching(/^ORD\d+$/), data: expect.objectContaining({ sampleList: "FullName\nS1\nS2" }) });
  });

  it("the save action keeps a half-filled draft and refuses a bad step", async () => {
    expect(await actions.saveDraftAction({ id: null, step: 1, data: {} })).toEqual({ ok: true, id: expect.any(String), savedAt: expect.any(String) });
    expect(await actions.saveDraftAction({ id: null, step: 9, data: {} })).toEqual({ ok: false, error: "That step does not exist." });
  });
});

describe("drafts and placing (live)", () => {
  it("calls save_order_draft and place_order_draft with exact arguments, and reads the code back", async () => {
    state.mock = false;
    state.session = staff("Operator", false);
    const rpc = vi.fn(async (name: string) => ({ data: name === "save_order_draft" ? "00000000-0000-4000-8000-000000000901" : "order-uuid", error: null }));
    const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { code: "ORD077" }, error: null }) }) }) }));
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ rpc, from }) } as never);
    const data = wizard({ clientId: "c1", title: " Synthetic ", panelId: "p1", expectedSamples: "67", studyDesign: "Groups", billingMethod: "charge_code", billingRef: "CC-1" });
    expect(await drafts.saveOrderDraft({ id: null, step: 2, data })).toBe("00000000-0000-4000-8000-000000000901");
    expect(rpc).toHaveBeenLastCalledWith("save_order_draft", { p_id: null, p_step: 2, p_client_id: "c1", p_title: " Synthetic ", p_data: data });
    expect(await drafts.placeOrder({ draftId: "00000000-0000-4000-8000-000000000901", data })).toBe("ORD077");
    expect(rpc).toHaveBeenLastCalledWith("place_order_draft", {
      p_id: "00000000-0000-4000-8000-000000000901", p_client_id: "c1", p_panel_id: "p1", p_title: "Synthetic", p_matrix: null, p_expected_samples: 67,
      p_billing_ref: "Internal charge code · CC-1", p_notes: "Study design: Groups.", p_data: data,
    });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "this draft was already placed as an order" } } as never);
    await expect(drafts.placeOrder({ draftId: "x", data })).rejects.toThrow("This draft was already placed as an order.");
  });
});

describe("page and wizard", () => {
  it("opens on step 1 with the heading, both buttons, the step bar, the estimate and what the client sees next", async () => {
    render(await page());
    expect(screen.getByRole("heading", { level: 1, name: "New order" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4. Orders can be placed by lab staff or by the client's Requester.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next: service" })).toBeInTheDocument();
    const steps = within(screen.getByRole("navigation", { name: "New order steps" })).getAllByRole("button");
    expect(steps.map(step => step.textContent)).toEqual(["1 Client", "2 Service", "3 Sample list", "4 Review & quote"]);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("region", { name: "Estimate" })).toHaveTextContent("Blanks and QC (added by the lab)included");
    expect(within(screen.getByRole("region", { name: "What the client sees next" })).getAllByRole("listitem")).toHaveLength(3);
  });

  it("Next checks the step; the Service step shows the asked fields; the estimate is not set without a rate", async () => {
    const panels = await drafts.listWizardPanels();
    render(<OrderWizard clients={[{ id: "example-atlas", name: "Example Atlas", color: "atlas" }]} panels={panels} placedBy="Demo lab person" initial={{ draftId: null, step: 1, data: emptyWizard() }} />);
    fireEvent.click(screen.getByRole("button", { name: "Next: service" }));
    expect(screen.getByText("Choose a client")).toBeInTheDocument();
    expect(screen.getByText("Enter a title")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Client" }), { target: { value: "example-atlas" } });
    fireEvent.change(screen.getByLabelText("Order title"), { target: { value: "Synthetic" } });
    fireEvent.click(screen.getByRole("button", { name: "Next: service" }));
    const service = screen.getByRole("region", { name: "Service" });
    for (const label of ["Client", "Panel", "Sample matrix", "Number of samples", "Study design", "Billing", "Notes for the lab"]) expect(within(service).getByLabelText(label)).toBeInTheDocument();
    fireEvent.change(within(service).getByLabelText("Panel"), { target: { value: PANEL_A } });
    fireEvent.change(within(service).getByLabelText("Number of samples"), { target: { value: "67" } });
    const estimate = screen.getByRole("region", { name: "Estimate" });
    expect(estimate).toHaveTextContent(`${PANEL_A}, 67 samplesnot set`);
    expect(estimate).toHaveTextContent("Run time on the Demo QQQ 1");
    expect(estimate).toHaveTextContent("80 injections × 12 min (batch builder default");
    expect(estimate).toHaveTextContent("≈ 16 h");
    expect(screen.getByText("Step 2 of 4. Orders can be placed by lab staff or by the client's Requester.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next: sample list" })).toBeInTheDocument();
  });

  it("the page estimates with the active profile's rules: blanks at start, between samples and pooled QC (demo: 4, 5 after every 4, none)", async () => {
    render(await page({ client: "example-atlas" }));
    fireEvent.change(screen.getByLabelText("Order title"), { target: { value: "Synthetic" } });
    fireEvent.click(screen.getByRole("button", { name: "Next: service" }));
    const service = screen.getByRole("region", { name: "Service" });
    fireEvent.change(within(service).getByLabelText("Panel"), { target: { value: PANEL_A } });
    fireEvent.change(within(service).getByLabelText("Number of samples"), { target: { value: "67" } });
    const estimate = screen.getByRole("region", { name: "Estimate" });
    // 67 samples + 4 at start + 16 × 5 between + 1 QC at the end = 152 injections.
    expect(estimate).toHaveTextContent("4 blanks at start, 80 between samples and 1 pooled QC, by the active profile's rules");
    expect(estimate).toHaveTextContent("152 injections × 12 min");
    expect(estimate).toHaveTextContent("≈ 30.5 h");
  });

  it("prices from the rate sheet, reads a pasted list, and Save draft keeps the draft", async () => {
    await catalog.setPanelRate({ panelId: PANEL_A, ratePerSample: 70, currency: "USD", minutesPerInjection: 33, actorId: owner });
    const panels = await drafts.listWizardPanels();
    const spy = vi.spyOn(actions, "saveDraftAction");
    render(<OrderWizard clients={[{ id: "example-atlas", name: "Example Atlas", color: "atlas" }]} panels={panels} placedBy="Demo lab person"
      initial={{ draftId: null, step: 3, data: wizard({ clientId: "example-atlas", title: "Synthetic", panelId: PANEL_A, expectedSamples: "67" }) }} />);
    expect(screen.getByRole("region", { name: "Estimate" })).toHaveTextContent("USD 4,690.00from the rate sheet, USD 70.00 per sample");
    expect(screen.getByRole("region", { name: "Estimate" })).toHaveTextContent("≈ 44 h");
    expect(screen.getByRole("link", { name: "Download template" })).toHaveAttribute("download", "sample-list-template.csv");
    fireEvent.change(screen.getByLabelText("Paste the sample list (optional)"), { target: { value: "FullName\tGroup1Term\nS1\tControl\nS2\tTreated" } });
    expect(screen.getByText("2 samples read")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use 2" }));
    expect(screen.getByRole("region", { name: "Estimate" })).toHaveTextContent(`${PANEL_A}, 2 samples`);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Draft saved at .*Saved drafts/));
    expect(spy).toHaveBeenCalledWith({ id: null, step: 3, data: expect.objectContaining({ expectedSamples: "2", sampleList: "FullName\tGroup1Term\nS1\tControl\nS2\tTreated" }) });
    expect(await drafts.listOpenDrafts()).toEqual([expect.objectContaining({ step: 3, title: "Synthetic" })]);
    expect(window.location.search).toMatch(/^\?draft=/);
  });

  it("resumes a draft from ?draft= and lists the others with Resume and Discard", async () => {
    const first = await drafts.saveOrderDraft({ id: null, step: 2, data: wizard({ clientId: "example-atlas", title: "Synthetic one", expectedSamples: "12" }) });
    await drafts.saveOrderDraft({ id: null, step: 1, data: wizard({ title: "Synthetic two" }) });
    render(await page({ draft: first }));
    expect(screen.getByText(/Resuming a saved draft, last saved by Demo lab person/)).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4. Orders can be placed by lab staff or by the client's Requester.")).toBeInTheDocument();
    expect(screen.getByLabelText("Number of samples")).toHaveValue(12);
    const list = screen.getByRole("region", { name: "Saved drafts" });
    expect(list).toHaveTextContent("Synthetic two");
    expect(list).not.toHaveTextContent("Synthetic one");
    expect(within(list).getByRole("link", { name: "Resume" })).toHaveAttribute("href", expect.stringMatching(/\/new-order\?draft=/));
    expect(within(list).getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("a refresh under the draft it just saved keeps the screen; another draft starts over", async () => {
    const panels = await drafts.listWizardPanels();
    const clients = [{ id: "example-atlas", name: "Example Atlas", color: "atlas" as const }];
    const props = { clients, panels, placedBy: "Demo lab person" };
    const view = render(<OrderWizard {...props} initial={{ draftId: null, step: 1, data: wizard({ clientId: "example-atlas", title: "Typed" }) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Draft saved at/));
    const [saved] = await drafts.listOpenDrafts();
    // Saving set the demo cookie, so Next refreshes the page under ?draft=<id>: the same draft, the screen stays.
    view.rerender(<OrderWizard {...props} initial={{ draftId: saved.id, step: 1, data: wizard({ clientId: "example-atlas", title: "Typed" }) }} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Draft saved at/);
    // Resume another draft: its own fields and step.
    view.rerender(<OrderWizard {...props} initial={{ draftId: "other", step: 2, data: wizard({ clientId: "example-atlas", title: "Other", expectedSamples: "9" }) }} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Number of samples")).toHaveValue(9);
  });

  it("says so when the draft asked for is no longer open", async () => {
    render(await page({ draft: "gone" }));
    expect(screen.getByText(/That draft is no longer open/)).toBeInTheDocument();
  });
});
