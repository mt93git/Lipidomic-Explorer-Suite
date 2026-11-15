// @vitest-environment node
// Deliverables through the two routes and the data seam, in demo mode (F4): the lab uploads through
// POST /orders/[code]/deliverables, shows a file, retires one; GET /deliverables/[id] serves only what the guard allows,
// always as an attachment. The per-client Nexo switch. Synthetic data only.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getEnvironment } from "@/lib/environment";
import { POST as upload } from "@/app/(workspace)/orders/[code]/deliverables/route";
import { GET as download } from "@/app/(workspace)/deliverables/[id]/route";
import { countClientDeliverables, listClientDeliverables, listOrderDeliverables, retireDeliverable, setDeliverableVisibility } from "@/lib/data/deliverables";
import { clientNexoAccess, setClientNexoAccess } from "@/lib/data/clients";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/session", () => ({
  getAppSession: vi.fn(async () => session),
  requireWorkspace: vi.fn(async (audience: string) => {
    if (!session) throw new Error("redirect /sign-in");
    if (audience === "staff" && session.view !== "staff") throw new Error("redirect /client/home");
    return session;
  }),
}));

type Session = { userId: string; role: string; view: "staff" | "client"; displayName: string; mock: true; clients: { id: string; name: string; color: string }[]; selectedClient: null } | null;
const staff: Session = { userId: "example-staff", role: "Operator", view: "staff", displayName: "Demo Operator", mock: true, clients: [], selectedClient: null };
const cedarClient: Session = { userId: "example-client", role: "Requester", view: "client", displayName: "rowan@cedar.example.test", mock: true, clients: [{ id: "example-cedar", name: "Example Cedar", color: "cedar" }], selectedClient: null };
const harborClient: Session = { ...cedarClient!, clients: [{ id: "example-harbor", name: "Example Harbor", color: "harbor" }] };
let session: Session = staff;
const jar = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks(); jar.clear(); session = staff;
  vi.mocked(getEnvironment).mockReturnValue({ mock: true, url: "", anonKey: "" });
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value) } as never);
});

