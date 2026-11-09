import { describe, expect, it } from "vitest";
import {
  analysisObjectPath, datasetPaths, defaultPolicy, isEligibleSigner, matchSamples, nexoDatasetLink, ownSamplesProblem,
  policyProblem, releaseProgress, type LabPerson,
} from "@/lib/release";

const owner: LabPerson = { userId: "u-owner", name: "Owner", role: "owner" };
const admin: LabPerson = { userId: "u-admin", name: "Admin", role: "admin" };
const operator: LabPerson = { userId: "u-op", name: "Operator", role: "operator" };
const member: LabPerson = { userId: "u-member", name: "Member", role: "member" };
const staff = [owner, admin, operator, member];
const listed = { ...defaultPolicy, eligibleSigners: [admin.userId, operator.userId], requiredSignatures: 2 };

describe("who may sign (mirrors admin.is_release_signer)", () => {
  it("with no list, any lab owner or admin; never an operator, a lab member or nobody", () => {
    expect(isEligibleSigner(defaultPolicy, owner)).toBe(true);
    expect(isEligibleSigner(defaultPolicy, admin)).toBe(true);
    expect(isEligibleSigner(defaultPolicy, operator)).toBe(false);
    expect(isEligibleSigner(defaultPolicy, member)).toBe(false);
    expect(isEligibleSigner(defaultPolicy, null)).toBe(false);
  });
  it("with a list, only the people on it who are still lab staff", () => {
    expect(isEligibleSigner(listed, operator)).toBe(true);
    expect(isEligibleSigner(listed, admin)).toBe(true);
    expect(isEligibleSigner(listed, owner)).toBe(false);
    expect(isEligibleSigner({ ...listed, eligibleSigners: [member.userId, admin.userId] }, member)).toBe(false);
  });
});

describe("release progress (mirrors admin.release_dataset's count)", () => {
  it("counts distinct eligible signers against the required number", () => {
    expect(releaseProgress(defaultPolicy, [], staff)).toEqual({ counted: 0, required: 2, missing: 2, met: false });
    expect(releaseProgress(defaultPolicy, [{ userId: owner.userId }], staff)).toEqual({ counted: 1, required: 2, missing: 1, met: false });
    expect(releaseProgress(defaultPolicy, [{ userId: owner.userId }, { userId: admin.userId }], staff)).toEqual({ counted: 2, required: 2, missing: 0, met: true });
  });
  it("ignores a signer who is not eligible any more, has left the lab, or signed twice", () => {
    const three = { ...listed, eligibleSigners: [owner.userId, admin.userId, operator.userId], requiredSignatures: 3 };
    const signatures = [{ userId: operator.userId }, { userId: owner.userId }, { userId: "u-gone" }, { userId: owner.userId }];
    expect(releaseProgress(three, signatures, staff)).toMatchObject({ counted: 2, required: 3, met: false });
    expect(releaseProgress(three, signatures, [owner, admin])).toMatchObject({ counted: 1, met: false }); // the operator left the lab
    expect(releaseProgress(three, [...signatures, { userId: admin.userId }], staff)).toMatchObject({ counted: 3, met: true });
  });
});

describe("policy checks (mirrors admin.set_release_policy)", () => {
  it("needs at least two signatures, lab staff only, and enough listed people", () => {
    expect(policyProblem([], 1, staff)).toMatch(/at least 2/);
    expect(policyProblem([admin.userId, member.userId], 2, staff)).toMatch(/lab staff/);
    expect(policyProblem([admin.userId, "u-unknown"], 2, staff)).toMatch(/lab staff/);
    expect(policyProblem([admin.userId], 2, staff)).toMatch(/fewer eligible signers/i);
    expect(policyProblem([], 2, staff)).toBeNull();
    expect(policyProblem([admin.userId, operator.userId, owner.userId], 3, staff)).toBeNull();
  });
});

