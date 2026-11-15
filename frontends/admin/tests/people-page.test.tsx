// a19 People: one row per person (initials avatar, Lab role pill, Clients and project roles, Last active, Remind for an
// account that never signed in) and the Invite form (Email, Client, Role, Send invitation, valid 7 days). No 2-STEP
// column: two-step sign-in is off for everyone (decision 2026-11-11). Data and actions mocked; synthetic data only.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PeoplePage from "@/app/(workspace)/people/page";
import { listAccessRequests } from "@/lib/data/access-requests";
import { listPeople } from "@/lib/data/people";
import { formatLabInstant } from "@/lib/lab-time";
import { groupPeople, lastActive, projectRoles, type Person } from "@/lib/people";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => ({ view: "staff", role: "Owner" })) }));
vi.mock("@/app/(workspace)/people/actions", () => ({
  inviteAction: vi.fn(), revokeAction: vi.fn(), setRoleAction: vi.fn(), archiveMemberAction: vi.fn(), answerAccessAction: vi.fn(), sendActivationAction: vi.fn(),
}));
vi.mock("@/lib/data/people", () => ({ listPeople: vi.fn() }));
vi.mock("@/lib/data/access-requests", () => ({ listAccessRequests: vi.fn() }));

const NOW = new Date("2026-11-13T20:00:00Z"); // 15:00 in the lab
const active = (signedInAt: string | null) => ({ active: !!signedInAt, hasPassword: !!signedInAt, lastSentAt: null });
const person = (patch: Partial<Person> & Pick<Person, "kind" | "id" | "userId" | "name" | "role">): Person => ({
  email: null, clientId: null, clientName: null, twoStep: false, lastSignedInAt: "2026-11-13T14:00:00Z", activation: active("2026-11-13T14:00:00Z"), ...patch,
});
const people: Person[] = [
  person({ kind: "lab_staff", id: "s-gb", userId: "u-gb", name: "Gerardo Example", role: "owner", email: "owner@example.test" }),
  person({ kind: "lab_staff", id: "s-sl", userId: "u-sl", name: "Stephania Example", role: "admin", lastSignedInAt: "2026-11-11T15:00:00Z" }),
  person({ kind: "lab_staff", id: "s-ub", userId: "u-ub", name: "Usman Example", role: "operator", lastSignedInAt: null, activation: { active: false, hasPassword: false, lastSentAt: "2026-11-12T15:00:00Z" } }),
  person({ kind: "lab_staff", id: "s-ps", userId: "u-ps", name: "Paula Example", role: "member" }),
  person({ kind: "client_member", id: "m-ps1", userId: "u-ps", name: "Paula Example", role: "client_admin", clientId: "c-1", clientName: "Example Atlas" }),
  person({ kind: "client_member", id: "m-ps2", userId: "u-ps", name: "Paula Example", role: "viewer", clientId: "c-2", clientName: "Example Cedar" }),
  person({ kind: "client_member", id: "m-pd", userId: "u-pd", name: "Postdoc Example", role: "requester", clientId: "c-2", clientName: "Example Cedar" }),
];

describe("lastActive: when the account last signed in, in lab days", () => {
  it("today, yesterday, N d within a month, the date before, never, and a dash when not readable", () => {
    expect(lastActive("2026-11-13T14:00:00Z", true, NOW)).toBe("today");
    expect(lastActive("2026-11-13T03:00:00Z", true, NOW)).toBe("yesterday"); // 22:00 on the 12th in New Haven
    expect(lastActive("2026-11-11T15:00:00Z", true, NOW)).toBe("2 d");
    expect(lastActive("2026-10-01T15:00:00Z", true, NOW)).toBe("1 Oct");
    expect(lastActive("2025-10-01T15:00:00Z", true, NOW)).toBe("1 Oct 2025");
    expect(lastActive(null, true, NOW)).toBe("never");
    expect(lastActive(null, false, NOW)).toBe("—");
  });
});

