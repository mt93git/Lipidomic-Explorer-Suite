import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/sign-in-form";

vi.mock("@/app/actions", () => ({ signIn: vi.fn(), enterDemo: vi.fn() }));

describe("sign-in form", () => {
  it("labels email and password (no two-step code) and explains disabled Yale SSO", () => {
    render(<SignInForm mock={false} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.queryByLabelText("Two-step code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Yale SSO" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use Yale SSO" })).toHaveAccessibleDescription("Yale SSO is not configured yet.");
    expect(screen.queryByRole("button", { name: "Enter example workspace" })).not.toBeInTheDocument();
  });
  it("offers a credential-free entry in example mode", () => {
    render(<SignInForm mock />);
    expect(screen.getByRole("button", { name: "Enter example workspace" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});
