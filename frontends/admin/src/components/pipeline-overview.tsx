"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Client, Order, View } from "@/lib/models";
import { parseFilters, scopeToAudience, serializeFilters, type PipelineFilters } from "@/lib/pipeline-filters";
import { Pipeline } from "./pipeline";

const CLOCK_TICK_MS = 60_000;
const noClients: string[] = [];

type Props = {
  orders: Order[];
  clients: Client[];
  audience?: View;
  // Client users: the ids of the clients they belong to. Everything else is filtered out before rendering.
  ownClients?: string[];
  // Server instant (ISO) used for the first render on both sides, so hydration matches; refreshed on interaction and once a minute.
  today: string;
};

// The URL query is the only filter state: shareable, survives reload, and the top-bar scope control reads the same params.
export function PipelineOverview({ orders, clients, audience = "staff", ownClients = noClients, today }: Props) {
  const params = useSearchParams();
  const data = useMemo(() => scopeToAudience(orders, clients, audience, ownClients), [orders, clients, audience, ownClients]);
  const filters = useMemo(() => parseFilters(params ?? new URLSearchParams(), data.clients), [params, data.clients]);
  const [now, setNow] = useState(() => new Date(today));
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const onChange = useCallback((next: PipelineFilters) => {
    setNow(new Date());
    const search = serializeFilters(next);
    // Native history integration keeps useSearchParams in sync without a server round trip.
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, []);
  return <Pipeline data={data} filters={filters} onChange={onChange} now={now} />;
}
