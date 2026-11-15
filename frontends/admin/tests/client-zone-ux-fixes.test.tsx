// The client zone UX review's top 10 (docs/admin/client-zone-ux-review/review.html), one block per fix. Synthetic data only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { ClientOrderDetail } from "@/components/client-order-detail";
import { LabDeliverables } from "@/components/deliverables";
import { LabContact } from "@/components/lab-contact";
import { OrderDetail } from "@/components/order-detail";
import { approvalMessage, declineMessage, type AccessRequest } from "@/lib/access-requests";
import { auditSummary, entityLabel } from "@/lib/audit";
import type { ClientOrder } from "@/lib/client-portal";
import { clientOrderFromRow, type ClientOrderRow } from "@/lib/data/client-orders";
import type { Deliverable } from "@/lib/deliverables";
import { demoSession } from "@/lib/demo";
import type { Client, Order } from "@/lib/models";
import { CONTACT_LIMIT, parseContactText } from "@/lib/order-request";
import { acceptDemoInvitation, createDemoInvitation, demoPeopleSeed } from "@/lib/people";
import { permissions } from "@/lib/roles";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/client/home", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions", () => ({ signOut: vi.fn(), switchView: vi.fn(), chooseClient: vi.fn() }));
vi.mock("@/app/(workspace)/people/actions", () => ({ answerAccessAction: vi.fn() }));
vi.mock("@/app/request-access/actions", () => ({ requestAccessAction: vi.fn(async () => ({})) }));
vi.mock("@/lib/session", () => ({ getAppSession: vi.fn(), requireSession: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn(() => ({ mock: false, url: "", anonKey: "" })) }));
vi.mock("@/components/sign-in-form", () => ({ SignInForm: () => <form aria-label="Sign in form" /> }));
vi.mock("@/lib/data/client-orders", async (original) => ({ ...await original<object>(), listClientOrders: vi.fn() }));
vi.mock("@/lib/data/clients", () => ({ clientNexoAccess: vi.fn() }));
vi.mock("@/lib/data/deliverables", () => ({ countClientDeliverables: vi.fn() }));
vi.mock("@/lib/data/order-requests", () => ({ getClientContact: vi.fn(), getShippingInstructions: vi.fn() }));
vi.mock("@/app/(workspace)/shipping-instructions/actions", () => ({ setShippingAction: vi.fn(), setContactAction: vi.fn() }));

const { answerAccessAction } = await import("@/app/(workspace)/people/actions");
const { getAppSession, requireSession, requireWorkspace } = await import("@/lib/session");
const { listClientOrders } = await import("@/lib/data/client-orders");
const { clientNexoAccess } = await import("@/lib/data/clients");
const { countClientDeliverables } = await import("@/lib/data/deliverables");
const { getClientContact, getShippingInstructions } = await import("@/lib/data/order-requests");

afterEach(() => { vi.unstubAllEnvs(); });
beforeEach(() => { vi.clearAllMocks(); });

const clientSession = { ...demoSession, view: "client" as const, role: "Requester", selectedClient: demoSession.clients[1] };
const clientOrder = (over: Partial<ClientOrder> = {}): ClientOrder => ({
  code: "ORD059", clientId: "example-cedar", title: "Plasma lipidome · diet study", stage: "request", review: "pending", acceptedAt: null, declineReason: null,
  panel: null, matrix: "Plasma", billingRef: "PO-EXAMPLE-0059", expectedSamples: 24, registeredSamples: 0, requestedAt: "2026-11-10T14:31:00Z", receivedAt: null,
  release: null, requestedBy: "Rowan Example", notes: "Ship the week of Nov 17.\nFasting samples.", ...over,
});
const released = clientOrder({ code: "ORD040", stage: "released", review: "accepted", acceptedAt: "2026-10-08T13:00:00Z", requestedBy: null, notes: null,
  release: { version: 1, releasedAt: "2026-11-05T21:20:00Z", datasetId: "44444444-4444-4444-8444-444444444444" } });
const file = { id: "d-1", title: "Study report", kind: "report" as const, fileName: "study-report.pdf", contentType: "application/pdf", sizeBytes: 2048, addedAt: "2026-11-09T15:00:00Z" };

