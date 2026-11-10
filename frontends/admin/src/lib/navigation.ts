import type { View } from "@/lib/models";

// `ready` marks a screen that works today; the others are placeholders rendered by the [...path] route and listed
// in the sidebar's collapsed "Coming next" group. Items are in the order of the lab's flow.
// roles: only these session roles see the item (the page itself still checks); absent = everyone in the group's view.
export type NavItem = { label: string; href: string; phase: string; description: string; ready?: boolean; roles?: readonly string[] };
export type NavGroup = { title: string; audience: "all" | "staff" | "client"; items: NavItem[] };

export const navigation: NavGroup[] = [
  { title: "LAB WORK", audience: "staff", items: [
    { label: "Pipeline", href: "/pipeline", phase: "Phase 1 · Wave 1", description: "Every client's orders, what needs you now, and each order's next gate.", ready: true },
    { label: "New order", href: "/new-order", phase: "Phase 1 · Wave 2", description: "Create an order and define its requested panel.", ready: true },
    { label: "Receive shipment", href: "/receive-shipment", phase: "Phase 1 · Wave 2", description: "Record arrival, condition, and shipment contents.", ready: true },
    { label: "Sample registry", href: "/sample-registry", phase: "Phase 1 · Wave 2", description: "Register samples and review their identifiers.", ready: true },
    { label: "Storage", href: "/storage", phase: "Phase 1 · Wave 2", description: "Track sample locations and storage movements." },
    { label: "Batch builder", href: "/batch-builder", phase: "Phase 1 · Wave 3", description: "Assemble a batch with samples, blanks, and pooled QC.", ready: true },
    { label: "Batch run", href: "/batch-run", phase: "Phase 1 · Wave 3", description: "Export a frozen sequence and record acquisition.", ready: true },
    { label: "Ingest results", href: "/ingest-results", phase: "Phase 1 · Wave 3", description: "Accept a results file and reconcile injection names.", ready: true },
    { label: "Name dictionary", href: "/name-dictionary", phase: "Phase 1 · Wave 3", description: "Review explicit analyte name mappings.", ready: true },
    { label: "QC review", href: "/qc-review", phase: "Phase 1 · Wave 4", description: "Review QC, exclusions, and the processing record." },
    { label: "Release", href: "/release", phase: "Phase 1 · Wave 4", description: "Collect signatures from two different people before release.", ready: true },
    { label: "Datasets", href: "/datasets", phase: "Phase 1 · Wave 4", description: "Find frozen dataset versions and their provenance.", ready: true },
  ] },
  { title: "CLIENTS", audience: "staff", items: [
    { label: "Clients", href: "/clients", phase: "Phase 1 · Wave 2", description: "Manage client organizations and their memberships.", ready: true },
  ] },
  { title: "ORGANIZATION", audience: "staff", items: [
    { label: "People", href: "/people", phase: "Phase 1 · Wave 2", description: "Invite people and review their access.", ready: true },
    { label: "Roles & permissions", href: "/roles-permissions", phase: "Phase 1 · Wave 2", description: "Manage lab, project, and client roles.", ready: true },
    { label: "Audit log", href: "/audit-log", phase: "Phase 1 · Wave 2", description: "Inspect the append-only record of changes.", ready: true },
    { label: "Release policy", href: "/release-policy", phase: "Phase 1 · Wave 4", description: "Who may sign a release and how many signatures it needs.", ready: true },
    { label: "Shipping instructions", href: "/shipping-instructions", phase: "Phase 1 · Client portal", description: "What clients read on an accepted request before they ship.", ready: true },
    { label: "Instruments & panels", href: "/instruments-panels", phase: "Phase 2", description: "Configure instrument and assay panel records." },
    { label: "Notifications", href: "/notifications", phase: "Phase 2", description: "Manage workflow notifications and preferences." },
  ] },
  { title: "CLIENT PORTAL", audience: "client", items: [
    { label: "Home", href: "/client/home", phase: "Phase 1 · Client portal", description: "Your selected client's orders, each at its step, and the datasets released to it.", ready: true },
    { label: "Request an order", href: "/client/request-order", phase: "Phase 1 · Client portal", description: "Ask the lab for an order; it accepts or tells you why not.", ready: true, roles: ["Client admin", "Requester"] },
  ] },
];

export function findRoute(path: string) {
  for (const group of navigation) {
    const item = group.items.find(item => item.href === path);
    if (item) return { ...item, audience: group.audience };
  }
  return null;
}

// What the sidebar shows: for lab staff, the working screens in their groups and the placeholders apart; the
// client view keeps its own items, less those its role does not use (a Viewer requests no orders).
export function sidebarNavigation(view: View, role?: string | null): { groups: NavGroup[]; comingNext: NavItem[] } {
  const groups = navigation.filter(group => group.audience === "all" || group.audience === view)
    .map(group => ({ ...group, items: group.items.filter(item => !item.roles || (!!role && item.roles.includes(role))) }));
  if (view !== "staff") return { groups, comingNext: [] };
  return {
    groups: groups.map(group => ({ ...group, items: group.items.filter(item => item.ready) })).filter(group => group.items.length > 0),
    comingNext: groups.flatMap(group => group.items.filter(item => !item.ready)),
  };
}

// "Phase 1 · Wave 2" → "Wave 2"; a plain phase has no wave tag.
export const waveTag = (phase: string): string | null => /Wave \d+/.exec(phase)?.[0] ?? null;
