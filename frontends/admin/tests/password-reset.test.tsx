// Forgotten password (decision 4): the Forgot password action's neutral answer and limit, the Reset password action
// (the token is checked only on the form's POST, the password rules first, the two-step code for a lab account, the
// expired link, sign-out and redirect), the demo's single-use links, the pages and the email template. Synthetic data.
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientCookie, signedOutCookie } from "@/lib/auth-cookies";

vi.mock("server-only", () => ({}));
const { headerValues, setCookie } = vi.hoisted(() => ({ headerValues: new Map<string, string>(), setCookie: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: (name: string) => headerValues.get(name) ?? null })),
  cookies: vi.fn(async () => ({ set: setCookie })),
}));
let environment = { mock: false, url: "https://example.test", anonKey: "anon-example" };
vi.mock("@/lib/environment", () => ({ getEnvironment: vi.fn(() => environment) }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn(), createAnonAuthClient: vi.fn() }));
vi.mock("@/lib/action-redirect", () => ({ redirectAfterAction: async (url: string) => { throw new Error(`redirect:${url}`); } }));

const { forgotPasswordAction } = await import("@/app/forgot-password/actions");
const { resetPasswordAction } = await import("@/app/reset-password/actions");
const { createAdminClient, createAnonAuthClient } = await import("@/lib/supabase/server");
const { ACTIVATE_DONE, issueDemoResetLink, resetLimits, RESET_DONE, RESET_SENT, spendDemoResetLink, validateNewPassword } = await import("@/lib/password-reset");
const { default: ResetPasswordPage } = await import("@/app/reset-password/page");
const { default: ActivatePage } = await import("@/app/activate/page");
const { default: SignInPage } = await import("@/app/sign-in/page");
const { ForgotForm } = await import("@/app/forgot-password/forgot-form");

type Failure = { name?: string; status?: number; code?: string; message?: string } | null;
function fakeAuth({ mfa = false, recover = null as Failure, verify = null as Failure, update = null as Failure } = {}) {
  const auth = {
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: recover }),
    verifyOtp: vi.fn().mockResolvedValue({ data: verify ? { user: null, session: null } : { user: { id: "example-user" }, session: {} }, error: verify }),
    updateUser: vi.fn().mockResolvedValue({ data: update ? { user: null } : { user: { id: "example-user" } }, error: update }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: mfa ? "aal2" : "aal1" }, error: null }),
      listFactors: vi.fn().mockResolvedValue({ data: { totp: [{ id: "example-factor", status: "verified" }] }, error: null }),
      challengeAndVerify: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  };
  vi.mocked(createAnonAuthClient).mockReturnValue({ auth } as never);
  vi.mocked(createAdminClient).mockResolvedValue({ auth } as never);
  return auth;
}
const emailForm = (email: string) => { const form = new FormData(); form.set("email", email); return form; };
const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef01234567";
const resetForm = (values: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ token_hash: TOKEN, password: "correct horse battery", confirm: "correct horse battery", code: "", ...values })) form.set(key, value);
  return form;
};