describe("1 · lab pages on a phone with access requests waiting", () => {
  it("the People counter's screen-reader text has a positioned ancestor: .nav-link is position: relative", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\n\.nav-link \{[^}]*position: relative;/);
  });
});

describe("2 · Released with Nexo off says how the results arrive", () => {
  it("with files: the files below; without: the lab is preparing them; with Nexo: Open in Nexo", () => {
    const { unmount } = render(<ClientOrderDetail order={released} clientName="Example Cedar" example={false} files={[file]} />);
    expect(screen.getByText(/Your results are in the files below\./)).toBeVisible();
    unmount();
    const empty = render(<ClientOrderDetail order={released} clientName="Example Cedar" example={false} />);
    expect(screen.getByText(/The lab is preparing your files; they will appear here\./)).toBeVisible();
    empty.unmount();
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo/");
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "1");
    render(<ClientOrderDetail order={released} clientName="Example Cedar" example={false} nexoAccess />);
    expect(screen.getByText(/Open it in Nexo to explore the results\./)).toBeVisible();
    expect(screen.queryByText(/files below|preparing your files/)).toBeNull();
  });

  it("Client home: the Released tile says Results released by the lab while Nexo is off, and a Datasets row counts its files", async () => {
    const { default: ClientHomePage } = await import("@/app/(workspace)/client/home/page");
    vi.mocked(requireWorkspace).mockResolvedValue(clientSession as never);
    vi.mocked(listClientOrders).mockResolvedValue([released, clientOrder({ code: "ORD041", title: "Second release", stage: "released", review: "accepted", release: { version: 1, releasedAt: null, datasetId: "d" } })]);
    vi.mocked(clientNexoAccess).mockResolvedValue(false);
    vi.mocked(countClientDeliverables).mockResolvedValue(new Map([["ORD040", 2]]));
    vi.mocked(getClientContact).mockResolvedValue(null);
    const { unmount } = render(await ClientHomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Results released by the lab")).toBeVisible();
    expect(screen.queryByText("Datasets you can open")).toBeNull();
    const rows = within(screen.getByRole("region", { name: "Datasets" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("· 2 files");
    expect(rows[1]).not.toHaveTextContent(/file/);
    unmount();
    vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", "1");
    vi.mocked(clientNexoAccess).mockResolvedValue(true);
    render(await ClientHomePage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Datasets you can open")).toBeVisible();
  });
});

const labClient: Client = { id: "example-cedar", name: "Example Cedar", color: "cedar" };
const labOrder = (over: Partial<Order> = {}): Order => ({
  code: "ORD059", clientId: labClient.id, description: "Plasma lipidome · diet study", stage: 0, sampleCount: 24, completedSamples: 0, sampleType: "Plasma", panel: "Panel A",
  due: "", received: "", owner: "Unassigned", released: false, gates: [{ label: "Shipment received", status: "pending" }],
  history: [{ date: "2026-11-10T14:31:00Z", title: "Requested by the client", actor: "Rowan Example" }],
  request: { status: "accepted", requestedAt: "2026-11-10T14:31:00Z", requestedBy: "Rowan Example", notes: "Ship the week of Nov 17.", billingRef: "PO-EXAMPLE-0059", panelId: "Panel A", reviewedAt: "2026-11-10T15:00:00Z", reason: null },
  ...over,
});
const facts = () => Object.fromEntries(within(screen.getByRole("region", { name: "Order facts" })).getAllByRole("term").map(term => [term.textContent, term.nextElementSibling?.textContent]));

describe("3 · an accepted request keeps what the client asked for", () => {
  it("Order facts keep Requested by, Panel and Billing ref.; Notes from the client stay in the left column", () => {
    render(<OrderDetail order={labOrder()} client={labClient} example={false} />);
    expect(facts()).toMatchObject({ "Requested by": "Rowan Example", Panel: "Panel A", "Billing ref.": "PO-EXAMPLE-0059", Samples: "24", Material: "Plasma" });
    expect(screen.getByText("Notes from the client").parentElement).toHaveTextContent("Ship the week of Nov 17.");
  });
  it("an order the lab opened has none of them", () => {
    render(<OrderDetail order={labOrder({ request: undefined })} client={labClient} example={false} />);
    expect(Object.keys(facts())).toEqual(["Client", "Order", "Samples", "Material", "Received", "Target date", "Assigned to"]);
    expect(screen.queryByText("Notes from the client")).toBeNull();
  });
});

describe("4 · client members' names (0023)", () => {
  it("demo: a member who came through an access request is named after it, else by the invited email", () => {
    const at = new Date("2026-11-10T12:00:00Z");
    let state = createDemoInvitation(demoPeopleSeed(), { email: "robin@larch.example.test", labRole: null, clientId: "example-cedar", clientRole: "requester",
      actor: { userId: "example-owner", role: "owner" }, token: "a".repeat(64), id: "inv-1", now: at });
    state = createDemoInvitation(state, { email: "kai@larch.example.test", labRole: null, clientId: "example-cedar", clientRole: "viewer",
      actor: { userId: "example-owner", role: "owner" }, token: "b".repeat(64), id: "inv-2", now: at });
    const nameFor = (id: string) => id === "inv-1" ? "Robin Example" : undefined;
    state = acceptDemoInvitation(state, { token: "a".repeat(64), userId: "u-robin", now: at, nameFor });
    state = acceptDemoInvitation(state, { token: "b".repeat(64), userId: "u-kai", now: at, nameFor });
    expect(state.people.filter(person => ["u-robin", "u-kai"].includes(person.userId)).map(person => person.name)).toEqual(["Robin Example", "kai@larch.example.test"]);
  });
});

const deliverable = (over: Partial<Deliverable> = {}): Deliverable => ({
  id: "d-1", orderCode: "ORD040", clientId: "example-cedar", datasetVersion: 1, title: "Study report", kind: "report", fileName: "study-report.pdf",
  contentType: "application/pdf", sizeBytes: 2048, sha256: "a".repeat(64), storagePath: "x", visibleToClient: false, addedAt: "2026-11-09T15:00:00Z",
  addedBy: "Demo Operator", retiredAt: null, retiredReason: null, ...over,
});

describe("5 · Deliverables in the left column, the files before the form", () => {
  it("renders the section between the gate panel and History", () => {
    render(<OrderDetail order={labOrder()} client={labClient} example={false}><section aria-label="Deliverables section" /></OrderDetail>);
    const order = [screen.getByRole("heading", { level: 2, name: /Ready for/ }), screen.getByRole("region", { name: "Deliverables section" }), screen.getByRole("heading", { level: 2, name: "History" })];
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].closest(".detail-grid > div")).not.toBeNull();
  });
  it("lists the files before the add form; a released order whose client sees no file says so", () => {
    const { unmount } = render(<LabDeliverables code="ORD040" open example={false} dataset={null} released items={[deliverable(), deliverable({ id: "d-2", visibleToClient: true, retiredAt: "2026-11-10T10:00:00Z", retiredReason: "Old" })]} />);
    const list = screen.getByRole("list", { name: "Deliverables" });
    expect(list.compareDocumentPosition(screen.getByRole("form", { name: "Add a deliverable" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("The client sees no files for this order yet.")).toBeVisible();
    unmount();
    const shown = render(<LabDeliverables code="ORD040" open example={false} dataset={null} released items={[deliverable({ visibleToClient: true })]} />);
    expect(screen.queryByText("The client sees no files for this order yet.")).toBeNull();
    shown.unmount();
    render(<LabDeliverables code="ORD044" open example={false} dataset={null} items={[]} />);
    expect(screen.queryByText("The client sees no files for this order yet.")).toBeNull();
  });
});

describe("6 and 7 · the client's shell", () => {
  it("no search box for a client; the badge and the sidebar footer say Client portal", () => {
    const { unmount } = render(<AppShell session={clientSession}>Portal</AppShell>);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText(/Client search/)).toBeNull();
    expect(document.querySelector(".brand .badge")).toHaveTextContent(/^CLIENT PORTAL$/);
    expect(document.querySelector(".sidebar-footer")).toHaveTextContent("Client portal");
    unmount();
    render(<AppShell session={demoSession}>Lab</AppShell>);
    expect(screen.getByRole("searchbox", { name: "Search orders" })).toBeVisible();
    expect(document.querySelector(".sidebar-footer")).toHaveTextContent("Admin · Phase 1");
  });
});

describe("7 · client-facing words", () => {
  it("Sign in speaks to clients and the lab", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Lipidomics service")).toBeVisible();
    expect(screen.getByText("Sign in to follow your orders or to work in the lab.")).toBeVisible();
    expect(screen.queryByText(/Lab administration|lab workspace/)).toBeNull();
  });
  it("Choose client calls them clients, not workspaces", async () => {
    const { default: ChooseClientPage } = await import("@/app/(workspace)/choose-client/page");
    vi.mocked(requireSession).mockResolvedValue({ ...clientSession, selectedClient: null } as never);
    const { container } = render(await ChooseClientPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Your clients")).toBeVisible();
    expect(screen.getByText("Choose which client's orders to see.")).toBeVisible();
    expect(screen.getAllByText(/Open →/)).toHaveLength(demoSession.clients.length);
    expect(container.textContent).not.toMatch(/workspace/i);
  });
  it("the client's order has no lab note under its facts", () => {
    const { unmount } = render(<ClientOrderDetail order={released} clientName="Example Cedar" example={false} />);
    expect(screen.queryByText(/Scientific values/)).toBeNull();
    expect(screen.queryByText("Example data only.")).toBeNull();
    unmount();
    render(<ClientOrderDetail order={released} clientName="Example Cedar" example />);
    expect(screen.getByText("Example data only.")).toBeVisible();
  });
  it("Not found: the client reads that the order is not available to them and goes back to their orders", async () => {
    const { default: NotFound } = await import("@/app/not-found");
    vi.mocked(getAppSession).mockResolvedValue(clientSession as never);
    const { unmount } = render(await NotFound());
    expect(screen.getByText("This order is not available to you.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to your orders" })).toHaveAttribute("href", "/client/home");
    unmount();
    vi.mocked(getAppSession).mockResolvedValue(demoSession as never);
    render(await NotFound());
    expect(screen.getByRole("link", { name: "Back to workspace" })).toHaveAttribute("href", "/");
  });
});

describe("8 · the lab's contact for clients (0023)", () => {
  it("a blank text clears it; a long one is refused", () => {
    const form = (text: string) => { const data = new FormData(); data.set("text", text); return data; };
    expect(parseContactText(form("  Write to lab@example.test  "))).toEqual({ ok: true, text: "Write to lab@example.test" });
    expect(parseContactText(form("   "))).toEqual({ ok: true, text: null });
    expect(parseContactText(form("x".repeat(CONTACT_LIMIT + 1)))).toMatchObject({ ok: false });
  });
  it("empty shows nothing; set, it shows with the reference to quote", () => {
    const { container, unmount } = render(<LabContact text={null} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    render(<LabContact text="Write to lab@example.test" quote="AR-0013" />);
    expect(screen.getByRole("note", { name: "Contact the lab" })).toHaveTextContent("Write to lab@example.test");
    expect(screen.getByText("AR-0013")).toBeVisible();
  });
  it("on the client's order while waiting and once declined, not on later steps", () => {
    const { unmount } = render(<ClientOrderDetail order={clientOrder()} clientName="Example Cedar" example={false} contact="Write to lab@example.test" />);
    expect(screen.getByRole("note", { name: "Contact the lab" })).toHaveTextContent("Quote ORD059 when you write.");
    unmount();
    const closed = render(<ClientOrderDetail order={clientOrder({ review: "declined", declineReason: "Not before March." })} clientName="Example Cedar" example={false} contact="Write to lab@example.test" />);
    expect(screen.getByRole("note", { name: "Contact the lab" })).toBeVisible();
    closed.unmount();
    render(<ClientOrderDetail order={clientOrder({ review: "accepted", acceptedAt: "2026-11-11T13:00:00Z" })} clientName="Example Cedar" example={false} contact="Write to lab@example.test" />);
    expect(screen.queryByRole("note", { name: "Contact the lab" })).toBeNull();
  });
  it("on Request access and in Your access", async () => {
    const { RequestAccessForm } = await import("@/app/request-access/request-access-form");
    const { unmount } = render(<RequestAccessForm contact="Write to lab@example.test" />);
    expect(screen.getByRole("note", { name: "Contact the lab" })).toHaveTextContent("Write to lab@example.test");
    unmount();
    const bare = render(<RequestAccessForm />);
    expect(screen.queryByRole("note", { name: "Contact the lab" })).toBeNull();
    bare.unmount();
    const { default: ClientHomePage } = await import("@/app/(workspace)/client/home/page");
    vi.mocked(requireWorkspace).mockResolvedValue(clientSession as never);
    vi.mocked(listClientOrders).mockResolvedValue([]);
    vi.mocked(clientNexoAccess).mockResolvedValue(false);
    vi.mocked(countClientDeliverables).mockResolvedValue(new Map());
    vi.mocked(getClientContact).mockResolvedValue({ text: "Write to lab@example.test", setAt: "2026-11-10T12:00:00Z", setBy: null });
    render(await ClientHomePage({ searchParams: Promise.resolve({}) }));
    expect(within(screen.getByRole("region", { name: "Requester" })).getByRole("note", { name: "Contact the lab" })).toBeVisible();
  });
  it("the Shipping instructions page holds it as a second text: Owner/Admin edit it, an Operator reads it", async () => {
    const { default: ShippingPage } = await import("@/app/(workspace)/shipping-instructions/page");
    vi.mocked(getShippingInstructions).mockResolvedValue(null);
    vi.mocked(getClientContact).mockResolvedValue({ text: "Write to lab@example.test", setAt: "2026-11-10T12:00:00Z", setBy: null });
    vi.mocked(requireWorkspace).mockResolvedValue({ ...demoSession, mock: false, role: "Admin" } as never);
    const { unmount } = render(await ShippingPage({ searchParams: Promise.resolve({ saved: "contact" }) }));
    expect(screen.getByRole("form", { name: "Contact for clients" })).toBeVisible();
    expect(screen.getByLabelText("Contact clients read")).toHaveValue("Write to lab@example.test");
    expect(screen.getByRole("status")).toHaveTextContent("Contact for clients saved.");
    unmount();
    vi.mocked(requireWorkspace).mockResolvedValue({ ...demoSession, mock: false, role: "Operator" } as never);
    render(await ShippingPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("form", { name: "Contact for clients" })).toBeNull();
    expect(screen.getByText("Only a lab Owner or Admin changes the contact for clients.")).toBeVisible();
  });
  it("the lab's permission row names set_client_contact; the audit log names the change", () => {
    expect(permissions.find(row => row.key === "shipping_instructions")?.rpcs).toEqual(["set_shipping_instructions", "set_client_contact"]);
    expect(entityLabel("client_contact")).toBe("Contact for clients");
    expect(auditSummary({ id: 1, at: "2026-11-10T12:00:00Z", actor: null, clientId: null, entity: "client_contact", entityId: "c", action: "INSERT", before: null, after: { body: "x" } } as never, { people: {}, orders: {}, datasets: {} })).toBe("Contact for clients changed");
  });
});

describe("9 · the client's Order facts show what they asked for", () => {
  it("Requested by and Your notes; an order the lab opened says The lab and None", () => {
    const { unmount } = render(<ClientOrderDetail order={clientOrder()} clientName="Example Cedar" example={false} />);
    expect(facts()).toMatchObject({ "Requested by": "Rowan Example", "Your notes": "Ship the week of Nov 17.\nFasting samples." });
    unmount();
    render(<ClientOrderDetail order={released} clientName="Example Cedar" example={false} />);
    expect(facts()).toMatchObject({ "Requested by": "The lab", "Your notes": "None" });
  });
  it("a live row: the member's name and notes on a request; nothing of the lab's own notes on an order it opened", () => {
    const row: ClientOrderRow = {
      code: "ORD059", title: "Plasma", stage: "request", matrix: null, expected_samples: 6, billing_ref: null, client_id: "c1", created_at: "2026-11-10T14:31:00Z",
      review: "pending", reviewed_at: null, archived_reason: null, panel: null, sample: [], shipment: [], dataset: [], requested_by: "u-rowan", notes: "Fasting.",
    };
    expect(clientOrderFromRow(row, new Map([["u-rowan", "Rowan Example"]]))).toMatchObject({ requestedBy: "Rowan Example", notes: "Fasting." });
    expect(clientOrderFromRow(row)).toMatchObject({ requestedBy: "A member of your client" });
    expect(clientOrderFromRow({ ...row, review: "accepted", reviewed_at: "2026-11-11T13:00:00Z" })).toMatchObject({ requestedBy: "A member of your client", notes: "Fasting." });
    expect(clientOrderFromRow({ ...row, review: "accepted", notes: "Internal lab note" })).toMatchObject({ requestedBy: null, notes: null });
  });
});

describe("10 · People: the lab writes to the requester itself", () => {
  it("ready messages: the link, 7 days, single use; a decline without the lab's internal reason", () => {
    const approved = approvalMessage({ fullName: "Robin Example", reference: "AR-0013", link: "https://lab.example/admin/invite/abc" });
    expect(approved).toMatch(/^Hello Robin Example,/);
    expect(approved).toContain("AR-0013");
    expect(approved).toContain("\nhttps://lab.example/admin/invite/abc\n");
    expect(approved).toMatch(/works once and is valid for 7 days/);
    const declined = declineMessage({ fullName: null, reference: "AR-0011" });
    expect(declined).toMatch(/^Hello,\n/);
    expect(declined).toMatch(/AR-0011.*cannot give you access/);
  });

  const request: AccessRequest = {
    id: "r1", reference: "AR-0011", createdAt: "2026-11-09T12:00:00Z", status: "pending", fullName: "Robin Example", email: "robin@larch.example.test", organisation: "Example Larch",
    kind: "company", message: null, decidedAt: null, decidedBy: null, declineReason: null, clientId: null, invitationId: null, erasedAt: null, matchingClientId: null,
  };
  it("after a decline the notice keeps the requester's email and offers Copy message", async () => {
    const { AccessRequests } = await import("@/app/(workspace)/people/access-requests");
    vi.mocked(answerAccessAction).mockResolvedValue({ requestId: "r1", declined: true });
    const user = userEvent.setup();
    const { rerender } = render(<AccessRequests requests={[request]} clients={[]} actors={null} />);
    await user.click(screen.getByRole("button", { name: /Review/ }));
    await user.click(screen.getByRole("button", { name: "Decline…" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Synthetic: not a service we offer" } });
    await user.click(screen.getByRole("button", { name: "Decline request" }));
    rerender(<AccessRequests requests={[{ ...request, status: "declined" }]} clients={[]} actors={null} />);
    const notice = await screen.findByText(/declined\. The app does not tell the requester/);
    expect(notice).toHaveTextContent("Request AR-0011 from Robin Example, robin@larch.example.test declined.");
    await user.click(within(notice).getByRole("button", { name: "Copy message" }));
    expect(await navigator.clipboard.readText()).toBe(declineMessage({ fullName: "Robin Example", reference: "AR-0011" }));
    expect(within(notice).getByRole("button", { name: "Copied" })).toBeVisible();
  });
  it("approving shows Copy link and Copy message", async () => {
    const { AccessRequests } = await import("@/app/(workspace)/people/access-requests");
    vi.mocked(answerAccessAction).mockResolvedValue({ requestId: "r1", link: "/admin/invite/" + "c".repeat(64) });
    const user = userEvent.setup();
    const { rerender } = render(<AccessRequests requests={[request]} clients={[{ id: "example-cedar", name: "Example Cedar" }]} actors={null} />);
    await user.click(screen.getByRole("button", { name: /Review/ }));
    await user.click(screen.getByRole("button", { name: "Approve and create invitation link" }));
    rerender(<AccessRequests requests={[{ ...request, status: "approved" }]} clients={[{ id: "example-cedar", name: "Example Cedar" }]} actors={null} />);
    await user.click(await screen.findByRole("button", { name: "Copy message" }));
    const link = `${window.location.origin}/admin/invite/${"c".repeat(64)}`;
    expect(await navigator.clipboard.readText()).toBe(approvalMessage({ fullName: "Robin Example", reference: "AR-0011", link }));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
  });
});
