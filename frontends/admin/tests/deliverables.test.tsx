// Client deliverables and the per-client Nexo switch (F4, 0021): the file rules, the download guard and headers, the
// upload route's guard, the lab's section, the client's list and Open in Nexo. Synthetic data only.
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientOrderDetail } from "@/components/client-order-detail";
import { ClientDeliverables, LabDeliverables } from "@/components/deliverables";
import type { ClientOrder } from "@/lib/client-portal";
import { uploadTarget } from "@/lib/deliverable-upload";
import {
  checkUpload, clientMayOpenNexo, contentMatches, DELIVERABLE_MAX_BYTES, deliverablePath, deliverableType, downloadDecision, downloadHeaders,
  forClient, safeFileName, uploadNotices, type Deliverable,
} from "@/lib/deliverables";

afterEach(() => { vi.unstubAllEnvs(); });

const bytes = (text: string) => new TextEncoder().encode(text);
const PDF = bytes("%PDF-1.7\n% synthetic\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SVG = bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>');
const item = (over: Partial<Deliverable> = {}): Deliverable => ({
  id: "d-1", orderCode: "ORD040", clientId: "example-cedar", datasetVersion: 1, title: "Study report", kind: "report", fileName: "study-report.pdf",
  contentType: "application/pdf", sizeBytes: 2048, sha256: "a".repeat(64), storagePath: "x", visibleToClient: true, addedAt: "2026-11-09T15:00:00Z",
  addedBy: "Demo Operator", retiredAt: null, retiredReason: null, ...over,
});

describe("the file rules (0021's, in the app)", () => {
  it("knows the six types by extension, and nothing else", () => {
    expect(["a.pdf", "b.PNG", "c.jpg", "d.jpeg", "e.svg", "f.xlsx", "g.csv"].map(deliverableType)).toEqual([
      "application/pdf", "image/png", "image/jpeg", "image/jpeg", "image/svg+xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv",
    ]);
    for (const name of ["notes.txt", "page.html", "report", "report.pdf.exe", "x.xls"]) expect(deliverableType(name), name).toBeNull();
  });

  it("stores a safe name: no folders, spaces or accents, the extension kept and lower-cased, 120 characters at most", () => {
    expect(safeFileName("Study report (final).PDF")).toBe("Study-report-final.pdf");
    expect(safeFileName("C:\\Users\\lab\\Figure 1 – Lípidos.png")).toBe("Figure-1-Lipidos.png");
    expect(safeFileName("../../etc/passwd.csv")).toBe("passwd.csv");
    expect(safeFileName(".hidden.svg")).toBe("hidden.svg");
    expect(safeFileName("–.pdf")).toBe("file.pdf");
    expect(safeFileName(`${"x".repeat(300)}.xlsx`)).toHaveLength(120);
    expect(safeFileName("script.html")).toBeNull();
    expect(deliverablePath("c1", "ORD040", "f".repeat(64), "report.pdf")).toBe(`c1/ORD040/deliverables/${"f".repeat(64)}/report.pdf`);
  });

  it("checks the first bytes against the type: a renamed page is not a PNG, an SVG must be an SVG, a CSV is not markup", () => {
    expect(contentMatches("application/pdf", PDF)).toBe(true);
    expect(contentMatches("image/png", PNG)).toBe(true);
    expect(contentMatches("image/png", bytes("<html><script>alert(1)</script>"))).toBe(false);
    expect(contentMatches("image/svg+xml", SVG)).toBe(true);
    expect(contentMatches("image/svg+xml", bytes("<html><svg></svg></html>"))).toBe(false);
    expect(contentMatches("text/csv", bytes("lipid,area\nPC 34:1,1000\n"))).toBe(true);
    expect(contentMatches("text/csv", bytes("<script>alert(1)</script>"))).toBe(false);
    expect(contentMatches("image/jpeg", PDF)).toBe(false);
  });

  it("names the problem with an upload, before anything is stored", () => {
    const base = { title: "Study report", kind: "report", fileName: "report.pdf", bytes: PDF, visible: false };
    expect(checkUpload(base)).toMatchObject({ ok: true, value: { title: "Study report", kind: "report", fileName: "report.pdf", contentType: "application/pdf" } });
    const problem = (over: Partial<typeof base>) => { const r = checkUpload({ ...base, ...over }); return r.ok ? "ok" : r.problem; };
    expect(problem({ title: "  " })).toBe("title");
    expect(problem({ kind: "invoice" })).toBe("kind");
    expect(problem({ bytes: new Uint8Array() })).toBe("empty");
    expect(problem({ bytes: new Uint8Array(DELIVERABLE_MAX_BYTES + 1) })).toBe("size");
    expect(problem({ fileName: "notes.txt" })).toBe("type");
    expect(problem({ fileName: "figure.png" })).toBe("content");
    for (const key of ["title", "kind", "empty", "size", "type", "content", "duplicate", "closed", "failed", "added", "retired"]) expect(uploadNotices[key], key).toBeDefined();
  });
});

describe("the download guard", () => {
  const client = { view: "client" as const, clients: [{ id: "example-cedar", name: "Example Cedar", color: "cedar" }] };
  const staff = { view: "staff" as const, clients: [] };
  it("signed out: 401; unknown: 404", () => {
    expect(downloadDecision(null, item())).toEqual({ ok: false, status: 401 });
    expect(downloadDecision(client, null)).toEqual({ ok: false, status: 404 });
  });
  it("a client user downloads only a live, visible file of their own client; anything else is not found", () => {
    expect(downloadDecision(client, item())).toEqual({ ok: true });
    expect(downloadDecision(client, item({ clientId: "example-harbor" }))).toEqual({ ok: false, status: 404 });
    expect(downloadDecision(client, item({ visibleToClient: false }))).toEqual({ ok: false, status: 404 });
    expect(downloadDecision(client, item({ retiredAt: "2026-11-10T10:00:00Z" }))).toEqual({ ok: false, status: 404 });
  });
  it("lab staff download any file, hidden and retired ones too", () => {
    expect(downloadDecision(staff, item({ clientId: "example-harbor", visibleToClient: false, retiredAt: "2026-11-10T10:00:00Z" }))).toEqual({ ok: true });
  });
  it("always an attachment with nosniff and a sandboxing CSP; an SVG is sent as application/octet-stream", () => {
    const svg = downloadHeaders(item({ fileName: "figure-1.svg", contentType: "image/svg+xml", sizeBytes: 120 }));
    expect(svg).toMatchObject({ "Content-Type": "application/octet-stream", "X-Content-Type-Options": "nosniff", "Content-Length": "120", "Cache-Control": "private, no-store" });
    expect(svg["Content-Disposition"]).toMatch(/^attachment; filename="figure-1\.svg"/);
    expect(svg["Content-Security-Policy"]).toContain("sandbox");
    expect(downloadHeaders(item())).toMatchObject({ "Content-Type": "application/pdf", "Content-Disposition": expect.stringMatching(/^attachment;/) });
    expect(downloadHeaders(item({ fileName: 'a"b.pdf' }))["Content-Disposition"]).toMatch(/^attachment; filename="a_b\.pdf"; filename\*=UTF-8''a%22b\.pdf$/);
  });
  it("a client's copy carries no storage path, digest or staff name", () => {
    expect(Object.keys(forClient(item())).sort()).toEqual(["addedAt", "contentType", "fileName", "id", "kind", "sizeBytes", "title"]);
  });
});

describe("the upload route's guard (before the body is read)", () => {
  const writer = { view: "staff" as const, role: "Operator" };
  const ok = { session: writer, code: "ORD040", origin: "http://127.0.0.1:3110", host: "127.0.0.1:3110", length: 1000 };
  it("a lab writer from the app's own origin may upload", () => {
    expect(uploadTarget(ok)).toBe("ok");
    for (const role of ["Owner", "Admin"]) expect(uploadTarget({ ...ok, session: { view: "staff", role } }), role).toBe("ok");
  });
  it("refuses the signed out, client users, a lab member, another origin, a bad code and a body over 50 MB", () => {
    expect(uploadTarget({ ...ok, session: null })).toBe("sign-in");
    expect(uploadTarget({ ...ok, session: { view: "client", role: "Client admin" } })).toBe("forbidden");
    expect(uploadTarget({ ...ok, session: { view: "staff", role: "Member" } })).toBe("forbidden");
    expect(uploadTarget({ ...ok, origin: "https://evil.example" })).toBe("forbidden");
    expect(uploadTarget({ ...ok, origin: null })).toBe("forbidden");
    expect(uploadTarget({ ...ok, origin: "not a url" })).toBe("forbidden");
    expect(uploadTarget({ ...ok, code: null })).toBe("not-found");
    expect(uploadTarget({ ...ok, length: DELIVERABLE_MAX_BYTES + 1024 * 1024 })).toBe("size");
  });
});

describe("Open in Nexo for a client", () => {
  it("needs both the environment gate and the lab's switch", () => {
    expect([clientMayOpenNexo(true, true), clientMayOpenNexo(true, false), clientMayOpenNexo(false, true), clientMayOpenNexo(false, false)]).toEqual([true, false, false, false]);
  });

  const released: ClientOrder = {
    code: "ORD040", clientId: "example-cedar", title: "Released example dataset", stage: "released", review: "accepted", acceptedAt: "2026-10-01T10:00:00Z",
    declineReason: null, panel: "Panel A", matrix: "Plasma", billingRef: null, expectedSamples: 12, registeredSamples: 12, requestedAt: "2026-10-01T10:00:00Z",
    receivedAt: "2026-10-12", release: { version: 1, releasedAt: "2026-11-05T21:20:00Z", datasetId: "44444444-4444-4444-8444-444444444444" },
  };
  const nexo = () => screen.queryByRole("link", { name: "Open in Nexo" });
  it("the client's order shows the button only with the gate on and the switch on", () => {
    vi.stubEnv("NEXT_PUBLIC_NEXO_URL", "https://lab.example/nexo");
    for (const [gate, access, shown] of [["1", true, true], ["1", false, false], ["", true, false]] as const) {
      vi.stubEnv("NEXT_PUBLIC_NEXO_CLIENT_ACCESS", gate);
      const { unmount } = render(<ClientOrderDetail order={released} clientName="Example Cedar" example nexoAccess={access} />);
      if (shown) expect(nexo(), `${gate} ${access}`).toHaveAttribute("href", "https://lab.example/nexo/?dataset=44444444-4444-4444-8444-444444444444");
      else expect(nexo(), `${gate} ${access}`).toBeNull();
      unmount();
    }
  });

  it("lists the shared files on the Released step, and earlier only once the lab shares one", () => {
    const files = [forClient(item())];
    const { unmount } = render(<ClientOrderDetail order={released} clientName="Example Cedar" example files={files} />);
    const list = screen.getByRole("list", { name: "Your files" });
    expect(within(list).getByRole("link", { name: "Download Study report" })).toHaveAttribute("href", "/admin/deliverables/d-1");
    unmount();
    const inAnalysis: ClientOrder = { ...released, stage: "acquired", release: null };
    const empty = render(<ClientOrderDetail order={inAnalysis} clientName="Example Cedar" example />);
    expect(screen.queryByRole("heading", { name: "Your files" })).toBeNull();
    empty.unmount();
    render(<ClientOrderDetail order={inAnalysis} clientName="Example Cedar" example files={files} />);
    expect(screen.getByRole("heading", { name: "Your files" })).toBeVisible();
  });
});

describe("the screens", () => {
  it("the client's list: one download per file, an empty note otherwise", () => {
    const { unmount } = render(<ClientDeliverables items={[forClient(item()), forClient(item({ id: "d-2", title: "Figure 1", kind: "figure", fileName: "f.png", contentType: "image/png", sizeBytes: 3 * 1024 * 1024 }))]} />);
    const links = screen.getAllByRole("link", { name: /^Download / });
    expect(links.map(link => link.getAttribute("href"))).toEqual(["/admin/deliverables/d-1", "/admin/deliverables/d-2"]);
    for (const link of links) expect(link).toHaveAttribute("download");
    expect(screen.getByText(/Figure · PNG · 3\.0 MB/)).toBeVisible();
    unmount();
    render(<ClientDeliverables items={[]} />);
    expect(screen.getByText("The lab has not shared any files for this order yet.")).toBeVisible();
  });

  it("the lab's section: the upload form posts to the route; each live file can be shown or hidden and retired; a retired one only downloads", () => {
    render(<LabDeliverables code="ORD040" open example={false} dataset={{ id: "ds", version: 1 }} notice="added" items={[
      item({ id: "d-1", visibleToClient: false }), item({ id: "d-2", title: "Figure 1", visibleToClient: true }),
      item({ id: "d-3", title: "Old figure", retiredAt: "2026-11-10T10:00:00Z", retiredReason: "Wrong colours" }),
    ]} />);
    const form = screen.getByRole("form", { name: "Add a deliverable" });
    expect(form).toHaveAttribute("action", "/admin/orders/ORD040/deliverables");
    expect(form).toHaveAttribute("enctype", "multipart/form-data");
    expect(within(form).getByLabelText("File")).toHaveAttribute("accept", ".pdf,.png,.jpg,.jpeg,.svg,.xlsx,.csv");
    expect(screen.getByRole("status")).toHaveTextContent("stays hidden from the client");
    const rows = within(screen.getByRole("list", { name: "Deliverables" })).getAllByRole("listitem");
    expect(within(rows[0]).getByText("Hidden")).toBeVisible();
    expect(within(rows[0]).getByRole("button", { name: "Show to client" })).toBeVisible();
    expect(within(rows[1]).getByText("Client sees it")).toBeVisible();
    expect(within(rows[1]).getByRole("button", { name: "Hide from client" })).toBeVisible();
    expect(within(rows[2]).getByText("Retired")).toBeVisible();
    expect(within(rows[2]).queryByRole("button")).toBeNull();
    expect(within(rows[2]).getByText(/Wrong colours/)).toBeVisible();
    expect(within(rows[2]).getByRole("link", { name: "Download Old figure" })).toBeVisible();
  });

  it("no upload form on an order that does not take files; an unknown notice key shows nothing", () => {
    render(<LabDeliverables code="ORD040" open={false} example dataset={null} notice="<script>" items={[]} />);
    expect(screen.queryByRole("form", { name: "Add a deliverable" })).toBeNull();
    expect(screen.getByText(/Files can be added once the order is accepted/)).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
