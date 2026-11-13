// The showcase seed's plan (e2e/live/demo-seed.mjs, docs/admin/admin-demo-seed.md): who and what the demo is made of,
// where each order is parked, which real admin.* steps take it there, and the synthetic files those steps need. Pure:
// no network, no environment, no clock unless one is passed. Everything synthetic: reserved test domain, " (demo)" at
// the end of every name and title, never a real person, sample or study.
import { createHash } from "node:crypto";

export const SUFFIX = " (demo)";
export const DOMAIN = "admin-staging.test";
export const RESET_REASON = "Demo seed reset (demo)";
export const PANEL = { name: "Demo Lipid Panel (demo)", lcMethod: "Synthetic LC method (demo)", datasetType: "global" };
// The freezer box the batched orders' aliquots are placed in (Storage screen), 9 × 9 slots A1…I9.
export const BOX = "Demo freezer box 1 (demo)";
export const BOX_ROWS = "ABCDEFGHI";
export const BOX_COLUMNS = 9;
export const PLATE = "Plate 1"; // as src/lib/batch-builder.ts
export const SCIEX_OS_VERSION = "3.4.5 (synthetic demo)";
export const PROCESSING_METHOD = "Synthetic demo processing method";

// Lab staff (service key: no RPC creates a lab_staff row for an Admin). The approver is an Owner so that, when the
// lab's release policy does not let the two demo people sign, it can widen the policy for the run and put it back.
export const STAFF = {
  staff: { email: `demo.staff@${DOMAIN}`, name: "Demo Staff (demo)", role: "admin" },
  approver: { email: `demo.approver@${DOMAIN}`, name: "Demo Approver (demo)", role: "owner" },
};

// One requester per client. The client and the membership come from the real path: the member's access request,
// approved by Demo Staff, the invitation accepted by the member (display_name = the request's full name, 0023).
export const CLIENTS = [
  { key: "harbor", name: "Harbor Lipid Lab (demo)", kind: "pi_lab", initials: "HL", member: { name: "Rowan Hale (demo)", email: `harbor.demo@${DOMAIN}` } },
  { key: "cedar", name: "Cedar Cardio Group (demo)", kind: "internal_group", initials: "CC", member: { name: "Imani Cole (demo)", email: `cedar.demo@${DOMAIN}` } },
  { key: "atlas", name: "Atlas Nutrition Core (demo)", kind: "company", initials: "AN", member: { name: "Theo Marsh (demo)", email: `atlas.demo@${DOMAIN}` } },
];

// Where an order can be parked, in pipeline order: the stage (and review) it ends at.
export const POINTS = {
  pending: { stage: "request", review: "pending", label: "Request, pending review" },
  accepted: { stage: "request", review: "accepted", label: "Request, accepted, waiting for samples" },
  received: { stage: "received", review: "accepted", label: "Received" },
  registered: { stage: "registered", review: "accepted", label: "Registered" },
  in_batch: { stage: "in_batch", review: "accepted", label: "In batch" },
  acquired: { stage: "acquired", review: "accepted", label: "Acquired" },
  excel_built: { stage: "excel_built", review: "accepted", label: "Dataset built, 1 of 2 signatures" },
  released: { stage: "released", review: "accepted", label: "Released, with a deliverable" },
  declined: { stage: "request", review: "declined", label: "Declined" },
};

// The steps, in the order an order takes them. Each is one real admin.* RPC (plus, for results, build and deliverable,
// the upload to admin-files the app makes first), called with the token of the person named.
export const STEPS = {
  request: { who: "member", rpc: "request_order" },
  accept: { who: "staff", rpc: "accept_order" },
  decline: { who: "staff", rpc: "decline_order" },
  receive: { who: "staff", rpc: "receive_shipment" },
  register: { who: "staff", rpc: "register_samples" },
  batch: { who: "staff", rpc: "create_batch" },
  store: { who: "staff", rpc: "place_aliquot" },
  export: { who: "staff", rpc: "mark_batch_exported" },
  acquire: { who: "staff", rpc: "mark_batch_acquired" },
  results: { who: "staff", rpc: "accept_result_file" },
  build: { who: "staff", rpc: "build_dataset" },
  sign_prepared: { who: "staff", rpc: "sign_dataset" },
  sign_approved: { who: "approver", rpc: "sign_dataset" },
  release: { who: "staff", rpc: "release_dataset" },
  deliverable: { who: "staff", rpc: "add_deliverable" },
};
const PATH = ["request", "accept", "receive", "register", "batch", "store", "export", "acquire", "results", "build", "sign_prepared", "sign_approved", "release", "deliverable"];
const LAST = { pending: "request", accepted: "accept", received: "receive", registered: "register", in_batch: "store", acquired: "acquire", excel_built: "sign_prepared", released: "deliverable" };

