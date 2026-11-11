// @vitest-environment node
// Account emails (0029): who may send an activation email, whether an account is active, the 10-minute limit, the
// wording of the invitation and of both activation cases, and what is logged and audited. Every transport and link
// generator here is a fake; nothing reaches Resend or GoTrue. Synthetic data only.
import { describe, expect, it, vi } from "vitest";
import {
  ACTIVATION_GAP_MS, NO_ORIGIN, activationMessage, activationOf, activationWait, emailNote, invitationMessage, maySendActivation,
  sendActivationEmail, sendInvitationEmail, type AccountFacts, type ActivationDeps, type ActivationTarget,
} from "@/lib/activation";
import { DEMO_OFF_REASON, OFF_REASON, type LogEntry, type Mail, type NotifyConfig } from "@/lib/notifications";
import { activatePath } from "@/lib/password-reset";
import { DataError } from "@/lib/samples";

const on: NotifyConfig = { send: true, offReason: OFF_REASON, allow: null, apiKey: "re_test_key", from: "Lipidomics · Libreros Lab <lab@lab.example.test>", origin: "https://lipidomics.example.test" };
const TOKEN = "a".repeat(64);
const HASH = "pkce_" + "b".repeat(56);
const NOW = Date.parse("2026-11-11T12:00:00Z");
const facts = (over: Partial<AccountFacts> = {}): AccountFacts => ({ email: "kai@cedar.example.test", signedInAt: null, twoStep: false, hasPassword: false, activationSentAt: null, ...over });
const person = (over: Partial<ActivationTarget> = {}): ActivationTarget => ({
  userId: "u-kai", kind: "client_member", name: "Kai Sample", email: "kai@cedar.example.test", target: "Requester at Example Cedar", clientId: "c-1",
  activation: { active: false, hasPassword: false, lastSentAt: null }, ...over,
});

function fakes(over: Partial<ActivationDeps> = {}) {
  const sent: Mail[] = [];
  const logged: LogEntry[] = [];
  const audited: string[] = [];
  const links: string[] = [];
  const deps: ActivationDeps = {
    config: on, now: NOW, report: () => undefined,
    transport: async mail => { sent.push(mail); },
    generateLink: async email => { links.push(email); return HASH; },
    log: async entries => { logged.push(...entries); },
    audit: async userId => { audited.push(userId); },
    ...over,
  };
  return { deps, sent, logged, audited, links };
}
const send = (deps: ActivationDeps, over: Partial<ActivationTarget> = {}, senderRole: string | null = "admin") =>
  sendActivationEmail({ senderRole, sender: "Robin Admin", person: person(over) }, deps);

describe("who may send an activation email", () => {
  it("lab Owner and Admin only", () => {
    expect(["owner", "admin", "operator", "member", "client_admin", null, undefined].map(maySendActivation)).toEqual([true, true, false, false, false, false, false]);
  });

  it("an Operator, a lab Member or nobody is refused before any link or email", async () => {
    for (const role of ["operator", "member", null]) {
      const { deps, sent, links, logged } = fakes();
      await expect(send(deps, {}, role)).rejects.toThrow(new DataError("Only a lab Owner or Admin can send activation emails."));
      expect([sent, links, logged]).toEqual([[], [], []]);
    }
  });
});

