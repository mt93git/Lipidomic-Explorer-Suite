// Batch builder page (demo): the rule fields start from the active instrument profile (0035), blanks between samples
// included, and the preview places them. Synthetic data only.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { jar } = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => { jar.set(name, value); }, getAll: () => [] }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: () => ({ mock: true, url: "", anonKey: "" }) }));
const session = { userId: "example-staff", role: "Operator", view: "staff", displayName: "Demo lab person", mock: true, clients: [], selectedClient: null };
vi.mock("@/lib/session", () => ({ getAppSession: vi.fn(async () => session), requireWorkspace: vi.fn(async () => session) }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));

const { readDemoState, writeDemoState } = await import("@/lib/data/demo-store");
const { default: Page } = await import("@/app/(workspace)/batch-builder/page");
import type { DemoSample } from "@/lib/samples-demo";

const sample = (n: number): DemoSample => ({
  id: `s-${n}`, orderCode: "ORD041", shipmentId: null, sampleNumber: n, code: `ORD041-S${String(n).padStart(3, "0")}`, createdAt: "2026-11-10T15:00:00Z", registeredBy: "Demo Operator",
  full_name: `Synthetic_${n}`, client_sample_id: null, group1_term: null, group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, matrix: null, volume_ul: null,
});
const page = (query: Record<string, string | string[]> = {}) => Page({ searchParams: Promise.resolve(query) });

beforeEach(async () => {
  jar.clear();
  await writeDemoState({ ...await readDemoState(), samples: Array.from({ length: 9 }, (_, i) => sample(i + 1)) });
});

describe("Batch builder page", () => {
  it("shows blanks between samples next to blanks at start and pooled QC, pre-filled from the active profile (5 after every 4)", async () => {
    render(await page());
    const rules = screen.getByRole("region", { name: "Blanks, pooled QC and order" });
    expect(within(rules).getByLabelText("Blanks at start")).toHaveValue(4);
    expect(within(rules).getByLabelText("Blanks between samples")).toHaveValue(5);
    expect(within(rules).getByLabelText("After every (samples)")).toHaveValue(4);
    expect(within(rules).getByLabelText("Pooled QC every")).toHaveValue(0);
  });

  it("previews the blanks between samples, and carries them to the save form", async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `s-${i + 1}`);
    render(await page({ preview: "1", panelId: "Panel A · broad lipidome", sample: ids, blanksAtStart: "1", blanksBetween: "2", blanksBetweenEvery: "4", pooledQcEvery: "0", seed: "syn" }));
    const table = screen.getByRole("table", { name: "Sequence preview" });
    const types = within(table).getAllByRole("row").slice(1).map(row => row.querySelectorAll("td")[2]?.textContent ?? "");
    const S = "Sample";
    expect(types).toEqual(["Blank", S, S, S, S, "Blank", "Blank", S, S, S, S, "Blank", "Blank", S]);
    expect(document.querySelector('input[type="hidden"][name="blanksBetween"]')).toHaveValue("2");
    expect(document.querySelector('input[type="hidden"][name="blanksBetweenEvery"]')).toHaveValue("4");
  });
});
