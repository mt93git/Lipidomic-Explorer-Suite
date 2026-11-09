import { describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";
import { redirectAfterAction } from "@/lib/action-redirect";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

describe("basePath-safe action redirects", () => {
  it("leaves the basePath to Next's router for an enhanced action", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "next-action": "example-action" }) as never);
    await expect(redirectAfterAction("/pipeline")).rejects.toThrow("redirect:/pipeline");
  });
  it("includes the basePath in a plain HTML form's Location header", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    await expect(redirectAfterAction("/pipeline")).rejects.toThrow("redirect:/admin/pipeline");
  });
});
