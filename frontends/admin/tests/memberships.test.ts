// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sessionFromDatabase } from "@/lib/supabase/memberships";
import { fakePostgrest } from "./helpers/fake-postgrest";

type Row = Record<string, unknown>;
// The live identity comes from admin.lab_staff and admin.client_member, read with the user's own token: the same
// rows RLS uses, so the screens and the database agree on who may see what. app_metadata is not consulted.
function client(tables: Record<string, Row[]>) {
  const db = fakePostgrest(tables);
  return { schema: (name: string) => (name === "admin" ? { from: db.from } : null) } as never;
}
const user = { id: "user-1", email: "person@example.test", app_metadata: { admin: { lab_role: "Owner" } } };

describe("live session from the database memberships", () => {
  it("makes an active lab operator staff with every client in reach", async () => {
    const session = await sessionFromDatabase(client({
      lab_staff: [{ user_id: "user-1", role: "operator", display_name: "Op One", archived_at: null }],
      client_member: [],
      client: [{ id: "c-cedar", name: "Cedar Lab", archived_at: null }, { id: "c-atlas", name: "Atlas Group", archived_at: null }, { id: "c-old", name: "Old", archived_at: "2026-11-01T00:00:00Z" }],
    }), user);
    expect(session).toEqual({
      userId: "user-1", displayName: "Op One", role: "Operator", view: "staff", mock: false, selectedClient: null,
      clients: [{ id: "c-atlas", name: "Atlas Group", color: "atlas" }, { id: "c-cedar", name: "Cedar Lab", color: "cedar" }],
    });
  });

  it("makes a client member a client user with only their active memberships, ignoring app_metadata claims", async () => {
    const session = await sessionFromDatabase(client({
      lab_staff: [{ user_id: "user-1", role: "member", display_name: null, archived_at: null }, { user_id: "someone-else", role: "owner", display_name: "X", archived_at: null }],
      client_member: [
        { user_id: "user-1", role: "requester", archived_at: null, client: { id: "c-cedar", name: "Cedar Lab", archived_at: null } },
        { user_id: "user-1", role: "client_admin", archived_at: null, client: { id: "c-atlas", name: "Atlas Group", archived_at: null } },
        { user_id: "user-1", role: "viewer", archived_at: "2026-11-01T00:00:00Z", client: { id: "c-old", name: "Old", archived_at: null } },
        { user_id: "user-1", role: "viewer", archived_at: null, client: { id: "c-closed", name: "Closed", archived_at: "2026-11-01T00:00:00Z" } },
        { user_id: "user-1", role: "viewer", archived_at: null, client: null },
      ],
    }), user);
    expect(session).toMatchObject({ displayName: "person@example.test", role: "Viewer", view: "client" });
    expect(session.clients).toEqual([
      { id: "c-atlas", name: "Atlas Group", color: "atlas", role: "Client admin" },
      { id: "c-cedar", name: "Cedar Lab", color: "cedar", role: "Requester" },
    ]);
  });

  it("gives an account without memberships no access", async () => {
    const session = await sessionFromDatabase(client({ lab_staff: [], client_member: [] }), { id: "user-1" });
    expect(session).toMatchObject({ view: "client", role: "Viewer", clients: [], displayName: "Admin user" });
  });

  it("fails closed when the membership read fails", async () => {
    const failed = Promise.resolve({ data: null, error: { message: "boom" } });
    const failing = { schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ is: () => failed }), is: () => ({ order: () => failed }) }) }) }) } as never;
    await expect(sessionFromDatabase(failing, user)).rejects.toThrow();
  });
});