describe("whether an account is active", () => {
  it("lab staff: signed in once, to Admin or Team (two-step sign-in is off)", () => {
    expect(activationOf("lab_staff", facts({ twoStep: false, signedInAt: "2026-10-01T08:00:00Z", hasPassword: true }))).toEqual({ active: true, hasPassword: true, lastSentAt: null });
    expect(activationOf("lab_staff", facts({ twoStep: true })).active).toBe(false);
  });

  it("client members: they have signed in once", () => {
    expect(activationOf("client_member", facts({ signedInAt: "2026-10-01T08:00:00Z" })).active).toBe(true);
    expect(activationOf("client_member", facts({ activationSentAt: "2026-11-11T11:00:00Z" }))).toEqual({ active: false, hasPassword: false, lastSentAt: "2026-11-11T11:00:00Z" });
  });

  it("an active or unreadable account, or one without an email, is refused", async () => {
    const { deps, sent } = fakes();
    await expect(send(deps, { activation: { active: true, hasPassword: true, lastSentAt: null } })).rejects.toThrow("Kai Sample has already signed in: the account is active.");
    await expect(send(deps, { activation: null })).rejects.toThrow("could not be read");
    await expect(send(deps, { email: null })).rejects.toThrow("Kai Sample's account has no email address.");
    expect(sent).toEqual([]);
  });
});

describe("one activation email per person per 10 minutes", () => {
  it("activationWait counts from the last sent email", () => {
    expect(activationWait(null, NOW)).toBe(0);
    expect(activationWait(new Date(NOW - 4 * 60_000).toISOString(), NOW)).toBe(6 * 60_000);
    expect(activationWait(new Date(NOW - ACTIVATION_GAP_MS).toISOString(), NOW)).toBe(0);
    expect(activationWait("not a date", NOW)).toBe(0);
  });

  it("a second send within 10 minutes is refused with the minutes left; after that it goes", async () => {
    const { deps, sent } = fakes();
    const recent = { active: false, hasPassword: false, lastSentAt: new Date(NOW - 9 * 60_000 - 30_000).toISOString() };
    await expect(send(deps, { activation: recent })).rejects.toThrow("An activation email went to Kai Sample less than 10 minutes ago. You can send another in 1 min.");
    expect(sent).toEqual([]);
    expect((await send(deps, { activation: { ...recent, lastSentAt: new Date(NOW - 11 * 60_000).toISOString() } })).status).toBe("sent");
    expect(sent).toHaveLength(1);
  });
});

