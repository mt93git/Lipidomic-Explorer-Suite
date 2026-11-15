import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NameDictionaryPage from "@/app/(workspace)/name-dictionary/page";
import { ProposalTable, type ProposalRow } from "@/app/(workspace)/name-dictionary/proposal-table";
import { approveProposals, importList, saveDictionaryEntry } from "@/app/(workspace)/name-dictionary/actions";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => ({ view: "staff" })) }));
vi.mock("@/app/(workspace)/name-dictionary/actions", () => ({ saveDictionaryEntry: vi.fn(), approveProposals: vi.fn(), importList: vi.fn() }));
// Synthetic export names, one per rule of the prototype.
const analytes = ["PC 34:1 +H", "CE 24:4 +NH4", "Cer(d19:1/20:0)+ H", "CER(d18:0/14:0)+H", "GluCer(d18:1-d7/15:0)+H_Sigma.IS", "DG(17:0-16:1)+NH4_d5_..IS", "DAG(20:0_20:4)+NH4 b", "ACar 4:0"];
vi.mock("@/lib/data/results", () => ({ getNameDictionary: vi.fn(async () => ({
  entries: [{ id: "e1", export_name: "PC 34:1 +H", clean_name: "PC(34:1)+H", rule: "spacing" }], analytes,
})) }));

beforeEach(() => {
  vi.mocked(saveDictionaryEntry).mockReset();
  vi.mocked(approveProposals).mockReset();
  vi.mocked(importList).mockReset().mockResolvedValue({});
});

describe("lipid name dictionary page", () => {
  it("renders the heading with Import list and Approve N, the three pills and the proposal table", async () => {
    render(await NameDictionaryPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Lipid name dictionary");
    expect(screen.getByText(/reaches Nexo under one name/)).toBeVisible();
    const actions = screen.getByRole("heading", { level: 1 }).closest(".page-heading")!.querySelector(".heading-actions") as HTMLElement;
    expect(within(actions).getByText("Import list")).toBeVisible();
    expect(within(actions).getByRole("button", { name: "Approve 5" })).toBeEnabled();
    const pills = screen.getByLabelText("Dictionary status");
    expect(pills).toHaveTextContent("1 mapped");
    expect(pills).toHaveTextContent("7 to review");
    expect(pills).toHaveTextContent("3 classes renamed");
    const table = screen.getByRole("table", { name: "Proposed clean names" });
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["In the SCIEX export", "Proposed", "Rule", "Decision"]);
    const row = (name: string) => within(table).getByText(name).closest("tr")!;
    expect(row("CE 24:4 +NH4")).toHaveTextContent("CE(24:4)+NH4spacingApprove");
    expect(row("CER(d18:0/14:0)+H")).toHaveTextContent("Cer(d18:0/14:0)+Hclass spelling");
    expect(row("GluCer(d18:1-d7/15:0)+H_Sigma.IS")).toHaveTextContent("GlcCer(d18:1-d7/15:0)+HISTD · class spelling");
    expect(row("DG(17:0-16:1)+NH4_d5_..IS")).toHaveTextContent("DAG(17:0_16:1)+NH4 d5ISTD · class + separator");
    expect(row("DAG(20:0_20:4)+NH4 b")).toHaveTextContent("DAG(20:0_20:4)+NH4 [isomer b]needs chemistask chemist");
    expect(row("ACar 4:0")).toHaveTextContent("ACar(4:0)spacing · no adduct in nameask chemist");
    expect(within(row("ACar 4:0")).queryByRole("button", { name: /Approve/ })).toBeNull();
  });
  it("keeps the entries and the hand-made mapping one click away", async () => {
    render(await NameDictionaryPage());
    expect(screen.getByRole("table", { name: "Dictionary entries" })).toHaveTextContent("PC(34:1)+H");
    const add = screen.getByRole("region", { name: "Add a name" });
    expect(within(add).getByLabelText("SCIEX export name").closest(".field")).not.toBeNull();
  });
});

const rows: ProposalRow[] = [
  { exportName: "CE 24:4 +NH4", proposed: "CE(24:4)+NH4", rule: "spacing", needsChemist: false },
  { exportName: "CER(d18:0/14:0)+H", proposed: "Cer(d18:0/14:0)+H", rule: "class spelling", needsChemist: false },
  { exportName: "ACar 4:0", proposed: "ACar(4:0)", rule: "spacing · no adduct in name", needsChemist: true },
];
const table = () => render(<ProposalTable proposals={rows} mapped={10} classesRenamed={[{ from: "CER", to: "Cer" }]} hasFile />);

