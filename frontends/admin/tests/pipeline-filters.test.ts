import { describe, expect, it } from "vitest";
import type { Client, Gate, Order } from "@/lib/models";
import {
  applyFilters, batchNote, clientBreakdown, describeFilters, emptyFilters, focusCounts, hasActiveFilters, isMixedBatch, matchesSearch,
  parseFilters, releasedWithin, scopeLabel, scopeToAudience, serializeFilters, stageSlug, stageFromSlug, toggleValue, type PipelineFilters,
} from "@/lib/pipeline-filters";

const clients: Client[] = [
  { id: "atlas", name: "Example Atlas", color: "atlas" },
  { id: "cedar", name: "Example Cedar", color: "cedar" },
  { id: "harbor", name: "Example Harbor", color: "harbor" },
];
const gates: Record<"ok" | "fail" | "pending", Gate[]> = {
  ok: [{ label: "Checked", status: "ok" }],
  fail: [{ label: "Identifier review", status: "fail" }],
  pending: [{ label: "Manifest review", status: "pending" }],
};
function order(code: string, clientId: string, stage: number, gate: keyof typeof gates, extra: Partial<Order> = {}): Order {
  return {
    code, clientId, stage, description: `${code} description`, sampleCount: 20, completedSamples: 5, sampleType: "Synthetic plasma",
    panel: "Panel A", due: "2026-11-18", received: "2026-11-02", owner: "Demo Operator", gates: gates[gate], history: [], ...extra,
  };
}
const now = new Date("2026-11-07T12:00:00Z");
const orders: Order[] = [
  order("ORD001", "atlas", 2, "fail"),
  order("ORD002", "cedar", 0, "pending", { panel: "Panel B", owner: "Demo Analyst" }),
  order("ORD003", "harbor", 5, "ok", { batch: "B2026-031" }),
  order("ORD004", "cedar", 5, "ok", { batch: "B2026-031", description: "Sphingolipid feasibility" }),
  order("ORD005", "atlas", 6, "pending", { batch: "B2026-030" }),
  order("ORD006", "atlas", 9, "ok", { released: true, releasedAt: "2026-11-05T10:00:00-05:00" }),
  order("ORD007", "cedar", 9, "ok", { released: true, releasedAt: "2026-10-20T10:00:00-04:00" }),
];
const filters = (patch: Partial<PipelineFilters>): PipelineFilters => ({ ...emptyFilters, ...patch });
// Next's `searchParams` record: repeated keys arrive as arrays, single keys as strings.
function asRecord(search: string): Record<string, string | string[]> {
  const params = new URLSearchParams(search);
  return Object.fromEntries(Array.from(new Set(params.keys())).map(key => { const all = params.getAll(key); return [key, all.length > 1 ? all : all[0]]; }));
}

describe("stage slugs", () => {
  it("round-trips every stage through a URL-safe slug", () => {
    for (let index = 0; index < 10; index++) expect(stageFromSlug(stageSlug(index))).toBe(index);
    expect(stageSlug(4)).toBe("in-batch");
    expect(stageSlug(8)).toBe("qc-checked");
    expect(stageFromSlug("nonsense")).toBeNull();
  });
});