beforeEach(() => {
  vi.clearAllMocks();
  environment = { mock: false, url: "https://example.test", anonKey: "anon-example" };
  headerValues.clear();
  headerValues.set("x-forwarded-for", "203.0.113.7");
  resetLimits.ip.reset();
  resetLimits.email.reset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("Forgot password", () => {
  it("asks GoTrue for the trimmed, lower-cased email and answers with the neutral message", async () => {
    const auth = fakeAuth();
    expect(await forgotPasswordAction({}, emailForm(" Kai@Cedar.Example.Test "))).toEqual({ outcome: "sent", attempt: 1 });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("kai@cedar.example.test");
  });
  it("gives the same answer for an unknown email and for GoTrue refusals that only an existing account can cause", async () => {
    fakeAuth();
    const known = await forgotPasswordAction({}, emailForm("kai@cedar.example.test"));
    expect(await forgotPasswordAction({}, emailForm("nobody@cedar.example.test"))).toEqual(known);
    fakeAuth({ recover: { name: "AuthApiError", status: 500, code: "unexpected_failure", message: "Error sending recovery email" } });
    expect(await forgotPasswordAction({}, emailForm("robin@larch.example.test"))).toEqual(known);
    fakeAuth({ recover: { name: "AuthApiError", status: 429, code: "over_email_send_rate_limit" } });
    expect(await forgotPasswordAction({}, emailForm("sam@larch.example.test"))).toEqual(known);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("example.test");
  });
  it("says it is unavailable only when GoTrue cannot be used at all", async () => {
    fakeAuth({ recover: { name: "AuthRetryableFetchError", status: 503 } });
    expect((await forgotPasswordAction({}, emailForm("kai@cedar.example.test"))).outcome).toBe("unavailable");
    fakeAuth({ recover: { name: "AuthApiError", status: 401, message: "Invalid API key" } });
    expect((await forgotPasswordAction({}, emailForm("kai@cedar.example.test"))).outcome).toBe("unavailable");
  });
  it("names a malformed email without asking GoTrue", async () => {
    const auth = fakeAuth();
    expect(await forgotPasswordAction({}, emailForm("kai@"))).toEqual({ error: "Enter a valid email address, like name@example.org.", email: "kai@", attempt: 1 });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("limits one email to 3 requests a day and one address to 5 an hour, before GoTrue is asked", async () => {
    const auth = fakeAuth();
    for (let i = 0; i < 3; i += 1) expect((await forgotPasswordAction({}, emailForm("kai@cedar.example.test"))).outcome).toBe("sent");
    expect((await forgotPasswordAction({}, emailForm("kai@cedar.example.test"))).outcome).toBe("limited");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(3);
    expect((await forgotPasswordAction({}, emailForm("robin@larch.example.test"))).outcome).toBe("sent");
    headerValues.set("x-forwarded-for", "198.51.100.2");
    for (let i = 0; i < 5; i += 1) await forgotPasswordAction({}, emailForm(`person${i}@larch.example.test`));
    expect((await forgotPasswordAction({}, emailForm("other@larch.example.test"))).outcome).toBe("limited");
  });
  it("in the demo sends nothing and offers a single-use link", async () => {
    environment = { mock: true, url: "", anonKey: "" };
    const state = await forgotPasswordAction({}, emailForm("kai@cedar.example.test"));
    expect(state.outcome).toBe("sent");
    expect(state.demoLink).toMatch(/^\/reset-password\?token_hash=example-[0-9a-f-]{36}&type=recovery$/);
    expect(createAnonAuthClient).not.toHaveBeenCalled();
  });
  it("shows the neutral message after a send", async () => {
    render(<ForgotForm sentMessage={RESET_SENT} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "username");
    expect(RESET_SENT).toBe("If that email has an account, a reset link is on its way. It works once, for one hour.");
  });
});

describe("Reset password", () => {
  it("opening the link does not check or spend the token", async () => {
    fakeAuth();
    render(await ResetPasswordPage({ searchParams: Promise.resolve({ token_hash: TOKEN, type: "recovery" }) }));
    expect(screen.getByRole("heading", { name: "Choose a new password." })).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("minlength", "12");
    expect(document.querySelector("input[name=token_hash]")).toHaveValue(TOKEN);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("a malformed link shows the expired message and the way back", async () => {
    render(await ResetPasswordPage({ searchParams: Promise.resolve({ token_hash: "x", type: "signup" }) }));
    expect(screen.getByRole("heading", { name: "This reset link no longer works." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/forgot-password");
  });
  it("checks the token on POST, changes the password, signs out everywhere and redirects", async () => {
    const auth = fakeAuth();
    await expect(resetPasswordAction({}, resetForm())).rejects.toThrow("redirect:/sign-in?reset=done");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: "recovery" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "correct horse battery" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
    expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0]);
    expect(setCookie).toHaveBeenCalledWith(signedOutCookie, "1", expect.objectContaining({ path: "/admin" }));
    expect(setCookie).toHaveBeenCalledWith(clientCookie, "", expect.objectContaining({ maxAge: 0 }));
  });
  it("refuses a mismatch or a short password without spending the link", async () => {
    const auth = fakeAuth();
    expect(await resetPasswordAction({}, resetForm({ confirm: "correct horse battery!" }))).toEqual({ error: "The two passwords do not match.", attempt: 1 });
    expect(await resetPasswordAction({}, resetForm({ password: "short", confirm: "short" }))).toEqual({ error: "Choose a password of at least 12 characters.", attempt: 1 });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(validateNewPassword("x".repeat(12), "x".repeat(12))).toBeNull();
  });
  it("an expired or used token gives the expired state, and nothing is changed", async () => {
    const auth = fakeAuth({ verify: { name: "AuthApiError", status: 403, code: "otp_expired", message: "Email link is invalid or has expired" } });
    expect(await resetPasswordAction({}, resetForm())).toEqual({ expired: true, attempt: 1 });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(await resetPasswordAction({}, resetForm({ token_hash: "not a token" }))).toEqual({ expired: true, attempt: 1 });
  });
  it("keeps the form when GoTrue does not answer (the link is not spent)", async () => {
    fakeAuth({ verify: { name: "AuthRetryableFetchError", status: 502 } });
    expect(await resetPasswordAction({}, resetForm())).toEqual({ error: "Password reset is unavailable right now. Please try again in a few minutes.", spent: false, attempt: 1 });
  });
  it("a lab account changes its password only with its two-step code", async () => {
    let auth = fakeAuth({ mfa: true });
    const missing = await resetPasswordAction({}, resetForm());
    expect(missing).toMatchObject({ spent: true, error: expect.stringContaining("enter the six-digit code") });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    auth = fakeAuth({ mfa: true });
    await expect(resetPasswordAction({}, resetForm({ code: "123456" }))).rejects.toThrow("redirect:/sign-in?reset=done");
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "example-factor", code: "123456" });
    expect(auth.mfa.challengeAndVerify.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
  });
  it("a refused update ends the recovery session and says the link is used", async () => {
    const auth = fakeAuth({ update: { name: "AuthApiError", status: 422, code: "same_password" } });
    expect(await resetPasswordAction({}, resetForm())).toEqual({ error: "That is already your password, so nothing changed. Sign in with it.", spent: true, attempt: 1 });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("in the demo a link works once", async () => {
    environment = { mock: true, url: "", anonKey: "" };
    const token = new URLSearchParams(issueDemoResetLink().split("?")[1]).get("token_hash") as string;
    await expect(resetPasswordAction({}, resetForm({ token_hash: token }))).rejects.toThrow("redirect:/sign-in?reset=done");
    expect(await resetPasswordAction({}, resetForm({ token_hash: token }))).toEqual({ expired: true, attempt: 1 });
    expect(createAdminClient).not.toHaveBeenCalled();
    const old = new URLSearchParams(issueDemoResetLink(Date.now() - 3_600_000).split("?")[1]).get("token_hash") as string;
    expect(spendDemoResetLink(old)).toBe(false);
  });
});

// The activation email's link (0029, activation.ts): the same token, action and GoTrue steps, with welcome words.
describe("Activate", () => {
  it("opening the link checks nothing; the welcome form has no two-step field", async () => {
    fakeAuth();
    render(await ActivatePage({ searchParams: Promise.resolve({ token_hash: TOKEN, type: "recovery" }) }));
    expect(screen.getByRole("heading", { name: /^Welcome to Lipidomics\s· Choose your password$/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "12");
    expect(screen.queryByLabelText("Two-step code")).not.toBeInTheDocument();
    expect(document.querySelector("input[name=purpose]")).toHaveValue("activate");
    expect(screen.getByRole("button", { name: "Choose password" })).toBeInTheDocument();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("a malformed link says to ask the lab for a new email", async () => {
    render(await ActivatePage({ searchParams: Promise.resolve({ token_hash: "x", type: "recovery" }) }));
    expect(screen.getByRole("heading", { name: "This activation link no longer works." })).toBeInTheDocument();
    expect(screen.getByText(/Ask the lab to send you a new activation email/)).toBeInTheDocument();
  });
  it("on POST: the reset steps (verify, update, sign out everywhere), then sign-in says what comes next", async () => {
    const auth = fakeAuth();
    await expect(resetPasswordAction({}, resetForm({ purpose: "activate" }))).rejects.toThrow("redirect:/sign-in?activated=done");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: "recovery" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "correct horse battery" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    render(await SignInPage({ searchParams: Promise.resolve({ activated: "done" }) }));
    expect(screen.getByRole("status")).toHaveTextContent(ACTIVATE_DONE);
    expect(ACTIVATE_DONE).not.toMatch(/two-step/);
  });
});

describe("Sign in and the email", () => {
  it("links to Forgot password and confirms a changed password", async () => {
    render(await SignInPage({ searchParams: Promise.resolve({ reset: "done" }) }));
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("status")).toHaveTextContent(RESET_DONE);
    expect(RESET_DONE).toBe("Password changed. Sign in with your new password.");
  });
  it("the recovery template links to the app, not GoTrue, with no images or tracking", () => {
    const html = readFileSync(path.join(process.cwd(), "auth-email/recovery.html"), "utf8");
    expect(html).toContain('href="{{ .SiteURL }}/admin/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery"');
    expect(html).not.toMatch(/ConfirmationURL|\/verify|<img|<script|utm_/i);
    expect(html).toContain("Libreros Lab lipidomics service");
    expect(html).toMatch(/works once, for one hour/);
    expect(html).toMatch(/did not ask/);
  });
});
