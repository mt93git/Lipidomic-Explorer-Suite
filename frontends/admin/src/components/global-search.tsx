"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { Client } from "@/lib/models";
import { emptyFilters, parseFilters, serializeFilters } from "@/lib/pipeline-filters";

// Top-bar search. On the overview it keeps every other active filter: the hidden fields make the plain GET
// submission filter-aware, and with JavaScript the submit becomes a history entry with no server round trip.
export function GlobalSearch({ staff, clients }: { staff: boolean; clients: Client[] }) {
  const pathname = (usePathname() || "/").replace(/^\/admin(?=\/|$)/, "") || "/";
  const params = useSearchParams();
  const onOverview = staff && pathname === "/pipeline";
  const current = onOverview ? parseFilters(params ?? new URLSearchParams(), clients) : emptyFilters;
  const carried = Array.from(new URLSearchParams(serializeFilters({ ...current, query: "" })));
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!onOverview) return;
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "");
    const search = serializeFilters({ ...current, query });
    window.history.pushState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  };
  return <form className="search" action={staff ? "/admin/pipeline" : "/admin/client/home"} method="get" role="search" onSubmit={submit}>
    <label className="sr-only" htmlFor="global-search">Search orders</label>
    <input id="global-search" name="q" type="search" key={current.query} defaultValue={current.query} placeholder={staff ? "Search orders, descriptions…" : "Client search · Phase 2"} disabled={!staff} />
    {carried.map(([name, value], index) => <input key={`${name}-${index}`} type="hidden" name={name} value={value} />)}
  </form>;
}
