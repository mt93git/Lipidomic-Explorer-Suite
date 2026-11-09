import { render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { demoSession } from "@/lib/demo";

// The side navigation does not prefetch (it goes through @/components/app-link): otherwise each page view fires ~20
// RSC prefetches for no benefit in a back office. next/link's prefetch prop is not in the DOM, so the mock records it.
vi.mock("next/link", () => ({
  default: ({ prefetch, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean | null; children?: ReactNode }) =>
    <a {...rest} data-prefetch={String(prefetch)}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/pipeline", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions", () => ({ signOut: vi.fn(), switchView: vi.fn() }));

describe("side navigation", () => {
  it("does not prefetch its links", () => {
    render(<AppShell session={demoSession}>Board</AppShell>);
    const links = within(screen.getByRole("navigation", { name: "Admin navigation" })).getAllByRole("link");
    expect(links.length).toBeGreaterThan(10);
    for (const link of links) expect(link, link.textContent ?? "").toHaveAttribute("data-prefetch", "false");
  });
});
