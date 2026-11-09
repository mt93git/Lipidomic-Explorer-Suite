// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest } from "./helpers/fake-postgrest";
const request = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => request.cookies.has(name) ? { value: request.cookies.get(name) } : undefined,
  set: (name: string, value: string) => request.cookies.set(name, value),
}) }));
vi.mock("@/lib/session", () => ({ requireWorkspace: async () => ({ userId: "test-operator", role: "Operator", view: "staff" }) }));
vi.mock("@/lib/environment", () => ({ getEnvironment: () => ({ mock: false, url: "https://example.supabase.co", anonKey: "public-example" }) }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/server";
import { getNameDictionary, saveNameEntry } from "@/lib/data/results";

type Row = Record<string, unknown>;
// admin.name_map_lab_wide_export_name (0006): one live lab-wide entry per export name.
const labWideUnique = (row: Row, others: Row[]) => row.client_id === null && row.archived_at === null
  && others.some(other => other.export_name === row.export_name && other.client_id === null && other.archived_at === null) ? "name_map_lab_wide_export_name" : null;
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(fields)) data.set(k, v); return data; };

describe("live lab-wide name dictionary", () => {
  let nameMap: Row[];
  beforeEach(() => {
    request.cookies.clear();
    nameMap = [
      { id: "entry-ce", export_name: "CE 24:4 +NH4", clean_name: "CE 24:4", client_id: null, archived_at: null },
      { id: "entry-client", export_name: "PC 32:0", clean_name: "PC 32:0 (client)", client_id: "client-uuid", archived_at: null },
    ];
    const db = fakePostgrest({ name_map: nameMap }, { name_map: labWideUnique });
    vi.mocked(createAdminClient).mockResolvedValue({ schema: () => ({ from: db.from }) } as never);
  });
  it("refuses a second mapping for an export name instead of storing a conflicting one, and says what to do", async () => {
    await expect(saveNameEntry(form({ export_name: "CE 24:4 +NH4", clean_name: "CE 24:4 (other)" }))).rejects.toThrow("CE 24:4 +NH4 is already in the dictionary. Edit its entry instead of adding it again.");
    expect((await getNameDictionary()).entries.map(entry => [entry.export_name, entry.clean_name])).toEqual([["CE 24:4 +NH4", "CE 24:4"]]);
  });
  it("adds a new lab-wide name (a client-scoped mapping does not conflict) and edits an entry, but not into a duplicate", async () => {
    await saveNameEntry(form({ export_name: "PC 32:0", clean_name: "PC 32:0" }));
    await saveNameEntry(form({ id: "entry-ce", export_name: "CE 24:4 +NH4", clean_name: "CE 24:4 [M+NH4]" }));
    await expect(saveNameEntry(form({ id: "entry-ce", export_name: "PC 32:0", clean_name: "x" }))).rejects.toThrow("PC 32:0 is already in the dictionary. Edit its entry instead of adding it again.");
    expect((await getNameDictionary()).entries.map(entry => [entry.export_name, entry.clean_name])).toEqual([["CE 24:4 +NH4", "CE 24:4 [M+NH4]"], ["PC 32:0", "PC 32:0"]]);
  });
});
