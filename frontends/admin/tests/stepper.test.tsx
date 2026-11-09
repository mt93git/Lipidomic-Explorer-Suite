import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderStepper } from "@/components/order-stepper";
import { GateChecklist } from "@/components/gate-checklist";

describe("order lifecycle", () => {
  it("shows ten numbered steps and exactly one current step", () => {
    render(<OrderStepper stage={3} released={false} />);
    const steps = within(screen.getByRole("list", { name: "Order progress" })).getAllByRole("listitem");
    expect(steps).toHaveLength(10);
    expect(steps[0]).toHaveTextContent("Complete");
    expect(steps[3]).toHaveAttribute("aria-current", "step");
    expect(steps[4]).toHaveTextContent("Upcoming");
    expect(steps.filter(s => s.hasAttribute("aria-current"))).toHaveLength(1);
  });
  it("shows release as the terminal outcome after all ten steps", () => {
    render(<OrderStepper stage={9} released />);
    expect(screen.getByText("Released")).toBeVisible();
    expect(screen.getAllByText("Complete")).toHaveLength(10);
  });
  it("renders ok, failed, and pending gate rows with accessible status text", () => {
    render(<GateChecklist gates={[{ label: "Manifest verified", status: "ok" }, { label: "One sample missing", status: "fail" }, { label: "Operator signature", status: "pending" }]} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("OK");
    expect(rows[1]).toHaveTextContent("Failed");
    expect(rows[2]).toHaveTextContent("Pending");
  });
});
