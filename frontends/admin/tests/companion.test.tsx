import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { Companion } from "@/components/companion/Companion";
import { askCompanion, forgetCompanionToken, MAX_QUESTION } from "@/components/companion/ask";
import { CompanionScreen } from "@/components/companion/screen";
import { demoSession } from "@/lib/demo";
import SignInPage from "@/app/sign-in/page";

// The neutrophil companion in Admin's client zone (src/components/companion, copied from Nexo).
const pathname = vi.hoisted(() => ({ current: "/client/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions", () => ({ signOut: vi.fn(), switchView: vi.fn(), signIn: vi.fn(), enterDemo: vi.fn() }));

const client = { ...demoSession, userId: "u-client", view: "client" as const, role: "Requester", selectedClient: demoSession.clients[0] };
const dock = () => screen.queryByRole("button", { name: "Neutrophil guide: show a tip for this screen" });
const chatButton = () => screen.queryByRole("button", { name: "Chat with the neutrophil guide" });
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const allScreens = "home,request,order,shipping,results,choose,notifications,sign-in,request-access,forgot-password,reset-password,activate,invite";
const seen = (user: string) => { localStorage.setItem(`admin-companion.seen.${user}`, "1"); localStorage.setItem(`admin-companion.tipped.${user}`, allScreens); };

beforeEach(() => {
  localStorage.clear();
  forgetCompanionToken();
  pathname.current = "/client/home";
  // Reduced motion: no flights, so every step lands at once (the prototype's reduced-motion path).
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
});

describe("companion in the client zone", () => {
  // First in the file: the entrance plays once per page life.
  it("greets a client member on the first signed-in visit and remembers it per user", async () => {
    render(<AppShell session={client}>Home</AppShell>);
    expect(await screen.findByText("Hi, I'm your lab guide")).toBeInTheDocument();
    expect(localStorage.getItem("admin-companion.tipped.u-client")).toBe("home");
  });

  it("renders no companion at all for lab staff", () => {
    pathname.current = "/pipeline";
    localStorage.clear();
    render(<AppShell session={demoSession}>Pipeline</AppShell>);
    expect(dock()).not.toBeInTheDocument();
    expect(screen.queryByText("Hi, I'm your lab guide")).not.toBeInTheDocument();
    pathname.current = "/orders/ORD040";
    render(<AppShell session={{ ...demoSession, mock: false }}><CompanionScreen screen="results" />Order</AppShell>);
    expect(dock()).not.toBeInTheDocument();
  });

  it("docks in the client top bar, outside the phone Menu, and brings out the screen's tip with Chat", async () => {
    seen("u-client");
    render(<AppShell session={client}>Home</AppShell>);
    const banner = screen.getAllByRole("banner")[0];
    expect(await within(banner).findByRole("button", { name: "Neutrophil guide: show a tip for this screen" })).toBeVisible();
    expect(document.getElementById("topbar-menu")).not.toContainElement(dock());
    await userEvent.click(dock()!);
    const tip = await screen.findByRole("dialog", { name: "Your orders" });
    expect(tip).toHaveTextContent("Released datasets are listed under Datasets.");
    expect(within(tip).getByRole("button", { name: "Chat with the neutrophil guide" })).toBeVisible();
  });

  it("gives the results tip, with Open in Nexo, on a released order", async () => {
    seen("u-client");
    pathname.current = "/orders/ORD040";
    render(<AppShell session={client}><CompanionScreen screen="results" />Order</AppShell>);
    await userEvent.click(dock()!);
    expect(await screen.findByRole("dialog", { name: "Your results" })).toHaveTextContent("Open in Nexo");
  });

  it("shows tips but no chat on the signed-out sign-in page", async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("main")).toContainElement(dock());
    await userEvent.click(dock()!);
    expect(await screen.findByRole("dialog", { name: "Sign in" })).toHaveTextContent("Request access below.");
    expect(chatButton()).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Question for the guide" })).not.toBeInTheDocument();
  });

  it("shows Nexo's failure text when there is no token (demo mode)", async () => {
    seen("u-client");
    const fetcher = vi.fn(async () => json(401, { error: "signed_out" }));
    vi.stubGlobal("fetch", fetcher);
    render(<Companion screen="home" user="u-client" apiBase="/api" />);
    await userEvent.click(dock()!);
    await userEvent.click(await screen.findByRole("button", { name: "Chat with the neutrophil guide" }));
    const input = screen.getByRole("textbox", { name: "Question for the guide" });
    expect(input).toHaveAttribute("maxLength", String(MAX_QUESTION));
    await userEvent.type(input, "What is a cardiolipin?{Enter}");
    expect(await screen.findByText("The guide could not answer just now. Try again in a moment.", undefined, { timeout: 5000 })).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual([expect.stringMatching(/\/api\/session-token$/), expect.objectContaining({ method: "GET" })]);
  });
});