describe("the wording", () => {
  it("the invitation: a welcome from the lab, who invited them for what, and the Activate link under the base path", () => {
    const message = invitationMessage({ inviter: "Robin Admin", target: "Requester at Example Cedar", labStaff: false, token: TOKEN }, "https://lipidomics.example.test", "/admin");
    expect(message.subject).toBe("Welcome to Lipidomics · Activate your account");
    expect(message.text).toBe([
      "Hello,",
      "Robin Admin invited you to Lipidomics Admin, the Libreros Lab's lipidomics service, as Requester at Example Cedar.",
      "Activate your account: choose your password at this link. It works once, for 7 days.",
      `https://lipidomics.example.test/admin/invite/${TOKEN}`,
      "If you did not expect this email, you can ignore it.",
      "Lipidomics · Libreros Lab",
    ].join("\n\n") + "\n");
    expect(message.html).toContain(`<a href="https://lipidomics.example.test/admin/invite/${TOKEN}">`);
    const lab = invitationMessage({ inviter: "Robin Owner", target: "Lab Operator", labStaff: true, token: TOKEN }, "https://lipidomics.example.test", "/admin-staging");
    expect(lab.text).toContain("as Lab Operator.");
    expect(lab.text).not.toContain("two-step");
    expect(lab.text).toContain("/admin-staging/invite/");
  });

  it("no password yet: choose one at the /activate link (one hour); no two-step for anyone", () => {
    const base = { name: "Kai Sample", email: "kai@cedar.example.test", target: "Requester at Example Cedar", labStaff: false, hasPassword: false, sender: "Robin Admin", tokenHash: HASH };
    const message = activationMessage(base, "https://lipidomics.example.test", "/admin");
    expect(message.subject).toBe("Welcome to Lipidomics · Choose your password");
    expect(message.text.startsWith("Hello Kai Sample,\n\nRobin Admin set up your account in Lipidomics Admin, the Libreros Lab's lipidomics service, as Requester at Example Cedar. You sign in with kai@cedar.example.test.")).toBe(true);
    expect(message.text).toContain(`Choose your password at this link. It works once, for one hour:\n\nhttps://lipidomics.example.test/admin${activatePath(HASH)}`);
    expect(message.text).not.toContain("Team password");
    expect(message.text).not.toContain("two-step");
    expect(activationMessage({ ...base, labStaff: true }, "https://lipidomics.example.test", "/admin").text).not.toContain("two-step");
  });

  it("a password already (copied from Team): it works, sign in; a new one is still offered through the same link", () => {
    const message = activationMessage({ name: "Sam Operator", email: "sam@lab.example.test", target: "Lab Operator", labStaff: true, hasPassword: true, sender: "Robin Owner", tokenHash: HASH }, "https://lipidomics.example.test", "/admin");
    expect(message.subject).toBe("Welcome to Lipidomics · Sign in to Admin");
    expect(message.text).toContain("Your Lipidomics Team password already works here. Sign in with it:\n\nhttps://lipidomics.example.test/admin/sign-in");
    expect(message.text).not.toContain("two-step");
    expect(message.text).toContain(`Would you rather choose a new password? Use this link; it works once, for one hour:\n\nhttps://lipidomics.example.test/admin${activatePath(HASH)}`);
    expect(message.text.indexOf("/sign-in")).toBeLessThan(message.text.indexOf("/activate"));
  });

  it("names are escaped in the HTML", () => {
    const message = activationMessage({ name: "<b>Kai</b>", email: "kai@cedar.example.test", target: "Viewer at A & B", labStaff: false, hasPassword: false, sender: "Robin", tokenHash: HASH }, "https://x.example.test", "/admin");
    expect(message.html).toContain("Hello &lt;b&gt;Kai&lt;/b&gt;,");
    expect(message.html).toContain("Viewer at A &amp; B");
  });

  it("People's note says it was emailed, or why not", () => {
    const email = "kai@cedar.example.test";
    expect(emailNote({ status: "sent", error: null }, email)).toBe("Emailed to kai@cedar.example.test.");
    expect(emailNote({ status: "skipped", error: OFF_REASON }, email)).toBe("Not emailed: sending is off on this server (ADMIN_NOTIFY_ENABLED).");
    expect(emailNote({ status: "skipped", error: DEMO_OFF_REASON }, email)).toBe("Not emailed: the example workspace sends no email.");
    expect(emailNote({ status: "skipped", error: "Not on ADMIN_NOTIFY_ALLOW" }, email)).toBe("Not emailed: cedar.example.test is not on this server's allowlist (ADMIN_NOTIFY_ALLOW).");
    expect(emailNote({ status: "failed", error: "Resend answered 422: invalid" }, email)).toBe("Not emailed: the email failed (Resend answered 422: invalid).");
  });
});

