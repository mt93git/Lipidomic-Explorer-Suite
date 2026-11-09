import { describe, expect, it, vi } from "vitest";
import Home from "../src/app/page";
import { requireWorkspace } from "@/lib/session";
import { demoSession } from "@/lib/demo";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

describe("RSC redirects", () => {
  it("gives Next an app-relative route so /admin is applied only once", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue(demoSession);
    await expect(Home()).rejects.toThrow("redirect:/pipeline");
  });
});