describe("URL round trip", () => {
  it("starts with everything open and nothing serialized", () => {
    expect(serializeFilters(emptyFilters)).toBe("");
    expect(parseFilters(new URLSearchParams(""), clients)).toEqual(emptyFilters);
  });
  it("serializes repeated keys in a stable order and parses them back", () => {
    const state = filters({ clients: ["cedar", "atlas"], stages: [5, 2], focus: "blocked", panels: ["Panel B"], owners: ["Demo Analyst"], query: "sphingo", group: "client" });
    const search = serializeFilters(state);
    expect(search).toBe("client=cedar&client=atlas&stage=registered&stage=sequence-exported&focus=blocked&panel=Panel+B&owner=Demo+Analyst&q=sphingo&group=client");
    expect(parseFilters(new URLSearchParams(search), clients)).toEqual({ ...state, stages: [2, 5] });
    expect(parseFilters(asRecord(search), clients)).toEqual({ ...state, stages: [2, 5] });
  });
  it("keeps commas, spaces and unicode inside panel, owner and search values (P1-4)", () => {
    const state = filters({ panels: ["PC, PE", "Panel Ω · sphingolipids"], owners: ["Doe, Jane", "Müller, José"], query: "PC, PE" });
    const search = serializeFilters(state);
    expect(parseFilters(new URLSearchParams(search), clients)).toEqual(state);
    expect(parseFilters(asRecord(search), clients)).toEqual(state);
    expect(parseFilters(new URLSearchParams("panel=PC, PE&owner=Doe, Jane&q=a, b"), clients)).toEqual(filters({ panels: ["PC, PE"], owners: ["Doe, Jane"], query: "a, b" }));
  });
  it("keeps the search text exactly as typed, including spaces, and normalises only for matching (P1-1)", () => {
    for (const typed of ["panel ", "  two  words ", " "]) expect(parseFilters(new URLSearchParams(serializeFilters(filters({ query: typed }))), clients).query).toBe(typed);
    expect(parseFilters({ q: "  ORD00 " }, clients).query).toBe("  ORD00 ");
    expect(describeFilters(filters({ query: " pilot  " }), clients).map(chip => chip.label)).toEqual(["Search: “pilot”"]);
    expect(hasActiveFilters(filters({ query: "   " }))).toBe(false);
    expect(serializeFilters(filters({ query: "" }))).toBe("");
  });
  it("uses repeated keys for client and stage ids but still accepts their legacy comma form", () => {
    expect(parseFilters(new URLSearchParams("client=cedar,atlas&stage=in-batch,acquired"), clients)).toEqual(filters({ clients: ["cedar", "atlas"], stages: [4, 6] }));
    expect(parseFilters(new URLSearchParams("client=cedar&client=atlas&stage=acquired&stage=in-batch"), clients)).toEqual(filters({ clients: ["cedar", "atlas"], stages: [4, 6] }));
  });
  it("ignores unknown params, repeats and unknown ids, and caps value lengths (P2-9)", () => {
    const parsed = parseFilters({ foo: ["bar", "baz"], client: ["atlas", "ghost", "atlas"], stage: "in-batch,nope", focus: "whatever", group: "sideways", panel: "x".repeat(500), owner: ["a", "a", "", "y".repeat(500)], q: "z".repeat(500) }, clients);
    expect(parsed).toEqual(filters({ clients: ["atlas"], stages: [4], panels: ["x".repeat(120)], owners: ["a", "y".repeat(120)], query: "z".repeat(200) }));
  });
});

describe("combining filters", () => {
  it("ORs values inside a dimension and ANDs across dimensions", () => {
    expect(applyFilters(orders, filters({ clients: ["atlas", "cedar"] })).map(o => o.code)).toEqual(["ORD001", "ORD002", "ORD004", "ORD005", "ORD006", "ORD007"]);
    expect(applyFilters(orders, filters({ clients: ["cedar"], stages: [5] })).map(o => o.code)).toEqual(["ORD004"]);
    expect(applyFilters(orders, filters({ panels: ["Panel B"], owners: ["Demo Operator"] }))).toEqual([]);
  });
  it("maps attention focuses onto gates and stages", () => {
    const codes = (focus: PipelineFilters["focus"]) => applyFilters(orders, filters({ focus }), { now }).map(o => o.code);
    expect(codes("blocked")).toEqual(["ORD001"]);
    expect(codes("ready")).toEqual(["ORD003", "ORD004"]);
    expect(codes("waiting")).toEqual(["ORD002", "ORD005"]);
    expect(codes("instrument")).toEqual(["ORD003", "ORD004"]);
    expect(codes("results")).toEqual(["ORD005"]);
    expect(codes("released")).toEqual(["ORD006"]);
  });
  it("can ignore one dimension so facet counts stay visible", () => {
    expect(applyFilters(orders, filters({ clients: ["harbor"], focus: "ready" }), { ignore: ["clients"] }).map(o => o.code)).toEqual(["ORD003", "ORD004"]);
  });
});

describe("free-text search", () => {
  it("matches order code, description words, batch code and sample codes within range", () => {
    expect(matchesSearch(orders[3], "ord004")).toBe(true);
    expect(matchesSearch(orders[3], "sphingolipid")).toBe(true);
    expect(matchesSearch(orders[3], "B2026-031")).toBe(true);
    expect(matchesSearch(orders[3], "ORD004-S007")).toBe(true);
    expect(matchesSearch(orders[3], "ORD004-S021")).toBe(false);
    expect(matchesSearch(orders[3], "ORD001-S007")).toBe(false);
    expect(matchesSearch(orders[3], "")).toBe(true);
    expect(matchesSearch(orders[3], "  sphingolipid feasibility ")).toBe(true);
  });
});

describe("released this week (P2-5)", () => {
  const released = (releasedAt: string) => order("ORDR", "atlas", 9, "ok", { released: true, releasedAt });
  it("is a rolling 168 h window on real instants, not calendar days", () => {
    const at = new Date("2026-11-07T20:00:00-05:00"); // 2026-11-08T01:00Z
    expect(releasedWithin(released("2026-10-31T22:00:00-04:00"), at)).toBe(true); // 6 d 23 h ago; as a UTC date it would read 7 d 1 h
    expect(releasedWithin(released("2026-10-31T20:30:00-04:00"), at)).toBe(false); // 7 d 0 h 30 m ago
    expect(releasedWithin(released("2026-11-08T10:00:00+09:00"), at)).toBe(true); // the same instant written in another offset
    expect(releasedWithin(released("2026-11-07T21:00:00-05:00"), at)).toBe(false); // not yet released at that instant
    expect(releasedWithin(order("ORDX", "atlas", 9, "ok", { releasedAt: "2026-11-07T10:00:00-05:00" }), at)).toBe(false); // flag missing
  });
  it("counts hours across the America/New_York DST change (2026-11-01)", () => {
    const releasedAt = "2026-10-31T09:00:00-04:00"; // EDT, 13:00Z
    expect(releasedWithin(released(releasedAt), new Date("2026-11-07T09:00:00-05:00"))).toBe(false); // same wall clock a week later is 169 h
    expect(releasedWithin(released(releasedAt), new Date("2026-11-07T08:00:00-05:00"))).toBe(true); // exactly 168 h
    expect(releasedWithin(released(releasedAt), new Date("2026-11-07T08:00:01-05:00"))).toBe(false);
  });
});

