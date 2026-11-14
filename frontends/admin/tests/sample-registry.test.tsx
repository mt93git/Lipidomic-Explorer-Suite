import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SampleRegistryGrid } from "@/components/sample-registry-grid";
import { registerSamplesAction } from "@/app/(workspace)/sample-registry/actions";

vi.mock("@/app/(workspace)/sample-registry/actions", () => ({ registerSamplesAction: vi.fn() }));

// Invented example data only.
const order = { id: "ORD042", code: "ORD042", clientId: "example-cedar", clientName: "Example Cedar", description: "Example lipid panel · feasibility", stage: 1, expectedSamples: 12, sampleType: "Synthetic plasma" };
const paste = [
  "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm",
  "Ctrl_1\tControl\tWildType\t1\tP01\t0h", "Ctrl_2\tControl\tWildType\t2\tP02\t0h", "Trt_1\tTreated\tWildType\t1\tP03\t24h", "Trt_2\tTreated\tWildType\t2\tP04\t24h",
].join("\n");
// The prototype's sheet, as a client would send it: renamed headers, a repeated FullName, an empty time point, a typo and an odd genotype.
const clientSheet = [
  "Client ID\tFullName\tGroup 1\tGroup2Term\tReplicate\tPatient\tTime\tMatrix",
  "MF-ctl-1\tCtrl_0h_R1\tControl\tWT\t1\tNA\t0h\tcells",
  "MF-ctl-2\tCtrl_0h_R2\tControl\tWT\t2\tNA\t0h\tcells",
  "MF-ctl-3\tCtrl_0h_R2\tControl\tWT\t3\tNA\t0h\tcells",
  "MF-AC-1\tAC_2h_R1\tApoptotic cells\tWT\t1\tNA\t2h\tcells",
  "MF-AC-2\tAC_2h_R2\tApoptotic cells\tWT\t2\tNA\t\tcells",
  "MF-AC-3\tAC_2h_R3\tApoptotic cel\tKO\t3\tNA\t2h\tcells",
  "MF-AC-4\tAC_6h_R1\tApoptotic cells\tWT\t1\tNA\t6h\tcells",
].join("\n");
const grid = () => screen.getByRole("table", { name: "Samples to register" });
const rows = () => within(grid()).getAllByRole("row").slice(1);
const pills = () => screen.getByLabelText("Paste checks");
const fixList = () => screen.getByRole("region", { name: "Fix before saving" });
function pasteRows(text = paste) {
  fireEvent.change(screen.getByLabelText("Paste from Excel"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Add rows" }));
}
const renderGrid = (props: Partial<Parameters<typeof SampleRegistryGrid>[0]> = {}) => render(<SampleRegistryGrid order={order} shipmentId="ship-1" existingNames={[]} {...props} />);

beforeEach(() => vi.mocked(registerSamplesAction).mockResolvedValue({}));

describe("sample registry grid", () => {
  it("fills the grid from a paste with a header row and offers to save that many valid rows", () => {
    renderGrid();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Register samples · ORD042");
    expect(screen.getByRole("button", { name: "Save 0 valid rows" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Map columns" })).toBeDisabled();
    pasteRows();
    expect(rows()).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent("Added 4 rows from the paste · header row recognised");
    expect(screen.getByText(/Columns matched automatically by name\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Row 3 FullName")).toHaveValue("Trt_1");
    expect(screen.getByLabelText("Row 3 TimePointTerm")).toHaveValue("24h");
    expect(screen.getByLabelText("Paste from Excel")).toHaveValue("");
    expect(pills()).toHaveTextContent("4 valid0 errors0 warnings");
    expect(within(fixList()).getByText("Nothing to fix. Every row passes the checks.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save 4 valid rows" })).toBeEnabled();
  });

  it("matches renamed headers automatically, says so in the heading and shows the prototype's columns with predicted codes", () => {
    renderGrid({ nextSampleNumber: 4 });
    pasteRows(clientSheet);
    const heading = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
    expect(heading).toHaveTextContent("Pasted from the client's Excel. Columns matched automatically: \"Client ID\" → Client sample ID, \"Group 1\" → Group1Term, \"Replicate\" → ReplicateTerm, \"Patient\" → PatientTerm, \"Time\" → TimePointTerm.");
    expect(within(grid()).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Sample ID", "Client ID", "FullName", "Group1Term", "Group2Term", "Replicate", "Patient", "TimePoint", "Matrix", "Volume µL", "Remove"]);
    expect(within(rows()[0]).getByRole("rowheader")).toHaveTextContent("ORD042-S004");
    expect(screen.getByLabelText("Row 6 Group1Term")).toHaveValue("Apoptotic cel");
  });

  it("overrides a match with Map columns and re-reads the pasted rows", async () => {
    const user = userEvent.setup();
    renderGrid();
    pasteRows("FullName\tTreatment group\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm\nA_1\tControl\tWT\t1\tNA\tNA\nA_2\tControl\tWT\t2\tNA\tNA\nB_1\tTreated\tWT\t1\tNA\tNA\nB_2\tTreated\tWT\t2\tNA\tNA");
    expect(screen.getByText(/Not used: "Treatment group"\./)).toBeInTheDocument();
    expect(within(fixList()).getByText(/Group1Term column is missing/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save 4 valid rows" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Map columns" }));
    const map = screen.getByRole("region", { name: "Map columns" });
    await user.selectOptions(within(map).getByLabelText("Column for Treatment group"), "group1_term");
    expect(screen.getByLabelText("Row 3 Group1Term")).toHaveValue("Treated");
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveTextContent("Columns as mapped: \"Treatment group\" → Group1Term.");
    expect(screen.getByRole("button", { name: "Save 4 valid rows" })).toBeEnabled();
    // A column takes one pasted column: giving FullName to "Treatment group" frees the first one.
    await user.selectOptions(within(map).getByLabelText("Column for Treatment group"), "full_name");
    expect(within(map).getByLabelText("Column for FullName")).toHaveValue("");
    expect(screen.getByLabelText("Row 1 FullName")).toHaveValue("Control");
  });

  it("marks errors red, counts them, lists them by row and blocks saving until they are fixed", async () => {
    const user = userEvent.setup();
    renderGrid();
    pasteRows(clientSheet);
    const duplicate = screen.getByLabelText("Row 3 FullName");
    expect(duplicate).toHaveAttribute("aria-invalid", "true");
    expect(duplicate.closest("td")).toHaveClass("cell", "invalid");
    expect(duplicate).toHaveAccessibleDescription("FullName Ctrl_0h_R2 is already used. Nexo matches samples by FullName.");
    const time = screen.getByLabelText("Row 5 TimePointTerm");
    expect(time.closest("td")).toHaveClass("invalid");
    expect(time).toHaveAttribute("placeholder", "—");
    expect(pills()).toHaveTextContent("5 valid2 errors1 warning");
    expect(screen.getByRole("status")).toHaveTextContent("Added 7 rows from the paste · header row recognised · 2 errors, 1 warning.");
    const items = within(fixList()).getAllByRole("listitem");
    expect(items.map(item => item.textContent)).toEqual([
      "error Row 3: FullName Ctrl_0h_R2 is already used. Nexo matches samples by FullName.",
      "error Row 5: TimePointTerm is empty in a time-course design. Write NA only if there is none.",
      "warning Row 6: \"Apoptotic cel\" looks like \"Apoptotic cells\"; Group2Term \"KO\" appears once.Fix bothGroup1Term → Apoptotic cells · Group2Term → WT",
    ]);
    expect(screen.getByRole("button", { name: "Save 5 valid rows" })).toBeDisabled();
    await user.clear(duplicate);
    await user.type(duplicate, "Ctrl_0h_R3");
    await user.type(time, "NA");
    expect(duplicate).not.toHaveAttribute("aria-invalid");
    expect(pills()).toHaveTextContent("7 valid0 errors1 warning");
    // Warnings do not block saving.
    expect(screen.getByRole("button", { name: "Save 7 valid rows" })).toBeEnabled();
  });

  it("marks warnings amber and 'Fix both' applies the two unambiguous suggestions", async () => {
    const user = userEvent.setup();
    renderGrid();
    pasteRows(clientSheet);
    expect(screen.getByLabelText("Row 6 Group1Term").closest("td")).toHaveClass("cell", "warning");
    expect(screen.getByLabelText("Row 6 Group2Term").closest("td")).toHaveClass("warning");
    expect(screen.getByLabelText("Row 6 Group1Term")).not.toHaveAttribute("aria-invalid");
    await user.click(within(fixList()).getByRole("button", { name: "Fix both" }));
    expect(screen.getByLabelText("Row 6 Group1Term")).toHaveValue("Apoptotic cells");
    expect(screen.getByLabelText("Row 6 Group2Term")).toHaveValue("WT");
    expect(screen.getByLabelText("Row 6 Group1Term").closest("td")).not.toHaveClass("warning");
    expect(pills()).toHaveTextContent("0 warnings");
  });

  it("checks client IDs against a pasted manifest, and says the check is skipped without one", async () => {
    const user = userEvent.setup();
    renderGrid();
    pasteRows(paste.replace("TimePointTerm", "TimePointTerm\tClient ID").split("\n").map((line, index) => index ? `${line}\tTUBE-0${index}` : line).join("\n"));
    const checks = screen.getByRole("region", { name: "Checks Admin runs on every paste" });
    expect(checks).toHaveTextContent("no manifest pasted, skipped");
    await user.click(within(checks).getByText("Add the client's manifest"));
    fireEvent.change(within(checks).getByLabelText("Client manifest"), { target: { value: "TUBE-01\nTUBE-02\nTUBE-03\nTUB-04" } });
    expect(checks).toHaveTextContent("4 IDs in the manifest");
    expect(screen.getByLabelText("Row 4 Client sample ID")).toHaveAccessibleDescription("Client ID TUBE-04 is not in the client's manifest.");
    expect(pills()).toHaveTextContent("3 valid1 error");
  });

  it("tells a narrow screen how many columns follow the pinned Sample ID", () => {
    renderGrid();
    pasteRows();
    expect(screen.getByText(/9 more columns · Sample ID stays pinned/)).toBeInTheDocument();
  });

  it("adds an empty row by hand, removes a row, and renumbers", () => {
    renderGrid();
    pasteRows();
    fireEvent.click(screen.getByRole("button", { name: "Add empty row" }));
    expect(rows()).toHaveLength(5);
    expect(screen.getByLabelText("Row 5 FullName")).toHaveValue("");
    expect(screen.getByLabelText("Row 5 FullName")).toHaveAccessibleDescription("FullName is empty. Every sample needs one.");
    fireEvent.click(screen.getByRole("button", { name: "Remove row 1" }));
    expect(rows()).toHaveLength(4);
    expect(screen.getByLabelText("Row 1 FullName")).toHaveValue("Ctrl_2");
    fireEvent.click(screen.getByRole("button", { name: "Remove row 4" }));
    expect(screen.getByRole("button", { name: "Save 3 valid rows" })).toBeEnabled();
  });

  it("submits the contract payload: the order, its shipment and the valid samples as the database expects them", async () => {
    renderGrid();
    pasteRows("Ctrl_1\tControl\tWildType\t1\tP01\t0h\t\tPlasma\t12,5\nTrt_1\tTreated\tWildType\t1\tP02\tNA");
    fireEvent.click(screen.getByRole("button", { name: "Save 2 valid rows" }));
    await waitFor(() => expect(registerSamplesAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(registerSamplesAction).mock.calls[0][1]).toEqual({
      orderId: "ORD042", orderCode: "ORD042", shipmentId: "ship-1",
      samples: [
        { full_name: "Ctrl_1", group1_term: "Control", group2_term: "WildType", replicate_term: "1", patient_term: "P01", time_point_term: "0h", client_sample_id: null, matrix: "Plasma", volume_ul: 12.5 },
        { full_name: "Trt_1", group1_term: "Treated", group2_term: "WildType", replicate_term: "1", patient_term: "P02", time_point_term: "NA", client_sample_id: null, matrix: null, volume_ul: null },
      ],
    });
  });

  it("shows the database's refusal and keeps the rows so they can be corrected", async () => {
    vi.mocked(registerSamplesAction).mockResolvedValue({ error: "A sample named Ctrl_1 is already registered in ORD042." });
    renderGrid();
    pasteRows();
    fireEvent.click(screen.getByRole("button", { name: "Save 4 valid rows" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A sample named Ctrl_1 is already registered in ORD042.");
    expect(rows()).toHaveLength(4);
  });
});
