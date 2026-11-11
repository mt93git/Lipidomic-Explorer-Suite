import { gateStatus, stages, type Client, type Order, type View } from "./models";

// Pure filter model for the global overview. The URL query is the single source of truth:
// client=a&client=b  stage=in-batch&stage=acquired  focus=blocked  panel=…&panel=…  owner=…  q=…  group=client
// Multi-value dimensions use repeated keys so values may contain commas. `q` is one scalar kept exactly as typed.
// `client` and `stage` ids are slugs, so their legacy comma form (client=a,b) is still accepted on input.

export const focusKeys = ["blocked", "ready", "waiting", "instrument", "results", "released"] as const;
export type FocusKey = typeof focusKeys[number];
export type GroupBy = "stage" | "client";
export type PipelineFilters = {
  clients: string[];
  stages: number[];
  focus: FocusKey | null;
  panels: string[];
  owners: string[];
  query: string;
  group: GroupBy;
};
export type Chip = { id: string; label: string; next: PipelineFilters };
export type ClientRow = { client: Client; open: number; blocked: number; selected: boolean };

export const emptyFilters: PipelineFilters = { clients: [], stages: [], focus: null, panels: [], owners: [], query: "", group: "stage" };

export const focusLabels: Record<FocusKey, { label: string; note: string }> = {
  blocked: { label: "Blocked at a gate", note: "A check failed and needs a person" },
  ready: { label: "Ready to advance", note: "Every current check is clear" },
  waiting: { label: "Awaiting checks", note: "Checks still pending at this gate" },
  instrument: { label: "On the instrument", note: "Sequence exported, acquisition running" },
  results: { label: "Waiting for results", note: "Acquired, results file not yet accepted" },
  released: { label: "Released this week", note: "Signed datasets from the last 7 days" },
};