describe("counts", () => {
  it("counts each focus over the current scope, ignoring the focus itself", () => {
    expect(focusCounts(orders, filters({ focus: "blocked" }), now)).toEqual({ blocked: 1, ready: 2, waiting: 2, instrument: 2, results: 1, released: 1 });
    expect(focusCounts(orders, filters({ clients: ["cedar"] }), now)).toEqual({ blocked: 0, ready: 1, waiting: 1, instrument: 1, results: 0, released: 0 });
  });
  it("breaks open and blocked orders down per client, ignoring the client filter", () => {
    const rows = clientBreakdown(orders, clients, filters({ clients: ["atlas"] }), now);
    expect(rows.map(row => [row.client.id, row.open, row.blocked, row.selected])).toEqual([["atlas", 2, 1, true], ["cedar", 2, 0, false], ["harbor", 1, 0, false]]);
    expect(clientBreakdown(orders, clients, filters({ stages: [5] }), now).map(row => row.open)).toEqual([0, 1, 1]);
  });
});

describe("chips", () => {
  it("describes every active value and removes exactly that value", () => {
    const state = filters({ clients: ["atlas", "cedar"], stages: [4], focus: "blocked", panels: ["Panel B"], owners: ["Demo Analyst"], query: "pilot" });
    const chips = describeFilters(state, clients);
    expect(chips.map(chip => chip.label)).toEqual(["Example Atlas", "Example Cedar", "Stage: In batch", "Blocked at a gate", "Panel: Panel B", "Owner: Demo Analyst", "Search: “pilot”"]);
    expect(chips[1].next.clients).toEqual(["atlas"]);
    expect(chips[2].next.stages).toEqual([]);
    expect(chips[3].next.focus).toBeNull();
    expect(chips[6].next.query).toBe("");
    expect(describeFilters(emptyFilters, clients)).toEqual([]);
  });
  it("toggles a value in and out of a list", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("scope label", () => {
  it("names the scope for the top bar", () => {
    expect(scopeLabel([], clients)).toBe("All clients");
    expect(scopeLabel(["cedar"], clients)).toBe("Example Cedar");
    expect(scopeLabel(["cedar", "atlas"], clients)).toBe("2 clients");
  });
});

describe("audience scoping (P1-2)", () => {
  it("gives staff every order plus the companion client records of each mixed batch", () => {
    const staff = scopeToAudience(orders, clients, "staff");
    expect(staff.orders).toBe(orders);
    expect(staff.clients).toBe(clients);
    expect(staff.companions.ORD003.map(client => client.name)).toEqual(["Example Cedar"]);
    expect(staff.companions.ORD004.map(client => client.name)).toEqual(["Example Harbor"]);
    expect(staff.companions.ORD005).toBeUndefined();
    expect(staff.sharedBatches).toEqual(["B2026-031"]);
  });
  it("gives a client user only its own orders and client records, with shared batches kept anonymous", () => {
    const own = scopeToAudience(orders, clients, "client", ["harbor"]);
    expect(own.orders.map(o => o.code)).toEqual(["ORD003"]);
    expect(own.clients.map(c => c.id)).toEqual(["harbor"]);
    expect(own.companions).toEqual({});
    expect(own.sharedBatches).toEqual(["B2026-031"]);
    expect(JSON.stringify(own)).not.toMatch(/cedar|atlas/i);
    expect(scopeToAudience(orders, clients, "client", []).orders).toEqual([]);
  });
});

describe("mixed batches", () => {
  it("names the other client for staff and keeps it anonymous for client users", () => {
    expect(isMixedBatch(orders[2], orders)).toBe(true);
    expect(isMixedBatch(orders[4], orders)).toBe(false);
    expect(batchNote(orders[2], [clients[1]])).toBe("Batch B2026-031 · shared with Example Cedar");
    expect(batchNote(orders[2], [], true)).toBe("Batch B2026-031 · also contains another client’s samples");
    expect(batchNote(orders[4], [], false)).toBe("Batch B2026-030");
    expect(batchNote(orders[0], [], false)).toBeNull();
  });
});
