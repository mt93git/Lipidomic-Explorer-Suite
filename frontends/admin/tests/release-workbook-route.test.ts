// @vitest-environment node
// Download Excel on the release page: the exact stored workbook of the version, always as an attachment.
import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(workspace)/release/[id]/workbook/route";
import { DataError, getDataset, readDatasetWorkbook, type ReleaseView } from "@/lib/data/release";
import { getAppSession } from "@/lib/session";

vi.mock("@/lib/data/release", async () => {
  class DataError extends Error {}
  return { DataError, getDataset: vi.fn(), readDatasetWorkbook: vi.fn() };
});
vi.mock("@/lib/session", () => ({ getAppSession: vi.fn(async () => ({ view: "staff" })) }));

const view = { dataset: { id: "d-1", orderCode: "ORD900", version: 2, full: { label: "Dataset v1 workbook", sheets: [], sha256: "a".repeat(64), sizeBytes: 5, path: "x" } } } as unknown as ReleaseView;
const call = (id = "d-1") => GET(new Request(`http://localhost/release/${id}/workbook`), { params: Promise.resolve({ id }) });

describe("GET /release/<id>/workbook", () => {
  it("sends the stored bytes unchanged as an .xlsx attachment named after the order and version", async () => {
    vi.mocked(getDataset).mockResolvedValue(view);
    vi.mocked(readDatasetWorkbook).mockResolvedValue({ bytes: Buffer.from([1, 2, 3, 4, 5]), fileName: "ORD900_dataset_v2.xlsx" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toContain('attachment; filename="ORD900_dataset_v2.xlsx"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(readDatasetWorkbook).toHaveBeenCalledWith(view.dataset);
  });
  it("answers 404 for an unknown version and 502 when the stored file cannot be read or does not match", async () => {
    vi.mocked(getDataset).mockResolvedValue(null);
    expect((await call("nope")).status).toBe(404);
    vi.mocked(getDataset).mockResolvedValue(view);
    vi.mocked(readDatasetWorkbook).mockRejectedValue(new DataError("The stored workbook does not match the digest recorded when this version was built; it is not shown."));
    const response = await call();
    expect(response.status).toBe(502);
    expect(await response.text()).toMatch(/does not match the digest/);
  });
  it("answers 401 without a session, 403 to a client user, 404 for a malformed id, before reading anything", async () => {
    vi.mocked(getDataset).mockClear();
    vi.mocked(getAppSession).mockResolvedValueOnce(null);
    expect((await call()).status).toBe(401);
    vi.mocked(getAppSession).mockResolvedValueOnce({ view: "client" } as Awaited<ReturnType<typeof getAppSession>>);
    expect((await call()).status).toBe(403);
    expect((await call("../other")).status).toBe(404);
    expect(getDataset).not.toHaveBeenCalled();
  });
});
