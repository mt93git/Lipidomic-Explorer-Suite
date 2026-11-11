// Client users never reach a lab screen: the rule (workspaceRedirect, used by requireWorkspace) and a check that
// every workspace page other than the client portal's own asks for the staff audience on the server.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceRedirect } from "@/lib/session-model";
import { demoClients } from "@/lib/demo";

const staff = { view: "staff" as const, clients: demoClients, selectedClient: null };
const client = { view: "client" as const, clients: [demoClients[1]], selectedClient: demoClients[1] };
const undecided = { view: "client" as const, clients: [demoClients[1], demoClients[3]], selectedClient: null };

describe("workspaceRedirect", () => {
  it("sends a client user away from lab screens to Client home", () => {
    expect(workspaceRedirect(client, "staff")).toBe("/client/home");
    expect(workspaceRedirect(undecided, "staff")).toBe("/client/home");
  });
  it("lets a client user with a selected client into the portal and shared pages", () => {
    expect(workspaceRedirect(client, "client")).toBeNull();
    expect(workspaceRedirect(client, "all")).toBeNull();
  });
  it("asks a client user with several memberships to choose one first", () => {
    expect(workspaceRedirect(undecided, "client")).toBe("/choose-client");
    expect(workspaceRedirect(undecided, "all")).toBe("/choose-client");
  });
  it("leaves lab staff where they were, and sends them from the portal to the pipeline", () => {
    expect(workspaceRedirect(staff, "staff")).toBeNull();
    expect(workspaceRedirect(staff, "all")).toBeNull();
    expect(workspaceRedirect(staff, "client")).toBe("/pipeline");
  });
});

describe("every lab page is guarded on the server", () => {
  const root = join(__dirname, "../src/app/(workspace)");
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /^(page\.tsx|route\.ts)$/.test(name) ? [path] : [];
  });
  // The client portal's own pages, the order detail (with its client view) and the placeholder route (it guards
  // by the audience of the screen it stands in for).
  const open: Record<string, RegExp> = {
    "client/home/page.tsx": /requireWorkspace\("client"\)/,
    "client/request-order/page.tsx": /requireWorkspace\("client"\)/,
    "orders/[code]/page.tsx": /requireWorkspace\("all"\)/,
    // 0028: everyone's own email switches; the send log only for lab Owner and Admin (mayReadNotificationLog).
    "notifications/page.tsx": /await requireWorkspace\("all"\)[\s\S]*const showLog = mayReadNotificationLog\(session\)/,
    "choose-client/page.tsx": /requireSession\(\)/,
    "[...path]/page.tsx": /requireWorkspace\(route\.audience\)/,
    // F4: a deliverable's download serves lab staff and its client; deliverableDownload applies downloadDecision.
    "deliverables/[id]/route.ts": /await deliverableDownload\(id\)/,
  };
  const pages = files(root).map(path => [relative(root, path), readFileSync(path, "utf8")] as const);

  it("finds the workspace pages", () => expect(pages.length).toBeGreaterThan(20));
  for (const [path, source] of pages) {
    it(path, () => {
      if (open[path]) expect(source).toMatch(open[path]);
      else if (path.endsWith("route.ts")) expect(source).toMatch(/session\.view !== "staff"\) return new Response\([^)]*status: 403/);
      else expect(source).toMatch(/await requireWorkspace\("staff"\)/);
    });
  }
});
