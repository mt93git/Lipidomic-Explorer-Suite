import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionForm } from "@/app/(workspace)/release/action-form";
import { PolicyForm } from "@/app/(workspace)/release-policy/policy-form";
import { setReleasePolicyAction } from "@/app/(workspace)/release-policy/actions";

vi.mock("@/app/(workspace)/release-policy/actions", () => ({ setReleasePolicyAction: vi.fn() }));

describe("release action forms", () => {
  it("moves the focus to the refusal when the action returns an error, so a keyboard user is not left on the body", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Not an eligible signer." });
    render(<ActionForm action={action} submit="Sign" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not an eligible signer.");
    expect(alert).toHaveFocus();
  });
  it("with keepValues, puts back what was typed when the action refuses it (React empties the fields otherwise)", async () => {
    const action = vi.fn().mockResolvedValue({ error: "A panel with that name already exists." });
    render(<ActionForm action={action} submit="Add panel" keepValues>
      <label>Panel name<input name="name" /></label>
      <label>Dataset type<select name="type" defaultValue="global"><option value="global">Global</option><option value="mediators">Mediators</option></select></label>
    </ActionForm>);
    fireEvent.change(screen.getByLabelText("Panel name"), { target: { value: "Panel A" } });
    fireEvent.change(screen.getByLabelText("Dataset type"), { target: { value: "mediators" } });
    fireEvent.click(screen.getByRole("button", { name: "Add panel" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Panel name")).toHaveValue("Panel A");
    expect(screen.getByLabelText("Dataset type")).toHaveValue("mediators");
  });
  it("tells the Owner which field to fix when fewer people are ticked than signatures required, linking to it", () => {
    const staff = [{ userId: "u-a", name: "Demo Reviewer A", role: "admin" as const }, { userId: "u-b", name: "Demo Reviewer B", role: "admin" as const }];
    render(<PolicyForm policy={{ eligibleSigners: ["u-a", "u-b"], requiredSignatures: 2, setBy: null, setAt: null }} staff={staff} demoActors={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Demo Reviewer B/ }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Fewer eligible signers (1) than required signatures (2)");
    expect(screen.getByRole("link", { name: "Required signatures" })).toHaveAttribute("href", "#policy-required");
    expect(screen.getByLabelText("Required signatures")).toHaveAttribute("id", "policy-required");
    expect(screen.getByRole("button", { name: "Save policy" })).toBeDisabled();
    expect(setReleasePolicyAction).not.toHaveBeenCalled();
  });
});
