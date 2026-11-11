// The dataset version page puts the action first: a status strip under the title, then a "Your turn" card holding
// the one action the person has. Synthetic data; live-mode views (the signed-in person acts, no demo actors).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DatasetPage from "@/app/(workspace)/release/[id]/page";
import { getDataset, type DatasetRecord, type ReleaseView } from "@/lib/data/release";
import { defaultPolicy, type LabPerson } from "@/lib/release";
import { demoSession } from "@/lib/demo";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => demoSession) }));
vi.mock("@/lib/data/release", () => ({ getDataset: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/app/(workspace)/release/actions", () => ({ signDatasetAction: vi.fn(), releaseDatasetAction: vi.fn(), withdrawDatasetAction: vi.fn(), supersedeDatasetAction: vi.fn() }));

const ana: LabPerson = { userId: "u-ana", name: "Example Ana", role: "admin" };
const ben: LabPerson = { userId: "u-ben", name: "Example Ben", role: "owner" };
const op: LabPerson = { userId: "u-op", name: "Example Operator", role: "operator" };
const file = (label: string, sha: string) => ({ label, sheets: ["Sheet"], sha256: sha.repeat(64), sizeBytes: 2048, path: null });
const signature = (person: LabPerson) => ({ id: `s-${person.userId}`, userId: person.userId, name: person.name, role: "reviewed" as const, note: null, signedAt: "2026-11-09T17:00:00Z" });
const dataset = (over: Partial<DatasetRecord> = {}): DatasetRecord => ({
  id: "d-1", orderId: "o-1", orderCode: "ORD900", orderTitle: "Synthetic pilot", clientId: "c-1", clientName: "Example Client",
  version: 1, status: "built", builtAt: "2026-11-09T16:57:00Z", builtBy: "Example Operator", releasedAt: null, projectId: null, projectName: null,
  full: file("Dataset v1 workbook", "a"), analysis: file("Analysis file", "b"), companion: file("Companion file", "c"),
  provenance: { sourceSha256: "d".repeat(64), sciexOsVersion: null, processingMethod: null, acceptedAt: null, headers: null },
  signatures: [], exclusions: [], archivedAt: null, archivedReason: null, ...over,
});
const show = async (me: LabPerson, over: Partial<DatasetRecord> = {}) => {
  const view: ReleaseView = { dataset: dataset(over), policy: { ...defaultPolicy, requiredSignatures: 2 }, people: [ana, ben, op], me, versions: [], demoActors: null };
  vi.mocked(getDataset).mockResolvedValue(view);
  document.body.innerHTML = "";
  render(await DatasetPage({ params: Promise.resolve({ id: "d-1" }), searchParams: Promise.resolve({}) }));
};
const steps = () => within(screen.getByRole("list", { name: "Release progress" })).getAllByRole("listitem");
const turn = () => screen.getByRole("region", { name: /^Your turn/ });

describe("dataset version page: the action first", () => {
  it("built with 1 of 2: the strip is at signatures and the card holds Sign, above the manifest", async () => {
    await show(ben, { signatures: [signature(ana)] });
    expect(steps().map(step => step.querySelector("strong")?.textContent)).toEqual(["Built", "Signatures 1 of 2", "Release"]);
    expect(steps()[1]).toHaveAttribute("aria-current", "step");
    expect(steps()[1]).toHaveTextContent("Example Ana signed");
    expect(within(turn()).getByRole("heading", { name: "Sign this version" })).toBeVisible();
    expect(within(turn()).getByRole("button", { name: "Sign" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Sign" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Release dataset" })).not.toBeInTheDocument();
    const manifest = screen.getByRole("region", { name: "Files of this version" });
    expect(turn().compareDocumentPosition(manifest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("someone who already signed is told why there is nothing to do", async () => {
    await show(ana, { signatures: [signature(ana)] });
    expect(within(turn()).getByRole("heading", { name: "Nothing to do now" })).toBeVisible();
    expect(turn()).toHaveTextContent("You already signed. Waiting for a second signer.");
    expect(screen.queryByRole("button", { name: "Sign" })).not.toBeInTheDocument();
  });
  it("a person outside the policy gets the reason, not a form", async () => {
    await show(op);
    expect(turn()).toHaveTextContent("You are not an eligible signer under the current policy.");
    expect(within(turn()).queryByRole("button")).not.toBeInTheDocument();
  });
  it("count met: the strip is at Release and the card holds Release dataset", async () => {
    await show(ana, { signatures: [signature(ana), signature(ben)] });
    expect(steps()[1]).toHaveTextContent("Signatures 2 of 2");
    expect(steps()[2]).toHaveAttribute("aria-current", "step");
    expect(within(turn()).getByRole("heading", { name: "Release this version" })).toBeVisible();
    expect(within(turn()).getByRole("button", { name: "Release dataset" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Release dataset" })).toHaveLength(1);
  });
  it("released: the strip reads Released, Withdraw; Withdraw stays in its own panel", async () => {
    await show(ana, { status: "released", releasedAt: "2026-11-09T18:00:00Z", projectId: "p-1", projectName: "ORD900 Synthetic pilot", signatures: [signature(ana), signature(ben)] });
    expect(steps().map(step => step.querySelector("strong")?.textContent)).toEqual(["Released", "Withdraw"]);
    expect(turn()).toHaveTextContent("Nothing left to sign");
    expect(within(screen.getByRole("region", { name: "Withdraw" })).getByRole("button", { name: "Withdraw" })).toBeVisible();
  });
  it("shows every digest of the manifest short with a copy button, the source TXT too", async () => {
    await show(ana);
    const manifest = screen.getByRole("region", { name: "Files of this version" });
    expect(within(manifest).getAllByRole("button", { name: /^Copy SHA-256 of / })).toHaveLength(4);
    expect(within(manifest).getByRole("button", { name: "Copy SHA-256 of Source TXT" })).toBeVisible();
  });
  it("lists the QC review's exclusions in force at the build as recorded decisions (code, reason, who, when)", async () => {
    await show(ana, { exclusions: [{ sampleCode: "ORD900-S002", reason: "haemolysed tube", decidedBy: "Example Operator", decidedAt: "2026-11-09T15:00:00Z" }] });
    const manifest = screen.getByRole("region", { name: "Files of this version" });
    const list = within(manifest).getByRole("list", { name: "Sample exclusions" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list).toHaveTextContent(/ORD900-S002 · haemolysed tube\s*Example Operator · /);
    expect(manifest).toHaveTextContent("They are not applied to the files: every sample's data is in this version.");
    await show(ana);
    expect(within(screen.getByRole("region", { name: "Files of this version" })).getByText("None recorded when this version was built.")).toBeInTheDocument();
  });
});