describe("proposal table", () => {
  it("approves one name and removes its row", async () => {
    vi.mocked(approveProposals).mockResolvedValue({ added: 1 });
    const user = userEvent.setup();
    table();
    await user.click(screen.getByRole("button", { name: "Approve CE 24:4 +NH4" }));
    await waitFor(() => expect(approveProposals).toHaveBeenCalledWith(["CE 24:4 +NH4"]));
    expect(await screen.findByRole("status")).toHaveTextContent("CE 24:4 +NH4 approved.");
    expect(screen.queryByText("CE(24:4)+NH4")).toBeNull();
    expect(screen.getByLabelText("Dictionary status")).toHaveTextContent("11 mapped2 to review");
    expect(screen.getByRole("button", { name: "Approve 1" })).toBeEnabled();
  });
  it("approves every rule-settled name at once and leaves the chemist's", async () => {
    vi.mocked(approveProposals).mockResolvedValue({ added: 2 });
    const user = userEvent.setup();
    table();
    await user.click(screen.getByRole("button", { name: "Approve 2" }));
    await waitFor(() => expect(approveProposals).toHaveBeenCalledWith(["CE 24:4 +NH4", "CER(d18:0/14:0)+H"]));
    expect(await screen.findByRole("status")).toHaveTextContent("2 names approved.");
    expect(screen.getByRole("button", { name: "Approve 0" })).toBeDisabled();
    expect(screen.getByText("ACar 4:0")).toBeVisible();
  });
  it("shows an approval error and keeps the rows", async () => {
    vi.mocked(approveProposals).mockResolvedValue({ error: "Some of these names were added meanwhile. Reload the page and approve again." });
    const user = userEvent.setup();
    table();
    await user.click(screen.getByRole("button", { name: "Approve 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("added meanwhile");
    expect(screen.getByText("CE(24:4)+NH4")).toBeVisible();
  });
  it("lets the chemist set a name from the 'ask chemist' pill", async () => {
    vi.mocked(saveDictionaryEntry).mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    table();
    await user.click(screen.getByText("ask chemist"));
    const input = screen.getByLabelText("Clean name set by the chemist");
    expect(input).toHaveValue("ACar(4:0)");
    await user.clear(input); await user.type(input, "ACar(4:0)+H");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(saveDictionaryEntry).toHaveBeenCalledOnce());
    const form = vi.mocked(saveDictionaryEntry).mock.calls[0][1];
    expect([form.get("export_name"), form.get("clean_name")]).toEqual(["ACar 4:0", "ACar(4:0)+H"]);
    await waitFor(() => expect(screen.queryByText("ACar 4:0")).toBeNull());
  });
  it("imports a list as soon as a file is chosen and reports what happened", async () => {
    vi.mocked(importList).mockResolvedValue({ added: 2, existing: 1, skipped: [] });
    const user = userEvent.setup();
    table();
    await user.upload(screen.getByLabelText("Import list"), new File(["export name,clean name\nA,B\n"], "list.csv", { type: "text/csv" }));
    await waitFor(() => expect(importList).toHaveBeenCalledOnce());
    expect((vi.mocked(importList).mock.calls[0][1] as FormData).get("file")).toBeInstanceOf(File);
    expect(await screen.findByRole("status")).toHaveTextContent("2 names imported. 1 already in the dictionary, left as they are.");
  });
  it("asks for a parsed file when there is none, and pages long lists", () => {
    const { unmount } = render(<ProposalTable proposals={[]} mapped={4} classesRenamed={[]} hasFile={false} />);
    expect(screen.getByText(/Parse a results file on Ingest results first/)).toBeVisible();
    unmount();
    const many = Array.from({ length: 120 }, (_, i) => ({ exportName: `CE ${i}:0 +NH4`, proposed: `CE(${i}:0)+NH4`, rule: "spacing", needsChemist: false }));
    render(<ProposalTable proposals={many} mapped={0} classesRenamed={[]} hasFile />);
    expect(screen.getAllByRole("button", { name: /^Approve CE/ })).toHaveLength(50);
    expect(screen.getByText("Showing 1–50 of 120")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve 120" })).toBeEnabled();
  });
});

describe("proposal order", () => {
  it("lists names a rule changed first, then names for a chemist, then names that are already clean", async () => {
    const { getNameDictionary } = await import("@/lib/data/results");
    vi.mocked(getNameDictionary).mockResolvedValueOnce({ entries: [], analytes: ["PC(34:1)+H", "ACar 4:0", "CE 24:4 +NH4"] });
    render(await NameDictionaryPage());
    const names = within(screen.getByRole("table", { name: "Proposed clean names" })).getAllByRole("row").slice(1).map(row => row.firstElementChild!.textContent);
    expect(names).toEqual(["CE 24:4 +NH4", "ACar 4:0", "PC(34:1)+H"]);
  });
});
