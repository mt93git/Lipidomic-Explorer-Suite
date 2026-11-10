"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "@/components/app-link";
import { formatClock, formatLabDay } from "@/lib/lab-time";
import { gateStatus, stages, type Client, type Order } from "@/lib/models";
import {
  applyFilters, batchNote, clientBreakdown, describeFilters, emptyFilters, focusCounts, focusKeys, focusLabels,
  scopeLabel, toggleValue, type AudienceData, type PipelineFilters,
} from "@/lib/pipeline-filters";
import { requestNotice } from "@/lib/order-request";
import { OrderCard } from "./order-card";
import { PipelineBoard } from "./pipeline-board";

type Props = {
  // Already restricted to what this audience may see (scopeToAudience): a client user never receives other clients' records.
  data: AudienceData;
  filters: PipelineFilters;
  onChange: (next: PipelineFilters) => void;
  // The instant the counts refer to; the parent refreshes it on each interaction and once a minute.
  now?: Date;
  // A request the lab just declined (?declined=ORD059): it left the board, so the answer is confirmed here.
  declined?: string | null;
};

const MENU_WIDTH = 320; // keep in step with .menu-list max-width
const unknownClient = (id: string): Client => ({ id, name: "Client", color: "atlas" });

// Checkbox menu that stays inside the viewport: right-aligned when it would cross the right edge (CSS turns it into a full-width sheet on phones).
function FilterMenu({ label, selected, children }: { label: string; selected: number; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [align, setAlign] = useState<"start" | "end">("start");
  const onToggle = () => {
    const element = ref.current;
    if (!element?.open) return;
    setAlign(element.getBoundingClientRect().left + MENU_WIDTH > window.innerWidth - 16 ? "end" : "start");
  };
  return <details className="menu" ref={ref} onToggle={onToggle} data-align={align}>
    <summary>{label}{selected ? ` · ${selected}` : ""} <span aria-hidden="true">▾</span></summary>
    <div className="menu-list">{children}</div>
  </details>;
}

export function Pipeline({ data, filters, onChange, now = new Date(), declined = null }: Props) {
  const { orders, clients, companions, sharedBatches } = data;
  const clientOf = (id: string) => clients.find(client => client.id === id) ?? unknownClient(id);
  const scoped = applyFilters(orders, filters, { now });
  const active = scoped.filter(order => !order.released);
  const released = scoped.filter(order => order.released).sort((a, b) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""));
  const counts = focusCounts(orders, filters, now);
  const rows = clientBreakdown(orders, clients, filters, now);
  const chips = describeFilters(filters, clients);
  // Client requests waiting for an answer, whatever the filters (there is no email: this is how the lab finds out).
  const requests = requestNotice(orders, clients);
  const panels = Array.from(new Set(orders.map(order => order.panel)));
  const owners = Array.from(new Set(orders.map(order => order.owner)));
  // Facet counts describe exactly the population that option would leave on the page (board and released list), ignoring only its own dimension.
  const facet = (dimension: keyof PipelineFilters, match: (order: Order) => boolean) => applyFilters(orders, filters, { ignore: [dimension], now }).filter(match).length;
  const showBoard = filters.focus !== "released";
  const emptyHint = filters.query.trim()
    ? `Nothing contains “${filters.query.trim()}”. Check the order or sample code, or remove the search.`
    : filters.focus ? `No orders are ${focusLabels[filters.focus].label.toLowerCase()} in this scope. Remove that focus or widen the client selection.`
    : "Widen the client, stage, panel or owner selection.";
  const card = (order: Order, stageLabel?: string) => {
    const others = companions[order.code] ?? [];
    const shared = Boolean(order.batch && sharedBatches.includes(order.batch));
    return <OrderCard key={order.code} order={order} client={clientOf(order.clientId)} companions={others} shared={shared} note={batchNote(order, others, shared)} stageLabel={stageLabel} />;
  };

  // Focus policy when a chip disappears: the next chip, else the previous one, else the toolbar search. "Clear all" goes to the search.
  const searchRef = useRef<HTMLInputElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    (target === "search" ? searchRef.current : chipRefs.current.get(target) ?? searchRef.current)?.focus();
  });
  const removeChip = (index: number) => {
    const neighbour = chips[index + 1] ?? chips[index - 1];
    pendingFocus.current = neighbour ? neighbour.id : "search";
    onChange(chips[index].next);
  };
  const clearAll = () => { pendingFocus.current = "search"; onChange({ ...emptyFilters, group: filters.group }); };

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">Lab work / {scopeLabel(filters.clients, clients)}</div><h1>Pipeline</h1><p>Every order from every client, from first request to a signed dataset. Pick a state, a client or a stage to narrow the board.</p></div>
      <div className="heading-actions"><Link className="button secondary" href="/receive-shipment">Receive shipment</Link><Link className="button" href="/new-order">+ New order</Link></div>
    </div>
    {declined && <p className="notice success" role="status"><strong>Request <span className="mono">{declined}</span> declined.</strong> The order is archived; the client reads your reason on it.</p>}
    {requests && <p className="notice warning" role="status" aria-label="Client requests">
      <strong>{requests.count === 1 ? "1 client request is" : `${requests.count} client requests are`} waiting for an answer.</strong> {requests.text}.
      <Link className="button" href={`/orders/${requests.first}`}>Review {requests.first} →</Link>
    </p>}

    <section aria-labelledby="needs-title" className="summary-block">
      <div className="section-heading"><h2 id="needs-title" className="section-title">What needs you now</h2><span className="as-of">as of <time dateTime={now.toISOString()}>{formatClock(now)}</time></span></div>
      <div className="summary" role="group" aria-label="Attention states">
        {focusKeys.map(key => <button key={key} type="button" className={`summary-tile ${key}`} aria-pressed={filters.focus === key}
          onClick={() => onChange({ ...filters, focus: filters.focus === key ? null : key })}>
          <span className="metric-title">{focusLabels[key].label}</span><span className="number">{counts[key]}</span><small>{focusLabels[key].note}</small>
        </button>)}
      </div>
    </section>

    <section aria-labelledby="clients-title" className="client-block">
      <h2 id="clients-title" className="section-title">By client</h2>
      <div className="client-strip" role="group" aria-label="Filter by client">
        <button type="button" className="client-row" aria-pressed={!filters.clients.length} onClick={() => onChange({ ...filters, clients: [] })}>
          <span className="client-name">All clients</span><span className="client-stats"><span>{rows.reduce((sum, row) => sum + row.open, 0)} open</span><span className={rows.some(row => row.blocked) ? "blocked" : ""}>{rows.reduce((sum, row) => sum + row.blocked, 0)} blocked</span></span>
        </button>
        {rows.map(row => <button key={row.client.id} type="button" className="client-row" aria-pressed={row.selected} onClick={() => onChange({ ...filters, clients: toggleValue(filters.clients, row.client.id) })}>
          <span className="client-name"><span className="color-square" data-color={row.client.color} aria-hidden="true" />{row.client.name}</span>
          <span className="client-stats"><span>{row.open} open</span><span className={row.blocked ? "blocked" : ""}>{row.blocked} blocked</span></span>
        </button>)}
      </div>
    </section>

    <div className="toolbar" role="group" aria-label="More filters">
      <label className="inline-search"><span className="sr-only">Search orders in the overview</span>
        <input ref={searchRef} type="search" value={filters.query} placeholder="Order code, description, sample code…" onChange={event => onChange({ ...filters, query: event.target.value })} /></label>
      <FilterMenu label="Stage" selected={filters.stages.length}>
        {stages.map((stage, index) => <label key={stage} className="menu-option"><input type="checkbox" checked={filters.stages.includes(index)} onChange={() => onChange({ ...filters, stages: toggleValue(filters.stages, index) })} /><span className="column-index">{String(index + 1).padStart(2, "0")}</span>{stage}<span className="menu-count">{facet("stages", order => order.stage === index)}</span></label>)}
      </FilterMenu>
      <FilterMenu label="Panel" selected={filters.panels.length}>
        {panels.map(panel => <label key={panel} className="menu-option"><input type="checkbox" checked={filters.panels.includes(panel)} onChange={() => onChange({ ...filters, panels: toggleValue(filters.panels, panel) })} />{panel}<span className="menu-count">{facet("panels", order => order.panel === panel)}</span></label>)}
      </FilterMenu>
      <FilterMenu label="Owner" selected={filters.owners.length}>
        {owners.map(owner => <label key={owner} className="menu-option"><input type="checkbox" checked={filters.owners.includes(owner)} onChange={() => onChange({ ...filters, owners: toggleValue(filters.owners, owner) })} />{owner}<span className="menu-count">{facet("owners", order => order.owner === owner)}</span></label>)}
      </FilterMenu>
      <div className="group-toggle" role="group" aria-label="Group by">
        <button type="button" aria-pressed={filters.group === "stage"} onClick={() => onChange({ ...filters, group: "stage" })}>By stage</button>
        <button type="button" aria-pressed={filters.group === "client"} onClick={() => onChange({ ...filters, group: "client" })}>By client</button>
      </div>
    </div>

    {chips.length > 0 && <ul className="chips" aria-label="Active filters">
      {chips.map((chip, index) => <li key={chip.id}>
        <button type="button" className="chip" title={chip.label} aria-label={`Remove filter: ${chip.label}`} onClick={() => removeChip(index)}
          ref={element => { if (element) chipRefs.current.set(chip.id, element); else chipRefs.current.delete(chip.id); }}>
          <span className="chip-label">{chip.label}</span><span className="chip-remove" aria-hidden="true">×</span>
        </button>
      </li>)}
      <li><button type="button" className="link-button" onClick={clearAll}>Clear all</button></li>
    </ul>}

    {scoped.length === 0 && <div className="empty-state" role="status"><strong>No orders match these filters.</strong><p>{emptyHint}</p>{chips.length > 0 && <button type="button" className="button secondary" onClick={clearAll}>Clear all filters</button>}</div>}

    {showBoard && filters.group === "stage" && <PipelineBoard orders={scoped} renderOrder={card} />}

    {showBoard && filters.group === "client" && <div className="lanes" role="region" aria-label="Orders by client">
      {rows.filter(row => row.selected || active.some(order => order.clientId === row.client.id)).map(row => {
        const lane = active.filter(order => order.clientId === row.client.id).sort((a, b) => a.stage - b.stage);
        return <section className="lane" key={row.client.id} aria-label={row.client.name}>
          <div className="lane-heading"><h2><span className="color-square" data-color={row.client.color} aria-hidden="true" />{row.client.name}</h2><span className="lane-stats">{lane.length} open · <span className={lane.some(order => gateStatus(order.gates) === "fail") ? "blocked" : ""}>{lane.filter(order => gateStatus(order.gates) === "fail").length} blocked</span></span></div>
          {lane.length ? <div className="lane-cards">{lane.map(order => card(order, `${String(order.stage + 1).padStart(2, "0")} · ${stages[order.stage]}`))}</div> : <p className="empty-column">No open orders in this scope</p>}
        </section>;
      })}
    </div>}

    {(released.length > 0 || !showBoard) && <section className="released-block" aria-labelledby="released-title">
      <h2 id="released-title" className="section-title">{filters.focus === "released" ? "Released this week" : "Released"}</h2>
      {released.length ? <ul className="released-list">{released.map(order => <li key={order.code}><span className="color-square" data-color={clientOf(order.clientId).color} aria-hidden="true" /><Link href={`/orders/${order.code}`}>{order.code}</Link> · {order.description} <span className="muted">· {clientOf(order.clientId).name}{order.releasedAt ? ` · ${formatLabDay(order.releasedAt)}` : ""}{order.retired ? ` · then ${order.retired.status}` : ""}</span></li>)}</ul>
        : <p className="muted">Nothing was released in the last 7 days for this scope.</p>}
    </section>}
  </>;
}
