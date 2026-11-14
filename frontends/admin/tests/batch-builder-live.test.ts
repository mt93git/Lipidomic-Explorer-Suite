// @vitest-environment node
// The batch builder's live sample list (listBuilderSamples): which registered samples a new batch may take.
// Found on staging after the showcase seed: an Acquired order (all 12 samples in an acquired batch) and two orders
// whose batch was sequence-exported were still offered, because only a *planned* batch counted as taking a sample.
import { beforeEach, expect, test, vi } from "vitest";
import { getEnvironment } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/server";
import { listBuilderSamples } from "@/lib/data/batches";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/data/orders", async (original) => ({
  ...(await original<typeof import("@/lib/data/orders")>()),
  listClients: vi.fn().mockResolvedValue([{ id: "c1", name: "Synthetic Client" }]),
}));

type Batch = { status: string; archived_at: string | null };
const ARCHIVED = "2026-11-12T10:00:00Z";
const sample = (code: string, stage: string, aliquot?: string) => ({
  id: `s-${code}`, sample_code: code, full_name: `Synthetic_${code}`, client_id: "c1",
  ord: { code: code.slice(0, 6), stage, archived_at: null }, aliquot: aliquot ? [{ id: aliquot, archived_at: null }] : [],
});
const injection = (aliquot: string, batch: Batch, versionArchived: string | null = null) =>
  ({ aliquot_id: aliquot, batch_version: { archived_at: versionArchived, batch } });

const samples = [
  sample("ORD694-S001", "registered"),                         // registered, never batched: offered
  sample("ORD696-S001", "in_batch", "a696-1"),                 // in a planned batch: not offered
  sample("ORD696-S002", "in_batch"),                           // same order, not batched yet: offered
  sample("ORD697-S001", "acquired", "a697-1"),                 // in an acquired batch: not offered
  sample("ORD698-S001", "acquired"),                           // order past In batch: not offered
  sample("ORD701-S001", "sequence_exported", "a701-1"),        // in an exported batch: not offered
  sample("ORD703-S001", "in_batch", "a703-1"),                 // its batch was archived (cancelled): offered again
  sample("ORD704-S001", "registered", "a704-1"),               // only in an archived version: offered again
];
const injections = [
  injection("a696-1", { status: "planned", archived_at: null }),
  injection("a697-1", { status: "acquired", archived_at: null }),
  injection("a701-1", { status: "sequence_exported", archived_at: null }),
  injection("a703-1", { status: "planned", archived_at: ARCHIVED }),
  injection("a704-1", { status: "sequence_exported", archived_at: null }, ARCHIVED),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEnvironment).mockReturnValue({ mock: false, url: "https://example.test", anonKey: "example" });
  const result = (table: string) => table === "sample" ? { data: samples, error: null } : { data: injections, error: null };
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const step of ["select", "is", "not", "order", "eq"]) chain[step] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result(table)).then(resolve);
    return chain;
  });
  vi.mocked(createAdminClient).mockResolvedValue({ schema: vi.fn(() => ({ from })) } as never);
});

test("live: samples in a planned, exported or acquired batch, and orders past In batch, are not offered", async () => {
  expect((await listBuilderSamples()).map(item => item.code)).toEqual(["ORD694-S001", "ORD696-S002", "ORD703-S001", "ORD704-S001"]);
});
