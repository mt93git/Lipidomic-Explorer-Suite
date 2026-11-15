import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiveShipmentForm } from "@/components/receive-shipment-form";
import { receiveShipmentAction } from "@/app/(workspace)/receive-shipment/actions";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/receive-shipment/actions", () => ({ receiveShipmentAction: vi.fn() }));

const orders = [
  { id: "ORD042", code: "ORD042", clientId: "example-cedar", clientName: "Example Cedar", description: "Example lipid panel · feasibility", stage: 0, expectedSamples: 12, sampleType: "Synthetic plasma" },
  { id: "ORD052", code: "ORD052", clientId: "example-harbor", clientName: "Example Harbor", description: "Synthetic sterol screen · request", stage: 0, expectedSamples: 8, sampleType: "Synthetic plasma" },
];
beforeEach(() => { vi.clearAllMocks(); vi.mocked(receiveShipmentAction).mockResolvedValue({}); });

describe("receive shipment form", () => {
  it("lists the orders waiting to arrive and asks for carrier, condition and box count; tracking stays optional", () => {
    render(<ReceiveShipmentForm orders={orders} selected={null} />);
    const select = screen.getByLabelText("Order");
    expect(within(select).getAllByRole("option").map(o => o.textContent)).toEqual(["Choose an order…", "ORD042 · Example Cedar · Example lipid panel · feasibility", "ORD052 · Example Harbor · Synthetic sterol screen · request"]);
    expect(select).toBeRequired();
    expect(screen.getByLabelText("Carrier")).toBeRequired();
    expect(screen.getByLabelText("Tracking number")).not.toBeRequired();
    expect(screen.getByRole("group", { name: "Condition on arrival" })).toBeVisible();
    expect(screen.getAllByRole("radio").map(r => r.getAttribute("value"))).toEqual(["ok", "thawed", "damaged", "partial"]);
    expect(screen.getByLabelText("Boxes")).toBeRequired();
    expect(screen.getByLabelText("Notes")).not.toBeRequired();
  });
  it("puts the chosen order in the URL so the page can show its facts", () => {
    render(<ReceiveShipmentForm orders={orders} selected="ORD042" />);
    expect(screen.getByLabelText("Order")).toHaveValue("ORD042");
    fireEvent.change(screen.getByLabelText("Order"), { target: { value: "ORD052" } });
    expect(replace).toHaveBeenCalledWith("/receive-shipment?order=ORD052", { scroll: false });
  });
  it("shows the action's field errors next to their fields and keeps what was typed", async () => {
    vi.mocked(receiveShipmentAction).mockResolvedValue({ errors: { carrier: "Enter the carrier" }, values: { orderId: "ORD042", carrier: "", trackingNumber: "7489 0000 0001", condition: "ok", boxCount: "1", notes: "" } });
    render(<ReceiveShipmentForm orders={orders} selected="ORD042" />);
    fireEvent.change(screen.getByLabelText("Carrier"), { target: { value: "FedEx" } });
    fireEvent.click(screen.getByRole("radio", { name: /Intact/ }));
    fireEvent.change(screen.getByLabelText("Boxes"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record arrival" }));
    expect(await screen.findByText("Enter the carrier")).toBeVisible();
    expect(screen.getByLabelText("Carrier")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Carrier")).toHaveAccessibleDescription("Enter the carrier");
    expect(screen.getByLabelText("Tracking number")).toHaveValue("7489 0000 0001");
    expect(receiveShipmentAction).toHaveBeenCalledTimes(1);
  });
  it("sums the field errors up in an alert that links to each field, and moves the focus to the first invalid control", async () => {
    vi.mocked(receiveShipmentAction).mockResolvedValue({
      errors: { carrier: "Enter the carrier", condition: "Choose the condition on arrival", boxCount: "Enter the number of boxes, 0 or more" },
      values: { orderId: "ORD042", carrier: "", trackingNumber: "", condition: "", boxCount: "-2", notes: "" },
    });
    render(<ReceiveShipmentForm orders={orders} selected="ORD042" />);
    // The browser's own checks pass (jsdom validates on submit); the server still refuses, as it does with a stale page.
    fireEvent.change(screen.getByLabelText("Carrier"), { target: { value: "FedEx" } });
    fireEvent.click(screen.getByRole("radio", { name: /Intact/ }));
    fireEvent.change(screen.getByLabelText("Boxes"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Record arrival" }));
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("3 fields need attention");
    expect(within(summary).getAllByRole("link").map(link => [link.textContent, link.getAttribute("href")])).toEqual([["Carrier", "#ship-carrier"], ["Condition on arrival", "#ship-condition"], ["Boxes", "#ship-boxCount"]]);
    expect(screen.getByRole("group", { name: "Condition on arrival" })).toHaveAttribute("id", "ship-condition");
    expect(screen.getByLabelText("Carrier")).toHaveFocus();
    expect(screen.getByText("Enter the number of boxes, 0 or more")).toHaveClass("field-error");
  });
});
