// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { File as NodeFile } from "node:buffer";
import { readFileSync } from "node:fs";
const request = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => request.cookies.has(name) ? { value: request.cookies.get(name) } : undefined,
  set: (name: string, value: string) => request.cookies.set(name, value),
}) }));
vi.mock("@/lib/session", () => ({ requireWorkspace: async () => ({ userId: "test-operator", role: "Operator", view: "staff" }) }));
vi.mock("@/lib/environment", () => ({ getEnvironment: () => ({ mock: true }) }));
import { parseResultFile, acceptResultFile, listResultOrders, getNameDictionary, saveNameEntry } from "@/lib/data/results";
import { listRegistryOrders, receiveShipment, registerSamples } from "@/lib/data/samples";
import { listOrders } from "@/lib/data/orders";
import type { SampleInput } from "@/lib/samples";
const source = readFileSync(new URL("../e2e/fixtures/sciex-synthetic.txt", import.meta.url), "utf8");
// A FormData carrying a Node File intact (jsdom's FormData would replace it).
function upload(orderId: string, text: string) {
  const form = new FormData();
  form.set("orderId", orderId);
  const file = new NodeFile([text], "synthetic.txt");
  const get = form.get.bind(form);
  vi.spyOn(form, "get").mockImplementation(name => name === "file" ? file as unknown as File : get(name));
  return form;
}
const sample = (full_name: string): SampleInput => ({ full_name, client_sample_id: null, group1_term: "Control", group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null });
const stageOf = async (code: string) => (await listOrders()).find(order => order.code === code)?.stage;
describe("demo results boundary", () => {
  beforeEach(() => { request.cookies.clear(); vi.stubGlobal("File", NodeFile); });
  it("parses, enforces stops on the server, accepts and isolates cookie sessions", async () => {
    const form = new FormData();
    form.set("orderId", "ORD041");
    const flagged = source.split("\n").map((line, i) => {
      if (i < 2 || !line) return line;
      const cells = line.split("\t"); cells[4] = "1"; return cells.join("\t");
    }).join("\n");
    // Keep the Node File intact across jsdom's FormData implementation.
    const file = new NodeFile([flagged], "synthetic.txt");
    const get = form.get.bind(form);
    vi.spyOn(form, "get").mockImplementation(name => name === "file" ? file as unknown as File : get(name));
    const review = await parseResultFile(form);
    await expect(acceptResultFile(review.id, " ")).rejects.toThrow("reason");
    expect(await acceptResultFile(review.id, "Reviewed synthetic blank")).toMatchObject({ code: "ORD041", stage: "Processed" });
    expect((await listResultOrders()).some(order => order.id === "ORD041")).toBe(false);
    expect(await stageOf("ORD041")).toBe(7); // the pipeline reads the same progress: Processed
    await expect(acceptResultFile(review.id, "Again")).rejects.toThrow("already accepted");
    expect((await getNameDictionary()).analytes.length).toBe(33);
    const entry = new FormData(); entry.set("export_name", "Synthetic lipid 1"); entry.set("clean_name", "Lipid one");
    await saveNameEntry(entry);
    expect((await getNameDictionary()).entries).toHaveLength(1);
    // Same rule as the database's one-live-entry-per-name index: a second Add is refused, an edit is not.
    const again = new FormData(); again.set("export_name", "Synthetic lipid 1"); again.set("clean_name", "Lipid uno");
    await expect(saveNameEntry(again)).rejects.toThrow("Synthetic lipid 1 is already in the dictionary. Edit its entry instead of adding it again.");
    const edit = new FormData(); edit.set("id", (await getNameDictionary()).entries[0].id!); edit.set("export_name", "Synthetic lipid 1"); edit.set("clean_name", "Lipid 1");
    await saveNameEntry(edit);
    expect((await getNameDictionary()).entries.map(item => item.clean_name)).toEqual(["Lipid 1"]);
    request.cookies.clear();
    expect((await listResultOrders()).some(order => order.id === "ORD041")).toBe(true);
    expect(await stageOf("ORD041")).toBe(2);
    expect((await getNameDictionary()).analytes).toEqual([]);
    await expect(acceptResultFile(review.id, "Cross-session attempt")).rejects.toThrow("expired");
  });
  it("one order's progress carries across receive, register, the results picker, acceptance and the pipeline", async () => {
    expect(await stageOf("ORD042")).toBe(0);
    expect((await listResultOrders()).map(order => order.code)).not.toContain("ORD042");
    const { shipmentId } = await receiveShipment({ orderId: "ORD042", carrier: "FedEx", trackingNumber: null, condition: "ok", boxCount: 1, notes: null });
    await registerSamples({ orderId: "ORD042", shipmentId, samples: [sample("Ctrl_1"), sample("Trt_1")] });
    expect(await stageOf("ORD042")).toBe(2);
    expect((await listResultOrders()).find(order => order.code === "ORD042")).toMatchObject({ id: "ORD042", stage: "registered" });

    const review = await parseResultFile(upload("ORD042", source));
    expect(await acceptResultFile(review.id, "")).toMatchObject({ code: "ORD042", stage: "Processed" });
    expect((await listResultOrders()).map(order => order.code)).not.toContain("ORD042");
    expect((await listRegistryOrders()).map(order => order.code)).not.toContain("ORD042");
    const pipeline = (await listOrders()).find(order => order.code === "ORD042");
    expect(pipeline?.stage).toBe(7);
    expect(pipeline?.history[0].title).toMatch(/^Results file accepted/);
  });
});
