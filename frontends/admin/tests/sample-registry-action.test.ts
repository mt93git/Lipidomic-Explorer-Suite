import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSamplesAction } from "@/app/(workspace)/sample-registry/actions";
import { demoSession } from "@/lib/demo";
import { getEnvironment } from "@/lib/environment";
import { getAppSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import type { SampleInput } from "@/lib/samples";
import { fakePostgrest } from "./helpers/fake-postgrest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/session", () => ({ getAppSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/action-redirect", () => ({ redirectAfterAction: async (url: string) => { throw new Error(`redirect:${url}`); } }));

const sample: SampleInput = { full_name: "Late_1", client_sample_id: null, group1_term: "Control", group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null };
const payload = { orderId: "order-uuid", orderCode: "ORD041", shipmentId: "ship-uuid", samples: [sample] };
const rpc = vi.fn();
function liveOrderAt(stage: string) {
  const db = fakePostgrest({
    order: [{ id: "order-uuid", code: "ORD041", title: "Synthetic", stage, matrix: null, expected_samples: 2, client_id: "client-uuid", order_number: 41, archived_at: null, client: { name: "Example Cedar" } }],
    shipment: [{ id: "ship-uuid", order_id: "order-uuid", received_at: "2026-11-07T15:00:00Z", created_at: "2026-11-07T15:00:00Z", archived_at: null }],
    sample: [],
  });
  vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ rpc, from: db.from }) } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" });
  vi.mocked(getAppSession).mockResolvedValue({ ...demoSession, mock: false, view: "staff" });
});

describe("registering into a registry that closed while the grid was open", () => {
  it("refuses before writing when the order has already moved past Registered", async () => {
    liveOrderAt("processed");
    await expect(registerSamplesAction({}, payload)).resolves.toEqual({ error: "ORD041 is already Processed; its sample registry is closed. Reload the page to see the order as it is now." });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("turns the database's refusal into the same message when the order moves on during the save", async () => {
    liveOrderAt("registered");
    rpc.mockResolvedValueOnce({ data: null, error: { code: "55000", message: "ORD041 is at stage processed; its sample registry is closed", details: "", hint: "" } });
    await expect(registerSamplesAction({}, payload)).resolves.toEqual({ error: "ORD041 is already Processed; its sample registry is closed. Reload the page to see the order as it is now." });
  });
});