describe("sending, logging and auditing an activation email", () => {
  it("sent: one recovery link for the person's email, one email, one 'activation' log row and one audit row", async () => {
    const { deps, sent, logged, audited, links } = fakes();
    expect(await send(deps)).toEqual({ status: "sent", error: null, email: "kai@cedar.example.test" });
    expect(links).toEqual(["kai@cedar.example.test"]);
    expect(sent.map(mail => [mail.to, mail.from, mail.subject])).toEqual([["kai@cedar.example.test", on.from, "Welcome to Lipidomics · Choose your password"]]);
    expect(sent[0].text).toContain(`https://lipidomics.example.test/admin${activatePath(HASH)}`);
    expect(logged).toEqual([{ kind: "activation", userId: "u-kai", email: "kai@cedar.example.test", subject: "Welcome to Lipidomics · Choose your password", status: "sent", error: null, clientId: "c-1", orderId: null, datasetId: null, reference: null }]);
    expect(audited).toEqual(["u-kai"]);
  });

  it("sending off, not on the allowlist, or no public origin: logged without a link, no email, no audit", async () => {
    const cases: [NotifyConfig, string, string][] = [
      [{ ...on, send: false }, "skipped", OFF_REASON],
      [{ ...on, allow: ["lab.example.test"] }, "skipped", "Not on ADMIN_NOTIFY_ALLOW"],
      [{ ...on, origin: null }, "failed", NO_ORIGIN],
      [{ ...on, apiKey: null }, "failed", "RESEND_API_KEY or ADMIN_MAIL_FROM is not set"],
    ];
    for (const [config, status, error] of cases) {
      const { deps, sent, logged, audited, links } = fakes({ config });
      expect(await send(deps)).toMatchObject({ status, error });
      expect([sent, links, audited]).toEqual([[], [], []]);
      expect(logged.map(row => [row.kind, row.status, row.error])).toEqual([["activation", status, error]]);
    }
  });

  it("GoTrue or Resend refusing: failed and logged, never thrown, not audited; a log or audit failure is reported", async () => {
    const noLink = fakes({ generateLink: async () => { throw new Error("GoTrue answered 500"); } });
    expect(await send(noLink.deps)).toMatchObject({ status: "failed", error: "The activation link could not be created: GoTrue answered 500" });
    expect([noLink.sent, noLink.audited, noLink.logged.map(row => row.status)]).toEqual([[], [], ["failed"]]);

    const refused = fakes({ transport: async () => { throw new Error("Resend answered 422"); } });
    expect(await send(refused.deps)).toMatchObject({ status: "failed", error: "Resend answered 422" });
    expect(refused.audited).toEqual([]);

    const report = vi.fn();
    const broken = fakes({ report, log: async () => { throw new Error("insert failed"); }, audit: async () => { throw new Error("42501"); } });
    expect((await send(broken.deps)).status).toBe("sent");
    expect(report.mock.calls.map(call => call[0])).toEqual([
      "[account email] activation: the send log could not be written (insert failed)",
      "[account email] activation: the audit row could not be written (42501)",
    ]);
  });
});

describe("the invitation email", () => {
  const input = { inviter: "Robin Admin", target: "Viewer at Example Cedar", labStaff: false, token: TOKEN, email: "new@cedar.example.test", clientId: null };

  it("sent: one email with the invitation link, one 'invitation' log row without a user", async () => {
    const sent: Mail[] = [];
    const logged: LogEntry[] = [];
    const outcome = await sendInvitationEmail(input, { config: on, transport: async mail => { sent.push(mail); }, log: async entries => { logged.push(...entries); } });
    expect(outcome).toEqual({ status: "sent", error: null });
    expect(sent.map(mail => [mail.to, mail.subject])).toEqual([["new@cedar.example.test", "Welcome to Lipidomics · Activate your account"]]);
    expect(sent[0].text).toContain(`/invite/${TOKEN}`);
    expect(logged).toEqual([{ kind: "invitation", userId: null, email: "new@cedar.example.test", subject: "Welcome to Lipidomics · Activate your account", status: "sent", error: null, clientId: null, orderId: null, datasetId: null, reference: null }]);
  });

  it("not sent (off, allowlist, failure): logged with why, never thrown", async () => {
    const cases: [NotifyConfig, () => Promise<void>, string][] = [
      [{ ...on, send: false }, async () => undefined, "skipped"],
      [{ ...on, allow: ["lab.example.test"] }, async () => undefined, "skipped"],
      [on, async () => { throw new Error("Resend answered 500"); }, "failed"],
    ];
    for (const [config, transport, status] of cases) {
      const logged: LogEntry[] = [];
      const outcome = await sendInvitationEmail(input, { config, transport, log: async entries => { logged.push(...entries); }, report: () => undefined });
      expect(outcome.status).toBe(status);
      expect(logged.map(row => [row.kind, row.userId, row.status])).toEqual([["invitation", null, status]]);
    }
  });
});