/** The steps that take a new order to a parking point. */
export function stepsFor(point) {
  if (point === "declined") return ["request", "decline"];
  if (!LAST[point]) throw new Error(`demo plan: unknown point ${point}`);
  return PATH.slice(0, PATH.indexOf(LAST[point]) + 1);
}

// The orders. "extracted" was asked for, but no admin RPC moves an order to Extracted: create_batch records the
// extraction (it creates the aliquots) and moves the order straight to In batch. That order is parked one stage
// earlier, at Registered; the Storage screen shows the aliquots of the batched orders instead.
export const ORDERS = [
  { key: "pending", client: "harbor", point: "pending", title: "Plasma lipid screen, spring cohort (demo)", matrix: "Plasma", samples: 6, groups: ["Baseline", "Week 8"] },
  { key: "accepted", client: "cedar", point: "accepted", title: "Serum ceramide panel, pilot (demo)", matrix: "Serum", samples: 8, groups: ["Control", "Case"] },
  { key: "received", client: "atlas", point: "received", title: "Liver tissue lipidome, diet study (demo)", matrix: "Liver tissue", samples: 6, groups: ["Chow", "High-fat diet"] },
  { key: "registered", client: "harbor", point: "registered", title: "Plasma fasting vs fed (demo)", matrix: "Plasma", samples: 8, groups: ["Fasting", "Fed"] },
  { key: "extracted", client: "cedar", point: "registered", wanted: "extracted", title: "Serum statin follow-up (demo)", matrix: "Serum", samples: 10, groups: ["Pre-statin", "On statin"],
    note: "no admin RPC moves an order to Extracted (create_batch records extraction and moves it to In batch): parked at Registered" },
  { key: "in_batch", client: "atlas", point: "in_batch", title: "Liver tissue time course (demo)", matrix: "Liver tissue", samples: 6, groups: ["0 h", "24 h"] },
  { key: "acquired", client: "harbor", point: "acquired", title: "Plasma omega-3 supplementation (demo)", matrix: "Plasma", samples: 12, groups: ["Placebo", "Omega-3"] },
  { key: "excel_built", client: "cedar", point: "excel_built", title: "Serum lipoprotein fractions (demo)", matrix: "Serum", samples: 6, groups: ["HDL", "LDL"] },
  { key: "released", client: "atlas", point: "released", title: "Liver tissue knockout comparison (demo)", matrix: "Liver tissue", samples: 8, groups: ["Wild type", "Knockout"] },
  { key: "declined", client: "harbor", point: "declined", title: "Plasma oxylipin screen (demo)", matrix: "Plasma", samples: 4, groups: ["Control", "Treated"],
    declineReason: "The oxylipin panel is not offered yet; please ask again next quarter (demo)." },
];

export const clientOf = order => CLIENTS.find(client => client.key === order.client);
export const isDemoName = name => typeof name === "string" && name.endsWith(SUFFIX);
const pad = (n, width = 2) => String(n).padStart(width, "0");

/** The order's request: what the member sends to request_order. */
export function orderRequest(order, index = ORDERS.indexOf(order)) {
  return {
    p_title: order.title, p_matrix: order.matrix, p_expected_samples: order.samples,
    p_billing_ref: `DEMO-${pad(index + 1, 4)}`, p_notes: `Synthetic demo order: ${order.samples} ${order.matrix.toLowerCase()} samples (demo).`,
  };
}

/** The samples register_samples records: FullName HL-PL-01…, two groups alternating, synthetic patients. */
export function demoSamples(order) {
  const client = clientOf(order);
  const matrixCode = { Plasma: "PL", Serum: "SE", "Liver tissue": "LV" }[order.matrix];
  const orderNumber = ORDERS.indexOf(order) + 1;
  return Array.from({ length: order.samples }, (_, i) => ({
    full_name: `${client.initials}-${matrixCode}-${pad(i + 1)}`,
    client_sample_id: `${client.initials}${pad(orderNumber)}-${pad(i + 1, 3)}`,
    group1_term: order.groups[i % 2],
    group2_term: Math.floor(i / 2) % 2 ? "Male" : "Female",
    replicate_term: String(Math.floor(i / 2) + 1),
    patient_term: `${client.initials}P${pad(orderNumber)}${pad(i + 1)}`,
    time_point_term: order.key === "in_batch" ? order.groups[i % 2].replace(" ", "") : "0h",
    matrix: order.matrix,
    volume_ul: order.matrix === "Liver tissue" ? 20 : 50,
  }));
}

