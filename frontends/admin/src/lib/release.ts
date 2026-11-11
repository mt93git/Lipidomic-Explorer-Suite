// Release logic shared by the screens, the server actions and both sides of the data seam.
// Pure: no React, no server imports. The database rules it mirrors are db/admin/migrations/0005..0007.
import type { SampleMetadata } from "@lipidomic/admin-ingest";
import type { View } from "./models";

// admin.signature.role
export type SignerRole = "prepared" | "reviewed" | "approved";
export const signerRoles: readonly SignerRole[] = ["prepared", "reviewed", "approved"];
export const signerRoleLabels: Record<SignerRole, string> = { prepared: "Prepared", reviewed: "Reviewed", approved: "Approved" };

// admin.dataset.status
export type DatasetStatus = "built" | "released" | "superseded" | "withdrawn";
export const datasetStatusLabels: Record<DatasetStatus, string> = { built: "Built", released: "Released", superseded: "Superseded", withdrawn: "Withdrawn" };

// admin.lab_staff.role; owner, admin and operator are lab staff, a member is not.
export type LabRole = "owner" | "admin" | "operator" | "member";
export const labRoleLabels: Record<LabRole, string> = { owner: "Owner", admin: "Admin", operator: "Operator", member: "Member" };
export type LabPerson = { userId: string; name: string; role: LabRole };
const staffRoles: readonly LabRole[] = ["owner", "admin", "operator"];
export const isLabStaff = (person: LabPerson | null | undefined): person is LabPerson => !!person && staffRoles.includes(person.role);

// admin.release_policy: the current row, or the default when the lab never set one.
export type ReleasePolicy = { eligibleSigners: string[]; requiredSignatures: number; setBy: string | null; setAt: string | null };
export const defaultPolicy: ReleasePolicy = { eligibleSigners: [], requiredSignatures: 2, setBy: null, setAt: null };

// admin.is_release_signer: no list = any lab owner or admin; a list = the people on it who are still lab staff.
export function isEligibleSigner(policy: Pick<ReleasePolicy, "eligibleSigners">, person: LabPerson | null | undefined): boolean {
  if (!person) return false;
  if (!policy.eligibleSigners.length) return person.role === "owner" || person.role === "admin";
  return policy.eligibleSigners.includes(person.userId) && isLabStaff(person);
}

export type SignatureLike = { userId: string };
export type ReleaseProgress = { counted: number; required: number; missing: number; met: boolean };

// admin.release_dataset counts distinct live signers eligible under the current policy. A signer who left the
// lab is not in `people` any more and does not count; the signature stays as evidence.
export function releaseProgress(policy: ReleasePolicy, signatures: SignatureLike[], people: LabPerson[]): ReleaseProgress {
  const counted = new Set(signatures.filter(signature => isEligibleSigner(policy, people.find(person => person.userId === signature.userId))).map(s => s.userId)).size;
  const required = policy.requiredSignatures;
  return { counted, required, missing: Math.max(0, required - counted), met: counted >= required };
}

// The one thing a person can do on a dataset version, for the page's "Your turn" card: sign, release, or nothing
// with the reason. Built from the same rules the server actions enforce; the actions stay the authority.
export type PersonTurn = { action: "sign" | "release"; reason: string } | { action: "none"; reason: string };
export function personTurn({ status, policy, signatures, people, person }:
  { status: DatasetStatus; policy: ReleasePolicy; signatures: SignatureLike[]; people: LabPerson[]; person: LabPerson | null | undefined }): PersonTurn {
  if (status === "released") return { action: "none", reason: "Released. Nothing left to sign; use Withdraw only if this version must be pulled." };
  if (status === "superseded") return { action: "none", reason: "Superseded by a newer version. Nothing left to sign or release." };
  if (status === "withdrawn") return { action: "none", reason: "Withdrawn. Nothing left to sign or release." };
  const progress = releaseProgress(policy, signatures, people);
  if (!isEligibleSigner(policy, person)) return { action: "none", reason: progress.met ? "Only an eligible signer may release." : "You are not an eligible signer under the current policy." };
  if (progress.met) return { action: "release", reason: `The policy count is met (${progress.counted} of ${progress.required}).` };
  if (signatures.some(signature => signature.userId === person?.userId)) {
    const waiting = progress.missing === 1 ? (progress.required === 2 ? "a second signer" : "one more signer") : `${progress.missing} more signers`;
    return { action: "none", reason: `You already signed. Waiting for ${waiting}.` };
  }
  return { action: "sign", reason: "You are eligible under the current policy. Signing freezes the three digests of the manifest." };
}