describe("groupPeople and projectRoles", () => {
  it("one row per person: the lab membership and every client membership", () => {
    const rows = groupPeople(people);
    expect(rows.map(row => [row.name, row.lab?.role ?? null, row.clients.map(client => client.clientName)])).toEqual([
      ["Gerardo Example", "owner", []], ["Stephania Example", "admin", []], ["Usman Example", "operator", []],
      ["Paula Example", "member", ["Example Atlas", "Example Cedar"]], ["Postdoc Example", null, ["Example Cedar"]],
    ]);
  });
  it("Owner and Admin see all; an Operator runs the lab's work for all clients; client roles by client", () => {
    const rows = groupPeople(people);
    expect(rows.map(projectRoles)).toEqual([["all"], ["all"], ["lab work, all clients"], ["Example Atlas · Client admin", "Example Cedar · Viewer"], ["Example Cedar · Requester"]]);
  });
});

describe("people page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.mocked(listPeople).mockResolvedValue({
      people, invitations: [], clients: [{ id: "c-1", name: "Example Atlas" }, { id: "c-2", name: "Example Cedar" }],
      canInviteLab: true, canInviteClient: true, demoActors: null,
    });
    vi.mocked(listAccessRequests).mockResolvedValue({ requests: [], clients: [], canAnswer: true, demoActors: null });
  });
  const page = async () => render(await PeoplePage({ searchParams: Promise.resolve({}) }));

  it("has the prototype's columns, and no 2-STEP column", async () => {
    await page();
    const table = screen.getByRole("table", { name: "People" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Person", "Lab role", "Clients and project roles", "Last active", "Actions"]);
    expect(within(table).queryByText(/2-step/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Invite person" })).toHaveAttribute("href", "#invite");
  });

  it("each person: initials avatar, Lab role pill, project roles, last active; Remind only for one who never signed in", async () => {
    await page();
    const rows = within(screen.getByRole("table", { name: "People" })).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    const [gerardo, stephania, usman, paula, postdoc] = rows;
    expect(within(gerardo).getByText("GE")).toHaveAttribute("aria-hidden", "true");
    expect(gerardo).toHaveTextContent(/Gerardo Example.*owner@example\.test.*Owner.*all.*today/);
    expect(stephania).toHaveTextContent(/Admin.*all.*2 d/);
    expect(usman).toHaveTextContent(/Operator.*lab work, all clients.*never/);
    expect(paula).toHaveTextContent(/Member.*Example Atlas · Client admin.*Example Cedar · Viewer.*today/);
    expect(postdoc).toHaveTextContent(/Client.*Example Cedar · Requester.*today/);
    expect(within(usman).getByRole("button", { name: "Remind Usman Example" })).toBeVisible();
    expect(within(usman).getByText(/^Reminded /)).toBeVisible();
    for (const row of [gerardo, stephania, paula, postdoc]) expect(within(row).queryByRole("button", { name: /^Remind/ })).toBeNull();
  });

  it("Remind within 24 hours of the last one: the button is disabled and says when the next is possible", async () => {
    vi.mocked(listPeople).mockResolvedValue({
      people: people.map(item => item.id === "s-ub" ? { ...item, activation: { active: false, hasPassword: false, lastSentAt: "2026-11-13T18:00:00Z" } } : item),
      invitations: [], clients: [], canInviteLab: true, canInviteClient: true, demoActors: null,
    });
    await page();
    const usman = within(screen.getByRole("table", { name: "People" })).getAllByRole("row")[3];
    expect(within(usman).getByRole("button", { name: /Remind Usman Example/ })).toBeDisabled();
    expect(usman).toHaveTextContent(`Reminded ${formatLabInstant("2026-11-13T18:00:00Z")} · next possible ${formatLabInstant("2026-11-14T18:00:00.000Z")}`);
    expect(formatLabInstant("2026-11-14T18:00:00.000Z")).toMatch(/13:00 EST/);
  });

  it("the Invite form: Email, Client, Role, Send invitation and the 7-day note", async () => {
    await page();
    const invite = screen.getByRole("region", { name: /^Invite$/ });
    expect(invite).toHaveAttribute("id", "invite");
    const labels = within(invite).getAllByText(/^(Email|Client|Role)$/).map(label => label.textContent);
    expect(labels).toEqual(["Email", "Client", "Role"]);
    expect(within(invite).getByLabelText("Email")).toHaveAttribute("placeholder", "name@institution.edu");
    expect(within(invite).getByLabelText("Role")).toHaveValue("client:requester");
    expect(within(invite).getByRole("button", { name: "Send invitation" })).toBeVisible();
    expect(within(invite).getByText(/The invitation is valid for 7 days\./)).toBeVisible();
  });
});