// ---------------------------------------------------------------- idempotency: what an existing order still needs

const RANK = ["request", "received", "registered", "extracted", "in_batch", "sequence_exported", "acquired", "processed", "qc_checked", "excel_built", "released"];
const reached = (state, stage) => RANK.indexOf(state.stage ?? "") >= RANK.indexOf(stage);
const DONE = {
  request: state => Boolean(state.exists),
  accept: state => Boolean(state.exists) && state.review !== "pending",
  decline: state => state.review === "declined",
  receive: state => reached(state, "received"),
  register: state => reached(state, "registered"),
  batch: state => reached(state, "in_batch"),
  store: state => reached(state, "in_batch") && state.unplacedAliquots === 0,
  export: state => reached(state, "sequence_exported"),
  acquire: state => reached(state, "acquired"),
  results: state => reached(state, "processed"),
  build: state => reached(state, "excel_built"),
  sign_prepared: state => reached(state, "released") || (state.signedBy ?? []).includes("staff"),
  sign_approved: state => reached(state, "released") || (state.signedBy ?? []).includes("approver"),
  release: state => reached(state, "released"),
  deliverable: state => (state.deliverables ?? 0) > 0,
};

/**
 * The steps an order still needs to reach its point, given what the database shows. A missing order needs them all;
 * a run that stopped half way resumes where it stopped; an order already there (or further) needs none.
 * @param {string} point
 * @param {{ exists?: boolean, review?: string|null, stage?: string|null, unplacedAliquots?: number, signedBy?: string[], deliverables?: number }} state
 */
export function nextSteps(point, state = {}) {
  return stepsFor(point).filter(step => !DONE[step](state));
}

/** The idempotency key of an order: its client and title. A live order matches; for the declined slot, a declined one. */
export function matchesOrder(order, clientId, row) {
  if (row.client_id !== clientId || row.title !== order.title) return false;
  return order.point === "declined" ? row.review === "declined" || row.archived_at === null : row.archived_at === null;
}

// ---------------------------------------------------------------- storage slots

const STORED = new Set(["in_batch", "acquired", "excel_built", "released"]);
/**
 * First slot (0-based) of each batched order's aliquots in BOX, in plan order: fixed, so a rerun picks the same slots.
 * @returns {Record<string, number>}
 */
export function slotOffsets() {
  const offsets = {};
  let next = 0;
  for (const order of ORDERS) if (STORED.has(order.point)) { offsets[order.key] = next; next += order.samples; }
  if (next > BOX_ROWS.length * BOX_COLUMNS) throw new Error("demo plan: more aliquots than slots in the demo box");
  return offsets;
}
export const slotName = index => `${BOX_ROWS[Math.floor(index / BOX_COLUMNS)]}${(index % BOX_COLUMNS) + 1}`;

// ---------------------------------------------------------------- batch

/** create_batch's injections: one blank, the samples in sample-number order, one pooled QC at the end (row-major vials). */
export function batchInjections(samples) {
  const list = [
    { sample_type: "Blank", sample_name: "Blank_001" },
    ...samples.map(sample => ({ sample_type: "Unknown", sample_name: sample.sample_code, sample_id: sample.id })),
    { sample_type: "Quality Control", sample_name: "QC_001" },
  ];
  if (list.length > 96) throw new Error("demo plan: a batch holds one 96-well plate");
  return list.map((row, i) => ({ seq: i + 1, ...row, plate: PLATE, vial: `${"ABCDEFGH"[Math.floor(i / 12)]}${(i % 12) + 1}` }));
}
export const batchRules = code => ({
  rules: { blanksAtStart: 1, pooledQcEvery: 0, blankAfterQc: false, qcAtEnd: true, randomize: false, seed: `demo-${code}` },
  plateLayout: { plate: PLATE, order: "row-major" }, minutesPerInjection: 20,
});

