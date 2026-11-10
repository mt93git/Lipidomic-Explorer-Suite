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