describe("companion chat per person", () => {
  it("starts empty, with a new token, for another person signing in on the same tab", async () => {
    seen("u-a"); seen("u-b");
    let tokens = 0;
    const fetcher = vi.fn(async (url: string) => url.endsWith("/api/session-token") ? json(200, { accessToken: `tok-${++tokens}`, expiresAt: Date.now() / 1000 + 3600 })
      : json(200, { text: "An answer for A", label: "", grounded: true }));
    vi.stubGlobal("fetch", fetcher);
    const first = render(<Companion screen="home" user="u-a" />);
    await userEvent.click(dock()!);
    await userEvent.click(await screen.findByRole("button", { name: "Chat with the neutrophil guide" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Question for the guide" }), "A's question{Enter}");
    expect(await screen.findByText("An answer for A", undefined, { timeout: 5000 })).toBeVisible();
    first.unmount();
    render(<Companion screen="home" user="u-b" />);
    await userEvent.click(dock()!);
    await userEvent.click(await screen.findByRole("button", { name: "Chat with the neutrophil guide" }));
    expect(screen.getByRole("region", { name: "Chat with the neutrophil guide" })).not.toHaveTextContent("A's question");
    await userEvent.type(screen.getByRole("textbox", { name: "Question for the guide" }), "B's question{Enter}");
    await screen.findByText("B's question", undefined, { timeout: 5000 });
    await waitFor(() => expect(fetcher.mock.calls.filter(([u]) => u.endsWith("/api/session-token"))).toHaveLength(2));
  });
});

describe("askCompanion", () => {
  it("sends the session token as X-Nexo-Admin-Token and only the question, and returns the answer", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      void init;
      return url.endsWith("/api/session-token") ? json(200, { accessToken: "tok-1", expiresAt: Date.now() / 1000 + 3600 })
        : json(200, { text: "Definition\nCL is in the inner membrane.", label: "Knowledge base", grounded: true });
    });
    const answer = await askCompanion("  What is CL?  ", "/nexo-staging/api/", fetcher);
    expect(answer).toEqual({ text: "Definition\nCL is in the inner membrane.", label: "Knowledge base", grounded: true });
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe("/nexo-staging/api/v1/companion/ask");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-Nexo-Admin-Token": "tok-1" });
    expect(JSON.parse(String(init.body))).toEqual({ question: "What is CL?" });
    // The token is kept: a second question asks Admin for nothing.
    await askCompanion("Another?", "/api", fetcher);
    expect(fetcher.mock.calls.filter(([u]) => u.endsWith("/api/session-token"))).toHaveLength(1);
  });

  it("fetches a new token once when the API answers 401", async () => {
    let tokens = 0;
    const fetcher = vi.fn(async (url: string) => url.endsWith("/api/session-token") ? json(200, { accessToken: `tok-${++tokens}`, expiresAt: Date.now() / 1000 + 3600 })
      : tokens === 1 ? json(401, { error: "admin_auth_required" }) : json(200, { text: "ok", label: "", grounded: false }));
    await expect(askCompanion("Hi", "/api", fetcher)).resolves.toMatchObject({ text: "ok" });
    expect(fetcher.mock.calls.map(([u]) => u.replace(/^.*\/api\/session-token$/, "token"))).toEqual(["token", "/api/v1/companion/ask", "token", "/api/v1/companion/ask"]);
  });

  it("refuses an empty question or one over 500 characters without a request", async () => {
    const fetcher = vi.fn();
    await expect(askCompanion("x".repeat(MAX_QUESTION + 1), "/api", fetcher)).rejects.toThrow("1 to 500");
    await expect(askCompanion("   ", "/api", fetcher)).rejects.toThrow("1 to 500");
    expect(fetcher).not.toHaveBeenCalled();
    expect(MAX_QUESTION).toBe(500);
  });
});
