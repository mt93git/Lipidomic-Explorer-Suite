// next= a same-origin Nexo path (/nexo/<path> or /nexo-staging/<path>) on the sign-in, forgot-password and invitation
// pages: accepted and returned to when done; every other path refused (the invitation link stays the one app path the
// sign-in page follows). Nexo is outside Admin's base path, so the browser is sent there by a full navigation.
// Synthetic data only.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { leaveApp, startAppSession, previewInvitation, signedInEmail, signInMock, acceptMock, acceptMineMock } = vi.hoisted(() => ({
  leaveApp: vi.fn(), startAppSession: vi.fn(), previewInvitation: vi.fn(), signedInEmail: vi.fn(),
  signInMock: vi.fn(), acceptMock: vi.fn(), acceptMineMock: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }), headers: async () => new Headers() }));
vi.mock("@/lib/environment", () => ({ getEnvironment: () => ({ mock: false, url: "https://example.test", anonKey: "anon-example" }) }));
vi.mock("@/lib/app-sign-in", () => ({ startAppSession, endSignedInSession: vi.fn() }));
vi.mock("@/lib/action-redirect", () => ({ redirectAfterAction: async (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/leave-app", () => ({ leaveApp }));
vi.mock("@/lib/data/people", async (original) => ({ ...await original<object>(), previewInvitation, signedInEmail }));

const { nexoReturnPath, signInNext } = await import("@/lib/return-path");
const { signIn } = await import("@/app/actions");
const { default: SignInPage } = await import("@/app/sign-in/page");
const { default: ForgotPasswordPage } = await import("@/app/forgot-password/page");
const { default: InvitePage } = await import("@/app/invite/[token]/page");

const NEXO = "/nexo/?dataset=44444444-4444-4444-8444-444444444444";
const STAGING = "/nexo-staging/projects/example-7?tab=data#chart";
const TOKEN = "a".repeat(64);
const INVITE = `/invite/${TOKEN}`;
const REFUSED = ["", "/nexo", "/nexo-staging", "/nexox/", "/nexo-stagingx/a", "/admin/pipeline", "/admin-staging/nexo/", "/pipeline", "nexo/a",
  "//evil.example/nexo/", "https://evil.example/nexo/", "https://lab.example.test/nexo/", "/nexo/../admin/people", "/nexo/%2e%2e/admin",
  "/nexo/./a", "/nexo\\evil", "/nexo/a b", "/nexo/\nx", `/nexo/${"a".repeat(2100)}`, "javascript:alert(1)//nexo/"];

beforeEach(() => {
  vi.clearAllMocks();
  startAppSession.mockResolvedValue({ ok: true });
});

describe("the rule", () => {
  it("accepts /nexo/<path> and /nexo-staging/<path> with their query and fragment, unchanged", () => {
    for (const path of ["/nexo/", NEXO, STAGING, "/nexo-staging/", "/nexo/a%20b"]) expect(nexoReturnPath(path), path).toBe(path);
  });
  it("refuses everything else: other paths, other origins, dot segments, backslashes, spaces, non-strings", () => {
    for (const path of REFUSED) expect(nexoReturnPath(path), path).toBeUndefined();
    for (const value of [undefined, null, 7, [NEXO], { path: NEXO }]) expect(nexoReturnPath(value), String(value)).toBeUndefined();
  });
  it("the sign-in page's next: a Nexo path, an invitation link, or an invitation link that continues to a Nexo path", () => {
    const chained = `${INVITE}?next=${encodeURIComponent(NEXO)}`;
    for (const path of [NEXO, STAGING, INVITE, chained]) expect(signInNext(path), path).toBe(path);
    for (const path of [...REFUSED, `${INVITE}?next=/admin/people`, `${INVITE}?next=${encodeURIComponent("/admin/x")}`, `${INVITE}?next=${NEXO}`, `${INVITE}/x`, "/invite/abc"]) {
      expect(signInNext(path), path).toBeUndefined();
    }
  });
});

describe("sign-in", () => {
  const form = (next: string) => { const data = new FormData(); data.set("email", "rowan@cedar.example.test"); data.set("password", "synthetic"); data.set("next", next); return data; };
  it("after signing in, hands a Nexo path back to the form to leave the app for (not an in-app redirect)", async () => {
    for (const path of [NEXO, STAGING]) expect(await signIn({}, form(path)), path).toEqual({ next: path });
  });
  it("follows an invitation link (with or without a Nexo continuation); anything else goes to Choose client", async () => {
    const chained = `${INVITE}?next=${encodeURIComponent(NEXO)}`;
    await expect(signIn({}, form(chained))).rejects.toThrow(`redirect:${chained}`);
    await expect(signIn({}, form(INVITE))).rejects.toThrow(`redirect:${INVITE}`);
    for (const path of REFUSED) await expect(signIn({}, form(path)), path).rejects.toThrow(/^redirect:\/choose-client$/);
  });
  it("the page keeps an accepted Nexo next in the form, says where it returns, and carries it to Forgot password", async () => {
    const { container } = render(await SignInPage({ searchParams: Promise.resolve({ next: NEXO }) }));
    expect(container.querySelector('input[name="next"]')).toHaveValue(NEXO);
    expect(screen.getByText(/you will return to Nexo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", `/forgot-password?next=${encodeURIComponent(NEXO)}`);
  });
  it("the page drops any other next", async () => {
    for (const next of ["/admin/pipeline", "https://evil.example/nexo/", "//evil.example/nexo/", "/nexo/../admin"]) {
      const { container, unmount } = render(await SignInPage({ searchParams: Promise.resolve({ next }) }));
      expect(container.querySelector('input[name="next"]'), next).toBeNull();
      expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
      unmount();
    }
  });
  it("the form leaves the app for the Nexo path the action hands back, and offers a link to it", async () => {
    vi.resetModules();
    vi.doMock("@/app/actions", () => ({ signIn: signInMock, enterDemo: vi.fn() }));
    signInMock.mockResolvedValue({ next: NEXO });
    const { SignInForm } = await import("@/components/sign-in-form");
    const user = userEvent.setup();
    render(<SignInForm mock={false} next={NEXO} />);
    await user.type(screen.getByLabelText("Email"), "rowan@cedar.example.test");
    await user.type(screen.getByLabelText("Password"), "synthetic");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(leaveApp).toHaveBeenCalledExactlyOnceWith(NEXO));
    expect(screen.getByRole("link", { name: "Continue to Nexo →" })).toHaveAttribute("href", NEXO);
    vi.doUnmock("@/app/actions");
  });
});

describe("forgot password", () => {
  it("carries an accepted Nexo next back to sign in", async () => {
    render(await ForgotPasswordPage({ searchParams: Promise.resolve({ next: STAGING }) }));
    expect(screen.getByRole("link", { name: "Sign in →" })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(STAGING)}`);
  });
  it("drops any other next", async () => {
    for (const next of ["/admin/people", "https://evil.example/nexo/", INVITE]) {
      const { unmount } = render(await ForgotPasswordPage({ searchParams: Promise.resolve({ next }) }));
      expect(screen.getByRole("link", { name: "Sign in →" }), next).toHaveAttribute("href", "/sign-in");
      unmount();
    }
  });
});

describe("invitation", () => {
  const preview = (hasAccount: boolean) => ({ email: "kai@cedar.example.test", target: "Viewer of Example Cedar", expiresAt: "2026-11-17T12:00:00Z", hasAccount });
  const page = (next?: string) => InvitePage({ params: Promise.resolve({ token: TOKEN }), searchParams: Promise.resolve(next === undefined ? {} : { next }) });

  it("an existing account not signed in: Sign in to accept returns to the invitation, then to Nexo", async () => {
    previewInvitation.mockResolvedValue(preview(true));
    signedInEmail.mockResolvedValue(null);
    render(await page(NEXO));
    expect(screen.getByRole("link", { name: "Sign in to accept →" })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(`${INVITE}?next=${encodeURIComponent(NEXO)}`)}`);
  });
  it("any other next is dropped: Sign in to accept returns to the invitation only", async () => {
    previewInvitation.mockResolvedValue(preview(true));
    signedInEmail.mockResolvedValue(null);
    for (const next of [undefined, "/admin/people", "https://evil.example/nexo/"]) {
      const { unmount } = render(await page(next));
      expect(screen.getByRole("link", { name: "Sign in to accept →" }), String(next)).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(INVITE)}`);
      unmount();
    }
  });
  it("a new account: after setting the password, Sign in carries the Nexo next", async () => {
    vi.resetModules();
    vi.doMock("@/app/invite/[token]/actions", () => ({ acceptInvitationAction: acceptMock, acceptMyInvitationAction: acceptMineMock }));
    acceptMock.mockResolvedValue({ email: "kai@cedar.example.test" });
    const { AcceptForm } = await import("@/app/invite/[token]/accept-form");
    const user = userEvent.setup();
    render(<AcceptForm token={TOKEN} email="kai@cedar.example.test" minPassword={12} next={NEXO} />);
    await user.type(screen.getByLabelText("Password"), "synthetic-long-pass");
    await user.type(screen.getByLabelText("Repeat password"), "synthetic-long-pass");
    await user.click(screen.getByRole("button", { name: "Set password and join" }));
    expect(await screen.findByRole("link", { name: "Sign in →" })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(NEXO)}`);
    vi.doUnmock("@/app/invite/[token]/actions");
  });
  it("signed in as the invited account: after accepting, Continue goes to the Nexo path", async () => {
    vi.resetModules();
    vi.doMock("@/app/invite/[token]/actions", () => ({ acceptInvitationAction: acceptMock, acceptMyInvitationAction: acceptMineMock }));
    acceptMineMock.mockResolvedValue({ email: "kai@cedar.example.test" });
    const { AcceptMineForm } = await import("@/app/invite/[token]/accept-form");
    const user = userEvent.setup();
    render(<AcceptMineForm token={TOKEN} target="Viewer of Example Cedar" next={NEXO} />);
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByRole("link", { name: "Continue to Nexo →" })).toHaveAttribute("href", NEXO);
    vi.doUnmock("@/app/invite/[token]/actions");
  });
});
