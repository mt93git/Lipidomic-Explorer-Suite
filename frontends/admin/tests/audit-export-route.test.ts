// @vitest-environment node
// a21 Export CSV: the route answers lab staff only, with the current filter, as a UTF-8 CSV attachment.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(workspace)/audit-log/export/route";
import { exportAuditEvents, recordAuditExport } from "@/lib/data/audit";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

vi.mock("@/lib/session", () => ({ getAppSession: vi.fn() }));
vi.mock("@/lib/data/audit", () => ({ exportAuditEvents: vi.fn(), recordAuditExport: vi.fn() }));

const url = "http://localhost/admin/audit-log/export?entity=dataset&order=ord080&before=12";
beforeEach(() => vi.clearAllMocks());

describe("GET /audit-log/export", () => {
  it("refuses without a session (401) and for a client view (403), reading nothing", async () => {
    vi.mocked(getAppSession).mockResolvedValue(null);
    expect((await GET(new Request(url))).status).toBe(401);
    vi.mocked(getAppSession).mockResolvedValue({ view: "client" } as never);
    expect((await GET(new Request(url))).status).toBe(403);
    expect(exportAuditEvents).not.toHaveBeenCalled();
    expect(recordAuditExport).not.toHaveBeenCalled();
  });

  it("lab staff get the filter's events as a CSV attachment named by day and filter", async () => {
    vi.mocked(getAppSession).mockResolvedValue({ view: "staff" } as never);
    vi.mocked(exportAuditEvents).mockResolvedValue({ truncated: false, rows: [{
      id: 7, at: "2026-11-13T14:14:00Z", who: "Paula", clients: [{ name: "Hematology group", slot: 0 }], entity: "Dataset", action: "UPDATE",
      summary: "Dataset ORD080 v1 released", changes: [{ field: "Status", before: "built", after: "released" }],
    }] });
    const response = await GET(new Request(url));
    expect(exportAuditEvents).toHaveBeenCalledWith({ entity: "dataset", order: "ORD080", before: 12 });
    // 0042: the export itself is audited (who, the filter, the row count) before the file is sent.
    expect(recordAuditExport).toHaveBeenCalledWith({ entity: "dataset", order: "ORD080", before: 12 }, 1, false);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}-ORD080-dataset\.csv"$/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 byte order mark
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text).toContain('"7","2026-11-13T14:14:00.000Z"');
    expect(text).toContain('"Status: built → released"');
  });

  it("when the export cannot be audited, no file is sent", async () => {
    vi.mocked(getAppSession).mockResolvedValue({ view: "staff" } as never);
    vi.mocked(exportAuditEvents).mockResolvedValue({ truncated: false, rows: [] });
    vi.mocked(recordAuditExport).mockRejectedValue(new DataError("You do not have permission to do this."));
    const response = await GET(new Request(url));
    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.text()).toBe("You do not have permission to do this.");
  });
});
