import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NameDictionaryPage from "@/app/(workspace)/name-dictionary/page";
import { UnmappedTable } from "@/app/(workspace)/name-dictionary/unmapped-table";
import { saveDictionaryEntry } from "@/app/(workspace)/name-dictionary/actions";

vi.mock("@/app/(workspace)/name-dictionary/actions", () => ({ saveDictionaryEntry: vi.fn() }));
vi.mock("@/lib/data/results", () => ({ getNameDictionary: vi.fn(async () => ({
  entries: [{ id: "e1", export_name: "PC 34:1", clean_name: "PC(34:1)" }], analytes: ["PC 34:1", "CE 18:1", "TG 52:2"],
})) }));

beforeEach(() => { vi.mocked(saveDictionaryEntry).mockReset(); });

describe("name dictionary page", () => {
  it("renders the shell, entries, and unmapped rows with their count", async () => {
    render(await NameDictionaryPage());
    expect(screen.getByText(/Lab work \/ Pipeline/).closest(".eyebrow")).toHaveTextContent("Name dictionary");
    const actions = screen.getByRole("heading", { level: 1 }).closest(".page-heading")!.querySelector(".heading-actions") as HTMLElement;
    expect(within(actions).getByRole("link", { name: "Ingest results" })).toHaveAttribute("href", "/ingest-results");
    expect(within(actions).getByRole("link", { name: "← Back to pipeline" })).toHaveAttribute("href", "/pipeline");
    expect(screen.getByRole("table", { name: "Dictionary entries" })).toHaveTextContent("PC(34:1)");
    const unmapped = screen.getByRole("region", { name: /Unmapped analytes/ });
    expect(within(unmapped).getByRole("heading", { level: 2 })).toHaveTextContent("Unmapped analytes · 2");
    expect(within(unmapped).getByRole("table")).toHaveTextContent("CE 18:1");
    expect(within(unmapped).getByRole("textbox", { name: "Clean name for TG 52:2" })).toBeVisible();
  });
  it("keeps the entry form for names outside the last file", async () => {
    render(await NameDictionaryPage());
    const add = screen.getByRole("region", { name: "Add a name" });
    expect(within(add).getByRole("button", { name: /add/i })).toBeVisible();
    expect(within(add).getByLabelText("SCIEX export name").closest(".field")).not.toBeNull();
    expect(within(add).getByLabelText("Clean name").closest(".field")).not.toBeNull();
  });
  it("saves a row through the existing action and removes it", async () => {
    vi.mocked(saveDictionaryEntry).mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    render(<UnmappedTable analytes={["CE 18:1", "TG 52:2"]} />);
    await user.type(screen.getByRole("textbox", { name: "Clean name for CE 18:1" }), "CE(18:1)");
    await user.click(screen.getByRole("button", { name: "Save CE 18:1" }));
    await waitFor(() => expect(saveDictionaryEntry).toHaveBeenCalledOnce());
    const form = vi.mocked(saveDictionaryEntry).mock.calls[0][1];
    expect(form.get("export_name")).toBe("CE 18:1");
    expect(form.get("clean_name")).toBe("CE(18:1)");
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Clean name for CE 18:1" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Unmapped analytes · 1" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("CE 18:1");
    expect(screen.getByRole("textbox", { name: "Clean name for TG 52:2" })).toHaveFocus();
  });
  it("retains a pending row across server revalidation until its saved notice is shown", async () => {
    let finish!: (value: { saved: boolean }) => void;
    vi.mocked(saveDictionaryEntry).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    const { rerender } = render(<UnmappedTable analytes={["CE 18:1", "TG 52:2"]} />);
    await user.type(screen.getByRole("textbox", { name: "Clean name for CE 18:1" }), "CE(18:1)");
    await user.click(screen.getByRole("button", { name: "Save CE 18:1" }));
    rerender(<UnmappedTable analytes={["TG 52:2"]} />);
    finish({ saved: true });
    expect(await screen.findByRole("status")).toHaveTextContent("CE 18:1 saved.");
    expect(screen.queryByRole("textbox", { name: "Clean name for CE 18:1" })).not.toBeInTheDocument();
  });
  it("shows an action error only on the submitted row", async () => {
    vi.mocked(saveDictionaryEntry).mockResolvedValue({ error: "Could not save." });
    const user = userEvent.setup();
    render(<UnmappedTable analytes={["CE 18:1", "TG 52:2"]} />);
    await user.type(screen.getByRole("textbox", { name: "Clean name for CE 18:1" }), "CE(18:1)");
    await user.click(screen.getByRole("button", { name: "Save CE 18:1" }));
    const row = screen.getByRole("textbox", { name: "Clean name for CE 18:1" }).closest("tr")!;
    expect(await within(row).findByRole("alert")).toHaveTextContent("Could not save.");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Clean name for CE 18:1" })).toHaveFocus());
    expect(within(screen.getByRole("textbox", { name: "Clean name for TG 52:2" }).closest("tr")!).queryByRole("alert")).toBeNull();
  });
  it("focuses the success notice after the last row is saved", async () => {
    vi.mocked(saveDictionaryEntry).mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    render(<UnmappedTable analytes={["CE 18:1"]} />);
    await user.type(screen.getByRole("textbox", { name: "Clean name for CE 18:1" }), "CE");
    await user.click(screen.getByRole("button", { name: "Save CE 18:1" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
  });
  it("clears pending after an identical error on a second submission", async () => {
    vi.mocked(saveDictionaryEntry).mockImplementation(async () => ({ error: "Already exists." }));
    const user = userEvent.setup();
    render(<UnmappedTable analytes={Array.from({ length: 35 }, (_, i) => `Analyte ${i + 1}`)} />);
    await user.type(screen.getByRole("textbox", { name: "Clean name for Analyte 1" }), "Name");
    await user.click(screen.getByRole("button", { name: "Save Analyte 1" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.getByRole("button", { name: "Show next 33" })).toBeEnabled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Analyte 1" })).toBeEnabled());
    await user.type(screen.getByRole("textbox", { name: "Clean name for Analyte 1" }), "Name");
    await user.click(screen.getByRole("button", { name: "Save Analyte 1" }));
    await waitFor(() => expect(saveDictionaryEntry).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Show next 33" })).toBeEnabled());
  });
  it("shows at most 33 rows at a time and moves to the next page", async () => {
    const user = userEvent.setup();
    render(<UnmappedTable analytes={Array.from({ length: 35 }, (_, i) => `Analyte ${i + 1}`)} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(33);
    await user.click(screen.getByRole("button", { name: "Show next 33" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByRole("textbox", { name: "Clean name for Analyte 34" })).toBeVisible();
  });
});
