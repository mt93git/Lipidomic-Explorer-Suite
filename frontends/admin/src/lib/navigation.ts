export type NavItem = { label: string; href: string; phase: string; description: string };
export type NavGroup = { title: string; audience: "all" | "staff" | "client"; items: NavItem[] };

export const navigation: NavGroup[] = [
  { title: "ACCESS", audience: "all", items: [
    { label: "Sign in", href: "/sign-in", phase: "Phase 1 · Wave 1", description: "Email and two-step authentication." },
    { label: "Choose client", href: "/choose-client", phase: "Phase 1 · Wave 1", description: "Select your client workspace." },
  ] },
  { title: "LAB WORK", audience: "staff", items: [
    { label: "Pipeline", href: "/pipeline", phase: "Phase 1 · Wave 1", description: "Every client's orders, what needs you now, and each order's next gate." },
    { label: "Order detail", href: "/orders/ORD041", phase: "Phase 1 · Wave 1", description: "An order's progress and history." },
    { label: "New order", href: "/new-order", phase: "Phase 1 · Wave 2", description: "Create an order and define its requested panel." },
    { label: "Receive shipment", href: "/receive-shipment", phase: "Phase 1 · Wave 2", description: "Record arrival, condition, and shipment contents." },
    { label: "Sample registry", href: "/sample-registry", phase: "Phase 1 · Wave 2", description: "Register samples and review their identifiers." },
    { label: "Sample detail", href: "/sample-detail", phase: "Phase 1 · Wave 2", description: "Inspect metadata and the history of a sample." },
    { label: "Storage", href: "/storage", phase: "Phase 1 · Wave 2", description: "Track sample locations and storage movements." },
    { label: "Batch builder", href: "/batch-builder", phase: "Phase 1 · Wave 3", description: "Assemble a batch with samples, blanks, and pooled QC." },
    { label: "Batch run", href: "/batch-run", phase: "Phase 1 · Wave 3", description: "Export a frozen sequence and record acquisition." },
    { label: "Ingest results", href: "/ingest-results", phase: "Phase 1 · Wave 3", description: "Accept a results file and reconcile injection names." },
    { label: "Name dictionary", href: "/name-dictionary", phase: "Phase 1 · Wave 3", description: "Review explicit analyte name mappings." },
    { label: "QC review", href: "/qc-review", phase: "Phase 1 · Wave 4", description: "Review QC, exclusions, and the processing record." },
    { label: "Release", href: "/release", phase: "Phase 1 · Wave 4", description: "Collect signatures from two different people before release." },
    { label: "Datasets", href: "/datasets", phase: "Phase 1 · Wave 4", description: "Find frozen dataset versions and their provenance." },
  ] },
  { title: "CLIENTS", audience: "staff", items: [
    { label: "Clients", href: "/clients", phase: "Phase 1 · Wave 2", description: "Manage client organizations and their memberships." },
    { label: "Client detail", href: "/client-detail", phase: "Phase 1 · Wave 2", description: "Review a client's people, orders, and account details." },
  ] },
  { title: "ORGANIZATION", audience: "staff", items: [
    { label: "People", href: "/people", phase: "Phase 1 · Wave 2", description: "Invite people and review their access." },
    { label: "Roles & permissions", href: "/roles-permissions", phase: "Phase 1 · Wave 2", description: "Manage lab, project, and client roles." },
    { label: "Audit log", href: "/audit-log", phase: "Phase 1 · Wave 2", description: "Inspect the append-only record of changes." },
    { label: "Instruments & panels", href: "/instruments-panels", phase: "Phase 2", description: "Configure instrument and assay panel records." },
    { label: "Notifications", href: "/notifications", phase: "Phase 2", description: "Manage workflow notifications and preferences." },
  ] },
  { title: "CLIENT PORTAL", audience: "client", items: [
    { label: "Client home", href: "/client/home", phase: "Phase 2", description: "View your selected client's orders and released datasets." },
    { label: "Client order", href: "/client/order", phase: "Phase 2", description: "Follow an order and review its shared deliverables." },
  ] },
];

export function findRoute(path: string) {
  for (const group of navigation) {
    const item = group.items.find(item => item.href === path);
    if (item) return { ...item, audience: group.audience };
  }
  return null;
}
