"use client";

import Link from "@/components/app-link";
import { stripBasePath } from "@/lib/base-path";
import { usePathname, useSearchParams } from "next/navigation";
import type { Client } from "@/lib/models";
import { emptyFilters, parseFilters, scopeLabel, serializeFilters, toggleValue } from "@/lib/pipeline-filters";

// Staff scope: a shortcut into the overview filtered by client. It mirrors the overview's client filter
// because both read the same URL params; it never persists a selection.
export function ScopeControl({ clients }: { clients: Client[] }) {
  const pathname = stripBasePath(usePathname() || "/");
  const params = useSearchParams();
  const current = pathname === "/pipeline" ? parseFilters(params ?? new URLSearchParams(), clients) : emptyFilters;
  const href = (ids: string[]) => { const search = serializeFilters({ ...current, clients: ids }); return `/pipeline${search ? `?${search}` : ""}`; };
  return <details className="scope">
    <summary aria-label={`Client scope: ${scopeLabel(current.clients, clients)}`}>{scopeLabel(current.clients, clients)} <span aria-hidden="true">▾</span></summary>
    <div className="scope-menu" role="group" aria-label="Client scope">
      <Link href={href([])} aria-current={!current.clients.length ? "true" : undefined}>All clients</Link>
      {clients.map(client => <Link key={client.id} href={href(toggleValue(current.clients, client.id))} aria-current={current.clients.includes(client.id) ? "true" : undefined}>
        <span className="color-square" data-color={client.color} aria-hidden="true" />{client.name}
      </Link>)}
      {!clients.length && <span className="muted">No clients yet</span>}
    </div>
  </details>;
}
