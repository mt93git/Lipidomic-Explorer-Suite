import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Digest } from "@/components/digest";

const sha = "5b85572ed378" + "a".repeat(46) + "ddaf0d";

describe("digest", () => {
  it("shows a short form with a copy button and keeps the full digest behind a disclosure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Digest sha={sha} label="Analysis file" />);
    expect(screen.getByText("5b85572ed378…ddaf0d")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy SHA-256 of Analysis file" }));
    expect(writeText).toHaveBeenCalledWith(sha);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy SHA-256 of Analysis file" })).toHaveTextContent("Copied"));
    const details = screen.getByText("Full digest").closest("details") as HTMLDetailsElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText(sha)).toBeInTheDocument();
  });
  it("says when nothing was recorded", () => {
    render(<Digest sha="" label="Companion file" />);
    expect(screen.getByText("not recorded")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