const ORIGIN = "http://127.0.0.1:3110";
const PDF = new TextEncoder().encode("%PDF-1.7\n% synthetic report\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
async function post(code: string, file: { name: string; bytes: Uint8Array; type: string }, fields: Record<string, string> = {}, origin = ORIGIN) {
  const form = new FormData();
  form.set("title", fields.title ?? file.name);
  form.set("kind", fields.kind ?? "report");
  if (fields.visible) form.set("visible", "on");
  form.set("file", new File([file.bytes as BlobPart], file.name, { type: file.type }));
  const request = new NextRequest(`${ORIGIN}/admin/orders/${code}/deliverables`, { method: "POST", body: form, headers: { origin, host: "127.0.0.1:3110" } });
  const res = await upload(request, { params: Promise.resolve({ code }) });
  return { status: res.status, location: res.headers.get("location") ?? "" };
}
const get = (id: string) => download(new Request(`${ORIGIN}/admin/deliverables/${id}`), { params: Promise.resolve({ id }) });
const idOf = async (title: string) => (await listOrderDeliverables("ORD040")).items.find(item => item.title === title)!.id;

describe("upload route", () => {
  test("the lab adds a PDF and a PNG to ORD040 (hidden by default) and is sent back to the order with a notice", async () => {
    expect(await post("ORD040", { name: "Study report.pdf", bytes: PDF, type: "application/pdf" }, { title: "Study report" }))
      .toEqual({ status: 303, location: "/admin/orders/ORD040?deliverable=added#deliverables" });
    expect(await post("ORD040", { name: "figure 1.png", bytes: PNG, type: "image/png" }, { title: "Figure 1", kind: "figure", visible: "1" }))
      .toEqual({ status: 303, location: "/admin/orders/ORD040?deliverable=added-visible#deliverables" });
    const { items, open } = await listOrderDeliverables("ORD040");
    expect(open).toBe(true);
    expect(items.map(item => [item.title, item.fileName, item.kind, item.visibleToClient, item.clientId])).toEqual(expect.arrayContaining([
      ["Study report", "Study-report.pdf", "report", false, "example-cedar"], ["Figure 1", "figure-1.png", "figure", true, "example-cedar"],
    ]));
    expect(items[0].storagePath).toMatch(/^example-cedar\/ORD040\/deliverables\/[0-9a-f]{64}\//);
  });

  test("refusals come back as notice keys; nothing is added", async () => {
    expect((await post("ORD040", { name: "page.png", bytes: new TextEncoder().encode("<html></html>"), type: "image/png" })).location).toMatch(/deliverable=content#/);
    expect((await post("ORD040", { name: "notes.txt", bytes: PDF, type: "text/plain" })).location).toMatch(/deliverable=type#/);
    expect((await post("ORD040", { name: "r.pdf", bytes: PDF, type: "application/pdf" }, { title: " " })).location).toMatch(/deliverable=title#/);
    await post("ORD040", { name: "r.pdf", bytes: PDF, type: "application/pdf" });
    expect((await post("ORD040", { name: "r.pdf", bytes: PDF, type: "application/pdf" })).location).toMatch(/deliverable=duplicate#/);
    expect((await post("ORD999", { name: "r.pdf", bytes: PDF, type: "application/pdf" })).location).toMatch(/deliverable=not-found#/);
    expect((await listOrderDeliverables("ORD040")).items).toHaveLength(1);
  });

  test("another origin, a client user and a signed-out request are refused before the body is read", async () => {
    expect((await post("ORD040", { name: "r.pdf", bytes: PDF, type: "application/pdf" }, {}, "https://evil.example")).status).toBe(403);
    session = cedarClient;
    expect((await post("ORD040", { name: "r.pdf", bytes: PDF, type: "application/pdf" })).status).toBe(403);
    session = null;
    expect(await post("ORD040", { name: "r.pdf", bytes: PDF, type: "application/pdf" })).toEqual({ status: 303, location: "/admin/sign-in" });
    session = staff;
    expect((await listOrderDeliverables("ORD040")).items).toEqual([]);
  });
});

describe("download route", () => {
  test("the client downloads only the file the lab shows; hidden, retired and another client's files are not found; staff get any", async () => {
    await post("ORD040", { name: "report.pdf", bytes: PDF, type: "application/pdf" }, { title: "Study report" });
    await post("ORD040", { name: "figure.png", bytes: PNG, type: "image/png" }, { title: "Figure 1", kind: "figure" });
    await setDeliverableVisibility(await idOf("Study report"), true);
    const pdf = await idOf("Study report");
    const png = await idOf("Figure 1");

    session = cedarClient;
    expect((await listClientDeliverables("ORD040", ["example-cedar"])).map(item => item.title)).toEqual(["Study report"]);
    const ok = await get(pdf);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toMatch(/^attachment; filename="report\.pdf"/);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(PDF);
    expect((await get(png)).status).toBe(404);
    expect((await get("not-a-file")).status).toBe(404);

    session = harborClient; // a member of another client
    expect((await get(pdf)).status).toBe(404);
    expect(await listClientDeliverables("ORD040", ["example-harbor"])).toEqual([]);

    session = staff;
    await retireDeliverable(pdf, "Wrong cover page");
    await expect(setDeliverableVisibility(pdf, false)).rejects.toThrow(/retired/);
    await expect(retireDeliverable(png, "  ")).rejects.toThrow(/reason/);
    expect((await get(pdf)).status).toBe(200); // the lab keeps reading retired files
    session = cedarClient;
    expect((await get(pdf)).status).toBe(404);
    expect(await listClientDeliverables("ORD040", ["example-cedar"])).toEqual([]);
    session = null;
    expect((await get(pdf)).status).toBe(401);
  });

  test("an SVG is served as an attachment, application/octet-stream, nosniff and sandboxed, never inline", async () => {
    await post("ORD040", { name: "figure.svg", bytes: SVG, type: "image/svg+xml" }, { title: "Vector figure", kind: "figure", visible: "1" });
    session = cedarClient;
    const res = await get((await listClientDeliverables("ORD040", ["example-cedar"]))[0].id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toMatch(/sandbox/);
  });

  test("a client user cannot change deliverables through the seam", async () => {
    await post("ORD040", { name: "report.pdf", bytes: PDF, type: "application/pdf" }, { title: "Study report" });
    const id = await idOf("Study report");
    session = cedarClient;
    await expect(setDeliverableVisibility(id, true)).rejects.toThrow();
    await expect(retireDeliverable(id, "x")).rejects.toThrow();
  });
});

describe("the per-client Nexo switch (demo)", () => {
  test("off by default; an Owner or Admin turns it on and off; the Operator is refused", async () => {
    expect(await clientNexoAccess("example-cedar")).toBe(false);
    await expect(setClientNexoAccess({ clientId: "example-cedar", enabled: true })).rejects.toThrow(/Owner or Admin/);
    await setClientNexoAccess({ clientId: "example-cedar", enabled: true, actorId: "example-owner" });
    expect(await clientNexoAccess("example-cedar")).toBe(true);
    expect(await clientNexoAccess("example-harbor")).toBe(false);
    await setClientNexoAccess({ clientId: "example-cedar", enabled: false, actorId: "example-reviewer-a" });
    expect(await clientNexoAccess("example-cedar")).toBe(false);
  });
});

describe("Client home's file counts (UX review top 2)", () => {
  test("count only the files the client sees, by order: hidden and retired ones do not count, nor another client's", async () => {
    await post("ORD040", { name: "a.pdf", bytes: PDF, type: "application/pdf" }, { title: "Shown", visible: "1" });
    await post("ORD040", { name: "b.png", bytes: PNG, type: "image/png" }, { title: "Hidden", kind: "figure" });
    await post("ORD040", { name: "c.pdf", bytes: new TextEncoder().encode("%PDF-1.7\n% retired\n%%EOF\n"), type: "application/pdf" }, { title: "Retired", visible: "1" });
    await retireDeliverable(await idOf("Retired"), "Synthetic: wrong file");
    expect(Object.fromEntries(await countClientDeliverables("example-cedar"))).toEqual({ ORD040: 1 });
    expect((await countClientDeliverables("example-harbor")).size).toBe(0);
  });
});
