import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SampleRegistryGrid } from "@/components/sample-registry-grid";
import { registerSamplesAction } from "@/app/(workspace)/sample-registry/actions";

vi.mock("@/app/(workspace)/sample-registry/actions", () => ({ registerSamplesAction: vi.fn() }));

const order = { id: "ORD042", code: "ORD042", clientId: "example-cedar", clientName: "Example Cedar", description: "Example lipid panel · feasibility", stage: 1, expectedSamples: 12, sampleType: "Synthetic plasma" };
const paste = "FullName\tGroup1Term\tGroup2Term\tReplicateTerm\tPatientTerm\tTimePointTerm\nCtrl_1\tControl\tWildType\t1\tP01\t0h\nCtrl_2\tControl\tWildType\t2\tP02\t0h\nTrt_1\tTreated\tWildType\t1\tP03\t24h";
const grid = () => screen.getByRole("table", { name: "Samples to register" });
const rows = () => within(grid()).getAllByRole("row").slice(1);
function pasteRows(text = paste) {
  fireEvent.change(screen.getByLabelText("Paste from Excel"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Add rows" }));
}

beforeEach(() => vi.mocked(registerSamplesAction).mockResolvedValue({}));

describe("sample registry grid", () => {
  it("fills the grid from a tab-separated paste with a header row and offers to register that many samples", () => {
    render(<SampleRegistryGrid order={order} shipmentId="ship-1" existingNames={[]} />);
    expect(screen.getByRole("button", { name: /^Register/ })).toBeDisabled();
    pasteRows();
    expect(rows()).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveTextContent("Added 3 rows from the paste · header row recognised");
    expect(screen.getByLabelText("Row 3 FullName")).toHaveValue("Trt_1");
    expect(screen.getByLabelText("Row 3 TimePointTerm")).toHaveValue("24h");
    expect(screen.getByLabelText("Paste from Excel")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Register 3 samples" })).toBeEnabled();
  });
  it("marks a missing or duplicated FullName inline and blocks saving until it is fixed", async () => {
    const user = userEvent.setup();
    render(<SampleRegistryGrid order={order} shipmentId="ship-1" existingNames={["Trt_1"]} />);
    pasteRows();
    const second = screen.getByLabelText("Row 2 FullName");
    await user.clear(second);
    await user.type(second, "Ctrl_1");
    expect(second).toHaveAttribute("aria-invalid", "true");
    expect(second).toHaveAccessibleDescription("FullName appears twice in this list");
    expect(screen.getByLabelText("Row 3 FullName")).toHaveAccessibleDescription("Already registered in this order");
    expect(screen.getByRole("alert")).toHaveTextContent("3 rows need attention");
    expect(screen.getByRole("button", { name: "Register 3 samples" })).toBeDisabled();
    await user.clear(second);
    await user.type(second, "Ctrl_2");
    const third = screen.getByLabelText("Row 3 FullName");
    await user.clear(third);
    await user.type(third, "Trt_2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Row 2 FullName")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Register 3 samples" })).toBeEnabled();
  });
  it("adds an empty row by hand, removes a row, and renumbers", () => {
    render(<SampleRegistryGrid order={order} shipmentId="ship-1" existingNames={[]} />);
    pasteRows();
    fireEvent.click(screen.getByRole("button", { name: "Add empty row" }));
    expect(rows()).toHaveLength(4);
    expect(screen.getByLabelText("Row 4 FullName")).toHaveValue("");
    expect(screen.getByLabelText("Row 4 FullName")).toHaveAccessibleDescription("FullName is required");
    fireEvent.click(screen.getByRole("button", { name: "Remove row 1" }));
    expect(rows()).toHaveLength(3);
    expect(screen.getByLabelText("Row 1 FullName")).toHaveValue("Ctrl_2");
    fireEvent.click(screen.getByRole("button", { name: "Remove row 3" }));
    expect(screen.getByRole("button", { name: "Register 2 samples" })).toBeEnabled();
  });
  it("submits the contract payload: the order, its shipment and the samples as the database expects them", async () => {
    render(<SampleRegistryGrid order={order} shipmentId="ship-1" existingNames={[]} />);
    pasteRows("Ctrl_1\tControl\tWildType\t1\tP01\t0h\t\tPlasma\t12,5\nTrt_1\tTreated");
    fireEvent.click(screen.getByRole("button", { name: "Register 2 samples" }));
    await waitFor(() => expect(registerSamplesAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(registerSamplesAction).mock.calls[0][1]).toEqual({
      orderId: "ORD042", orderCode: "ORD042", shipmentId: "ship-1",
      samples: [
        { full_name: "Ctrl_1", group1_term: "Control", group2_term: "WildType", replicate_term: "1", patient_term: "P01", time_point_term: "0h", client_sample_id: null, matrix: "Plasma", volume_ul: 12.5 },
        { full_name: "Trt_1", group1_term: "Treated", group2_term: null, replicate_term: null, patient_term: null, time_point_term: null, client_sample_id: null, matrix: null, volume_ul: null },
      ],
    });
  });
  it("shows the database's refusal and keeps the rows so they can be corrected", async () => {
    vi.mocked(registerSamplesAction).mockResolvedValue({ error: "A sample named Ctrl_1 is already registered in ORD042." });
    render(<SampleRegistryGrid order={order} shipmentId="ship-1" existingNames={[]} />);
    pasteRows();
    fireEvent.click(screen.getByRole("button", { name: "Register 3 samples" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A sample named Ctrl_1 is already registered in ORD042.");
    expect(rows()).toHaveLength(3);
  });
});