const INSTRUMENT_STAGE = 5; // Sequence exported
const RESULTS_STAGE = 6; // Acquired
export const QUERY_LIMIT = 200;
export const VALUE_LIMIT = 120; // panel and owner names coming from the URL
// "Released this week" is a rolling window of 7 × 24 h measured between real instants (releasedAt carries its offset).
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function stageSlug(index: number): string {
  return stages[index].toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
// Stage 8 read "QC checked" until QC review (0027) named it "QC reviewed"; links saved with the old slug still work.
const legacySlugs: Record<string, string> = { "qc-checked": "qc-reviewed" };
export function stageFromSlug(slug: string): number | null {
  const current = legacySlugs[slug] ?? slug;
  const index = stages.findIndex((_, i) => stageSlug(i) === current);
  return index === -1 ? null : index;
}

type SearchInput = URLSearchParams | Record<string, string | string[] | undefined>;
function rawValues(input: SearchInput, key: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(key);
  const value = input[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
// Names: one value per repeated key, trimmed and capped; never split, so commas survive.
function nameValues(input: SearchInput, key: string): string[] {
  return unique(rawValues(input, key).map(value => value.trim().slice(0, VALUE_LIMIT)).filter(Boolean));
}
// Ids (slugs): repeated keys, with the legacy comma form still accepted.
function idValues(input: SearchInput, key: string): string[] {
  return unique(rawValues(input, key).flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean));
}
function unique<T>(list: T[]): T[] { return Array.from(new Set(list)); }

export function parseFilters(input: SearchInput, clients: Client[]): PipelineFilters {
  const known = new Set(clients.map(client => client.id));
  const focus = idValues(input, "focus")[0];
  const group = idValues(input, "group")[0];
  const stageList = idValues(input, "stage").map(stageFromSlug).filter((index): index is number => index !== null);
  return {
    clients: idValues(input, "client").filter(id => known.has(id)),
    stages: unique(stageList).sort((a, b) => a - b),
    focus: (focusKeys as readonly string[]).includes(focus) ? focus as FocusKey : null,
    panels: nameValues(input, "panel"),
    owners: nameValues(input, "owner"),
    query: (rawValues(input, "q")[0] ?? "").slice(0, QUERY_LIMIT),
    group: group === "client" ? "client" : "stage",
  };
}

export function serializeFilters(filters: PipelineFilters): string {
  const params = new URLSearchParams();
  for (const id of filters.clients) params.append("client", id);
  for (const stage of [...filters.stages].sort((a, b) => a - b)) params.append("stage", stageSlug(stage));
  if (filters.focus) params.set("focus", filters.focus);
  for (const panel of filters.panels) params.append("panel", panel);
  for (const owner of filters.owners) params.append("owner", owner);
  if (filters.query) params.set("q", filters.query);
  if (filters.group !== "stage") params.set("group", filters.group);
  return params.toString();
}

export function matchesSearch(order: Order, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const sample = /^([a-z0-9]+)-s(\d+)$/.exec(needle);
  if (sample) return order.code.toLowerCase() === sample[1] && Number(sample[2]) >= 1 && Number(sample[2]) <= order.sampleCount;
  return [order.code, order.description, order.batch ?? "", order.panel, order.owner].join(" ").toLowerCase().includes(needle);
}

// Rolling window on instants: a dataset signed 167 h ago is "this week", one signed 169 h ago is not, whatever the calendar day.
export function releasedWithin(order: Order, now: Date, windowMs = WEEK_MS): boolean {
  if (!order.released || !order.releasedAt) return false;
  const instant = Date.parse(order.releasedAt);
  if (Number.isNaN(instant)) return false;
  const age = now.getTime() - instant;
  return age >= 0 && age <= windowMs;
}

export function matchesFocus(order: Order, focus: FocusKey, now: Date): boolean {
  if (focus === "released") return releasedWithin(order, now);
  if (order.released) return false;
  const status = gateStatus(order.gates);
  switch (focus) {
    case "blocked": return status === "fail";
    case "ready": return status === "ok";
    case "waiting": return status === "pending";
    case "instrument": return order.stage === INSTRUMENT_STAGE;
    case "results": return order.stage === RESULTS_STAGE;
  }
}

type ApplyOptions = { ignore?: (keyof PipelineFilters)[]; now?: Date };
export function applyFilters(orders: Order[], filters: PipelineFilters, { ignore = [], now = new Date() }: ApplyOptions = {}): Order[] {
  const on = (key: keyof PipelineFilters) => !ignore.includes(key);
  return orders.filter(order =>
    (!on("clients") || !filters.clients.length || filters.clients.includes(order.clientId))
    && (!on("stages") || !filters.stages.length || filters.stages.includes(order.stage))
    && (!on("focus") || !filters.focus || matchesFocus(order, filters.focus, now))
    && (!on("panels") || !filters.panels.length || filters.panels.includes(order.panel))
    && (!on("owners") || !filters.owners.length || filters.owners.includes(order.owner))
    && (!on("query") || matchesSearch(order, filters.query)));
}

export function focusCounts(orders: Order[], filters: PipelineFilters, now: Date): Record<FocusKey, number> {
  const scope = applyFilters(orders, filters, { ignore: ["focus"], now });
  return Object.fromEntries(focusKeys.map(key => [key, scope.filter(order => matchesFocus(order, key, now)).length])) as Record<FocusKey, number>;
}

export function clientBreakdown(orders: Order[], clients: Client[], filters: PipelineFilters, now: Date): ClientRow[] {
  const scope = applyFilters(orders, filters, { ignore: ["clients"], now });
  return clients.map(client => {
    const own = scope.filter(order => order.clientId === client.id);
    return {
      client,
      open: own.filter(order => !order.released).length,
      blocked: own.filter(order => !order.released && gateStatus(order.gates) === "fail").length,
      selected: filters.clients.includes(client.id),
    };
  });
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

export function describeFilters(filters: PipelineFilters, clients: Client[]): Chip[] {
  const chips: Chip[] = [];
  for (const id of filters.clients) chips.push({ id: `client:${id}`, label: clients.find(client => client.id === id)?.name ?? id, next: { ...filters, clients: filters.clients.filter(item => item !== id) } });
  for (const stage of filters.stages) chips.push({ id: `stage:${stage}`, label: `Stage: ${stages[stage]}`, next: { ...filters, stages: filters.stages.filter(item => item !== stage) } });
  if (filters.focus) chips.push({ id: `focus:${filters.focus}`, label: focusLabels[filters.focus].label, next: { ...filters, focus: null } });
  for (const panel of filters.panels) chips.push({ id: `panel:${panel}`, label: `Panel: ${panel}`, next: { ...filters, panels: filters.panels.filter(item => item !== panel) } });
  for (const owner of filters.owners) chips.push({ id: `owner:${owner}`, label: `Owner: ${owner}`, next: { ...filters, owners: filters.owners.filter(item => item !== owner) } });
  if (filters.query.trim()) chips.push({ id: "query", label: `Search: “${filters.query.trim()}”`, next: { ...filters, query: "" } });
  return chips;
}

export function hasActiveFilters(filters: PipelineFilters): boolean {
  return describeFilters(filters, []).length > 0;
}

// Top-bar scope label: "All clients", one client's name, or "N clients".
export function scopeLabel(selected: string[], clients: Client[]): string {
  if (!selected.length) return "All clients";
  if (selected.length === 1) return clients.find(client => client.id === selected[0])?.name ?? "1 client";
  return `${selected.length} clients`;
}

export function batchCompanions(order: Order, orders: Order[]): Order[] {
  if (!order.batch) return [];
  return orders.filter(other => other.batch === order.batch && other.clientId !== order.clientId);
}
export function isMixedBatch(order: Order, orders: Order[]): boolean {
  return batchCompanions(order, orders).length > 0;
}

// What one audience may render. Staff get everything plus the companion client records per mixed batch.
// A client user gets only its own orders and client records; the only thing kept from other clients is
// the fact that a batch is shared (a batch code), never a record or a name.
export type AudienceData = { orders: Order[]; clients: Client[]; companions: Record<string, Client[]>; sharedBatches: string[] };
export function scopeToAudience(orders: Order[], clients: Client[], audience: View, ownClientIds: string[] = []): AudienceData {
  const sharedBatches = unique(orders.filter(order => isMixedBatch(order, orders)).map(order => order.batch as string));
  if (audience !== "staff") {
    const own = new Set(ownClientIds);
    return { orders: orders.filter(order => own.has(order.clientId)), clients: clients.filter(client => own.has(client.id)), companions: {}, sharedBatches };
  }
  const companions: Record<string, Client[]> = {};
  for (const order of orders) {
    const ids = unique(batchCompanions(order, orders).map(other => other.clientId));
    if (ids.length) companions[order.code] = ids.map(id => clients.find(client => client.id === id) ?? { id, name: "Another client", color: "shared" });
  }
  return { orders, clients, companions, sharedBatches };
}

// Batch line on a card. Named companions are only ever supplied for staff (see scopeToAudience).
export function batchNote(order: Order, companions: Client[], shared = companions.length > 0): string | null {
  if (!order.batch) return null;
  if (companions.length) return `Batch ${order.batch} · shared with ${companions.map(client => client.name).join(", ")}`;
  if (shared) return `Batch ${order.batch} · also contains another client’s samples`;
  return `Batch ${order.batch}`;
}