// admin.set_release_policy's checks, worded for the Owner; null when the policy can be saved.
export function policyProblem(eligible: string[], required: number, staff: LabPerson[]): string | null {
  if (!Number.isInteger(required) || required < 2) return "A release needs at least 2 signatures.";
  const outsiders = eligible.filter(id => !isLabStaff(staff.find(person => person.userId === id)));
  if (outsiders.length) return "Eligible signers must be lab staff (Owner, Admin or Operator).";
  if (eligible.length && eligible.length < required) return `Fewer eligible signers (${eligible.length}) than required signatures (${required}). Add people or lower the count.`;
  return null;
}

// ---------------------------------------------------------------- where the files live

// Admin's bucket admin-files: each file of a build sits under the order at its own digest,
// <client_id>/<order_code>/datasets/<sha256>/<name>.xlsx, so a path never names other bytes than the manifest's.
// admin.build_dataset checks the combined workbook's path (0008); the other two follow from the recorded digests.
export type DatasetDigests = { full: string; analysis: string; companion: string };
export function datasetPaths(clientId: string, orderCode: string, digests: DatasetDigests) {
  const root = `${clientId}/${orderCode}/datasets`;
  return { full: `${root}/${digests.full}/dataset-v1.xlsx`, analysis: `${root}/${digests.analysis}/analysis.xlsx`, companion: `${root}/${digests.companion}/companion.xlsx` };
}


// Who sees Open in Nexo (docs/integration/admin-identity.md): lab staff always; client members only when
// NEXT_PUBLIC_NEXO_CLIENT_ACCESS=1. It stays unset in production until Nexo's own store (checkpoints, project library)
// is scoped per client; Nexo then checks the signed-in user against admin.nexo_dataset_for_caller (0010).
export function mayOpenInNexo(view: View, clientAccess: string | undefined = process.env.NEXT_PUBLIC_NEXO_CLIENT_ACCESS): boolean {
  return view === "staff" || clientAccess?.trim() === "1";
}

// Open in Nexo (docs/integration/admin-nexo-open.md): <NEXT_PUBLIC_NEXO_URL>/?dataset=<admin.dataset.id>. Nexo reads
// the dataset itself through admin.nexo_dataset (0009), which answers only for a released, unarchived dataset. Shown
// only to whom mayOpenInNexo allows, and only on that same kind of dataset: built, withdrawn and superseded versions
// get no link.
export type NexoTarget = { id: string; status: DatasetStatus; archivedAt?: string | null };
export function nexoDatasetLink(base: string | undefined, dataset: NexoTarget | null | undefined, allowed: boolean): string | null {
  const root = (base ?? "").trim().replace(/\/+$/, "");
  if (!root || !allowed || !dataset || dataset.status !== "released" || dataset.archivedAt) return null;
  return `${root}/?dataset=${encodeURIComponent(dataset.id)}`;
}

// ---------------------------------------------------------------- SCIEX sample names → the registry

export type RegistryEntry = { code: string; full_name: string; group1_term: string | null; group2_term: string | null; replicate_term: string | null; patient_term: string | null; time_point_term: string | null };
export type HeaderMode = "fullName" | "sampleName";
export type SampleMatch = { metadata: SampleMetadata[]; matched: number; headerMode: HeaderMode; unmatched: string[] };

// A SCIEX Unknown injection is a registered sample when its name is the sample code, the FullName, or an
// injection name ending in the sample code (B2026-031_017_ORD041-S037). Abundance headers become FullNames
// only when every sample matched; otherwise the SCIEX names stay and the matched metadata is still written.
// `unmatched` lists the injections that are not a sample of the registry given (see ownSamplesProblem).
export function matchSamples(sciexNames: string[], registry: RegistryEntry[]): SampleMatch {
  const metadata: SampleMetadata[] = [];
  const unmatched: string[] = [];
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

// The analysis file goes to the order's client: every Unknown injection of the accepted TXT must be a registered
// sample of that order (a shared batch carries other clients' samples; blanks and QC are not Unknown and stay in
// QC_Injections). Null when the build may go ahead; otherwise the refusal, naming the first few injections.
export function ownSamplesProblem(orderCode: string, match: Pick<SampleMatch, "unmatched">): string | null {
  const { unmatched } = match;
  if (!unmatched.length) return null;
  const shown = unmatched.slice(0, 5).join(", ") + (unmatched.length > 5 ? ` and ${unmatched.length - 5} more` : "");
  const what = unmatched.length === 1 ? "1 Unknown injection is not a registered sample" : `${unmatched.length} Unknown injections are not registered samples`;
  return `${what} of ${orderCode}: ${shown}. Only this order's samples may reach its files; nothing was built. Register them, or export a results file holding only this order's samples.`;
}

export function describeHeaders(headerMode: HeaderMode, matched: number, total: number): string {
  return headerMode === "fullName"
    ? `FullName from the registry (${matched} of ${total} samples matched)`
    : `SCIEX sample names (${matched} of ${total} samples matched to the registry)`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