describe("where the files live", () => {
  const sha = "f".repeat(64);
  it("keeps each file of a build under the order at its own digest", () => {
    const [a, c] = ["a".repeat(64), "c".repeat(64)];
    expect(datasetPaths("client-uuid", "ORD048", { full: sha, analysis: a, companion: c })).toEqual({
      full: `client-uuid/ORD048/datasets/${sha}/dataset-v1.xlsx`,
      analysis: `client-uuid/ORD048/datasets/${a}/analysis.xlsx`,
      companion: `client-uuid/ORD048/datasets/${c}/companion.xlsx`,
    });
  });
  it("names the analysis object in Team's bucket <project_id>/<sha256>", () => {
    expect(analysisObjectPath("11111111-1111-4111-8111-111111111111", sha)).toBe(`11111111-1111-4111-8111-111111111111/${sha}`);
  });
  it("links Open in Nexo to <NEXT_PUBLIC_NEXO_URL>/?dataset=<id> only for lab staff, on a released, current dataset", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const current = { id, status: "released" as const, archivedAt: null };
    expect(nexoDatasetLink("https://lab.example/nexo/", current, true)).toBe(`https://lab.example/nexo/?dataset=${id}`);
    expect(nexoDatasetLink(" https://lab.example/nexo ", current, true)).toBe(`https://lab.example/nexo/?dataset=${id}`);
    expect(nexoDatasetLink("https://lab.example/nexo", { id: "a b&c", status: "released" }, true)).toBe("https://lab.example/nexo/?dataset=a%20b%26c");
    // Not allowed (mayOpenInNexo is false: a client user while NEXT_PUBLIC_NEXO_CLIENT_ACCESS is off): no link.
    expect(nexoDatasetLink("https://lab.example/nexo", current, false)).toBeNull();
    // Not released, or retired: built, withdrawn, superseded; a released row that is archived is not current either.
    for (const status of ["built", "withdrawn", "superseded"] as const) expect(nexoDatasetLink("https://lab.example/nexo", { ...current, status }, true), status).toBeNull();
    expect(nexoDatasetLink("https://lab.example/nexo", { ...current, archivedAt: "2026-11-08T12:00:00Z" }, true)).toBeNull();
    // No dataset, or no setting.
    expect(nexoDatasetLink("https://lab.example/nexo", null, true)).toBeNull();
    expect(nexoDatasetLink("  ", current, true)).toBeNull();
    expect(nexoDatasetLink(undefined, current, true)).toBeNull();
  });
});

describe("matching SCIEX sample names to the registry", () => {
  const registry = [
    { code: "ORD048-S001", full_name: "Ctrl_1", group1_term: "Control", group2_term: null, replicate_term: "1", patient_term: "P01", time_point_term: "0h" },
    { code: "ORD048-S002", full_name: "Trt_1", group1_term: "Treated", group2_term: "WT", replicate_term: "1", patient_term: null, time_point_term: null },
  ];
  it("matches by injection name suffix, by sample code or by FullName and maps the six metadata columns", () => {
    const result = matchSamples(["B2026-031_017_ORD048-S001", "ORD048-S002"], registry);
    expect(result).toMatchObject({ matched: 2, headerMode: "fullName" });
    expect(result.metadata).toEqual([
      { sampleName: "B2026-031_017_ORD048-S001", FullName: "Ctrl_1", Group1Term: "Control", Group2Term: null, ReplicateTerm: "1", PatientTerm: "P01", TimePointTerm: "0h" },
      { sampleName: "ORD048-S002", FullName: "Trt_1", Group1Term: "Treated", Group2Term: "WT", ReplicateTerm: "1", PatientTerm: null, TimePointTerm: null },
    ]);
    expect(matchSamples(["Trt_1"], registry)).toMatchObject({ matched: 1, headerMode: "fullName" });
  });
  it("keeps SCIEX names as headers when any sample is unmatched, or the registry is empty", () => {
    const partial = matchSamples(["ORD048-S001", "S9"], registry);
    expect(partial).toMatchObject({ matched: 1, headerMode: "sampleName" });
    expect(partial.metadata.map(m => m.sampleName)).toEqual(["ORD048-S001"]);
    expect(matchSamples(["S1", "S2"], [])).toEqual({ matched: 0, headerMode: "sampleName", metadata: [], unmatched: ["S1", "S2"] });
  });
  it("refuses a build whose Unknown injections are not all registered samples of the order (a shared batch, finding 4)", () => {
    const shared = matchSamples(["B2026-031_001_ORD048-S001", "B2026-031_002_ORD049-S001", "B2026-031_003_ORD048-S002"], registry);
    expect(shared.unmatched).toEqual(["B2026-031_002_ORD049-S001"]);
    expect(ownSamplesProblem("ORD048", shared)).toMatch(/^1 Unknown injection is not a registered sample of ORD048: B2026-031_002_ORD049-S001\. /);
    // A code is matched only as the whole suffix after "_": ORD1048-S001 is not ORD048-S001.
    expect(matchSamples(["B_ORD1048-S001", "ORD048-S0011"], registry).unmatched).toEqual(["B_ORD1048-S001", "ORD048-S0011"]);
    const many = matchSamples(Array.from({ length: 7 }, (_, i) => `X${i}`), registry);
    expect(ownSamplesProblem("ORD048", many)).toMatch(/^7 Unknown injections are not registered samples of ORD048: X0, X1, X2, X3, X4 and 2 more\./);
    expect(ownSamplesProblem("ORD048", matchSamples(["ORD048-S001", "Trt_1"], registry))).toBeNull();
  });
});
