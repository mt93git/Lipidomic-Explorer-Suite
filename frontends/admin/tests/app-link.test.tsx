import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import Link from "@/components/app-link";

// Admin links never prefetch (see src/components/app-link.tsx). next/link's prefetch prop is not in the DOM, so the
// mock records it.
vi.mock("next/link", () => ({
  default: ({ prefetch, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean | null; children?: ReactNode }) =>
    <a {...rest} data-prefetch={String(prefetch)}>{children}</a>,
}));

describe("app link", () => {
  it("renders a link that does not prefetch", () => {
    render(<Link href="/pipeline" className="brand">Pipeline</Link>);
    const link = screen.getByRole("link", { name: "Pipeline" });
    expect(link).toHaveAttribute("href", "/pipeline");
    expect(link).toHaveClass("brand");
    expect(link).toHaveAttribute("data-prefetch", "false");
  });

  it("cannot be switched back to prefetching", () => {
    const props = { href: "/release", prefetch: true } as unknown as ComponentProps<typeof Link>;
    render(<Link {...props}>Release</Link>);
    expect(screen.getByRole("link", { name: "Release" })).toHaveAttribute("data-prefetch", "false");
  });
});