// The sequence CSV exactly as src/lib/batch/csv.ts writes it (formula-safe, RFC 4180, CRLF, no BOM): its SHA-256 is
// what mark_batch_exported records.
function serializeCsv(headers, rows) {
  const escape = value => {
    const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
export const SEQUENCE_COLUMNS = ["seq", "sample_type", "sample_name", "client_id", "aliquot_id", "plate", "vial"];
export const sequenceCsv = injections => serializeCsv(SEQUENCE_COLUMNS, injections.map(row => SEQUENCE_COLUMNS.map(column => row[column])));
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

// ---------------------------------------------------------------- results file

/**
 * The batch's results as SCIEX OS would export them, from the synthetic export (e2e/fixtures/sciex-synthetic.txt):
 * one column per injection, in sequence order, named as the batch names it (sample code, Blank_001, QC_001). Unknown
 * columns cycle through the fixture's Unknown columns, each cycle scaled by 7 % so samples differ; controls cycle
 * through the fixture's own controls. Text cells (N/A, empty) stay as they are.
 * @param {string} fixture
 * @param {{ seq: number, sample_type: string, sample_name: string }[]} injections
 */
export function syntheticResults(fixture, injections) {
  const eol = fixture.includes("\r\n") ? "\r\n" : "\n";
  const lines = fixture.split(/\r?\n/);
  while (lines.length && lines.at(-1) === "") lines.pop();
  const rows = lines.map(line => line.split("\t"));
  const [names, types] = rows;
  if (names?.[0] !== "Sample Name" || types?.[0] !== "Sample Type") throw new Error("demo plan: the fixture has no Sample Name / Sample Type rows");
  const columnsOf = type => types.map((t, i) => (i > 0 && t === type ? i : -1)).filter(i => i > 0);
  const source = { Unknown: columnsOf("Unknown"), Blank: columnsOf("Blank"), "Quality Control": columnsOf("Quality Control") };
  const used = { Unknown: 0, Blank: 0, "Quality Control": 0 };
  const plan = [...injections].sort((a, b) => a.seq - b.seq).map(injection => {
    const pool = source[injection.sample_type];
    if (!pool?.length) throw new Error(`demo plan: the fixture has no ${injection.sample_type} column`);
    const n = used[injection.sample_type]++;
    return { name: injection.sample_name, type: injection.sample_type, column: pool[n % pool.length], scale: injection.sample_type === "Unknown" ? 1 + 0.07 * Math.floor(n / pool.length) : 1 };
  });
  const scaled = (cell, scale) => {
    if (scale === 1 || cell.trim() === "" || !Number.isFinite(Number(cell))) return cell;
    return String(Number((Number(cell) * scale).toFixed(6)));
  };
  const out = [
    ["Sample Name", ...plan.map(item => item.name)],
    ["Sample Type", ...plan.map(item => item.type)],
    ...rows.slice(2).map(row => [row[0], ...plan.map(item => scaled(row[item.column] ?? "", item.scale))]),
  ];
  return out.map(row => row.join("\t")).join(eol) + eol;
}

// ---------------------------------------------------------------- build (as src/lib/release.ts)

/** src/lib/release.ts matchSamples: a SCIEX Unknown name is a registered sample by code, FullName or a name ending in _code. */
export function matchSamples(sciexNames, registry) {
  const metadata = [];
  const unmatched = [];
  for (const name of sciexNames) {
    const entry = registry.find(sample => sample.code === name || sample.full_name === name || name.endsWith(`_${sample.code}`));
    if (!entry) { unmatched.push(name); continue; }
    metadata.push({
      sampleName: name, FullName: entry.full_name, Group1Term: entry.group1_term, Group2Term: entry.group2_term,
      ReplicateTerm: entry.replicate_term, PatientTerm: entry.patient_term, TimePointTerm: entry.time_point_term,
    });
  }
  const matched = metadata.length;
  return { metadata, matched, headerMode: sciexNames.length && matched === sciexNames.length ? "fullName" : "sampleName", unmatched };
}

/** src/lib/release.ts datasetPaths: each file of a build under the order at its own digest. */
export function datasetPaths(clientId, orderCode, digests) {
  const root = `${clientId}/${orderCode}/datasets`;
  return { full: `${root}/${digests.full}/dataset-v1.xlsx`, analysis: `${root}/${digests.analysis}/analysis.xlsx`, companion: `${root}/${digests.companion}/companion.xlsx` };
}

// ---------------------------------------------------------------- deliverable

/** The released order's deliverable: a small synthetic CSV table, visible to the client. */
export function demoDeliverable(order) {
  const classes = [["PC", 14, 0.312], ["PE", 9, 0.184], ["TG", 22, 0.241], ["Cer", 6, 0.047], ["SM", 7, 0.093], ["LPC", 5, 0.061]];
  const text = ["lipid_class,species_detected,median_relative_abundance", ...classes.map(row => row.join(",")),
    `"Synthetic demo table for ${order.title.replace(/"/g, "'")}; not a measurement",,`].join("\r\n") + "\r\n";
  return { title: "Lipid class summary (demo)", kind: "table", fileName: "lipid-class-summary-demo.csv", contentType: "text/csv", text };
}
export const deliverablePath = (clientId, orderCode, digest, fileName) => `${clientId}/${orderCode}/deliverables/${digest}/${fileName}`;

// ---------------------------------------------------------------- release policy

/**
 * null when the two demo signers may sign and release under the current policy (admin.is_release_signer and
 * required_signatures, 0005). Otherwise the temporary policy for the run: the current signers plus the demo two, at 2
 * signatures (an empty list stays empty: any Owner or Admin). The seed puts the recorded policy back afterwards.
 * @param {{ eligible_signers: string[], required_signatures: number } | null} current
 * @param {string[]} demoSigners the user ids of Demo Staff and Demo Approver (an Admin and an Owner)
 */
export function policyChange(current, demoSigners) {
  const eligible = current?.eligible_signers ?? [];
  const required = current?.required_signatures ?? 2;
  const listed = eligible.length === 0 || demoSigners.every(id => eligible.includes(id));
  if (listed && required <= demoSigners.length) return null;
  return { eligible_signers: eligible.length ? [...eligible, ...demoSigners.filter(id => !eligible.includes(id))] : [], required_signatures: 2 };
}

// ---------------------------------------------------------------- reset

/** The name an archived demo client keeps, so that the next run can create the client again (client names are unique). */
export function archivedClientName(name, now = new Date()) {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  return `${name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name} (demo, archived ${stamp})`;
}

// ---------------------------------------------------------------- dry run

/** What the seed would do, in plain lines (no secrets: there are none in the plan). */
export function formatPlan({ reset = false } = {}) {
  const lines = [];
  if (reset) {
    lines.push("demo-seed --reset would, signed in as Demo Staff (and Demo Approver to withdraw a released dataset):");
    lines.push(`  for each live client named ${CLIENTS.map(client => `"${client.name}"`).join(", ")}:`);
    lines.push("    every live order of it titled \"… (demo)\": withdraw its released dataset, retire its deliverables, take its aliquots out of the box,");
    lines.push("    archive its batch, aliquots and the order; archive the client's memberships; rename the client \"… (demo, archived <UTC>)\" and archive it.");
    lines.push("  Nothing is deleted. The demo accounts, the panel and the release policy stay. The next run creates everything again.");
    return lines.join("\n");
  }
  lines.push("demo-seed would create or find (idempotent: a second run adds nothing):");
  lines.push(`  lab staff: ${Object.values(STAFF).map(p => `${p.name} <${p.email}> (${p.role})`).join(", ")}`);
  lines.push(`  panel: "${PANEL.name}" (create_panel when missing)`);
  for (const client of CLIENTS) lines.push(`  client "${client.name}" (${client.kind}) with requester ${client.member.name} <${client.member.email}>`);
  lines.push("  orders:");
  ORDERS.forEach(order => {
    const client = clientOf(order);
    const where = order.wanted ? `${POINTS[order.point].label} (asked: ${order.wanted}; ${order.note})` : POINTS[order.point].label;
    lines.push(`    ${pad(ORDERS.indexOf(order) + 1)}. "${order.title}" for ${client.name}: ${order.samples} ${order.matrix.toLowerCase()} samples → ${where}`);
    lines.push(`        steps: ${stepsFor(order.point).map(step => `${STEPS[step].rpc} (${STEPS[step].who})`).join(" → ")}`);
  });
  const offsets = slotOffsets();
  const stored = ORDERS.filter(order => order.key in offsets);
  lines.push(`  storage: ${stored.reduce((sum, order) => sum + order.samples, 0)} aliquots of ${stored.length} batched orders in "${BOX}", slots ${slotName(0)}…`);
  lines.push("  release policy: unchanged when both demo signers may already sign; otherwise widened for the run and put back.");
  return lines.join("\n");
}
