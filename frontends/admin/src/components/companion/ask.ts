import { withBasePath } from "@/lib/base-path";

// The companion's chat, Nexo's contract (frontends/nexo-api companion route): POST <NEXO_API_BASE>/v1/companion/ask with
// {question} and the signed-in person's access token as Authorization: Bearer; the reply is {text, label, grounded}.
// The token comes from Admin's own same-origin GET <basePath>/api/session-token (src/lib/session-token.ts). The API's
// optional `screen` only knows Nexo's five screens (it answers 422 to anything else) and `card` names a Nexo card, so
// Admin sends neither.
export type CompanionAnswer = { text: string; label: string; grounded: boolean };
export const MAX_QUESTION = 500;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// Kept until 60 s before it expires; a 401 from the API fetches a new one once.
let cached: { token: string; expiresAt: number } | null = null;
export const forgetCompanionToken = () => { cached = null; };

async function accessToken(fetcher: Fetch, fresh: boolean): Promise<string | null> {
  if (!fresh && cached && Date.now() < (cached.expiresAt - 60) * 1000) return cached.token;
  cached = null;
  const response = await fetcher(withBasePath("/api/session-token"), { method: "GET", credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return null;
  const value = await response.json().catch(() => null) as { accessToken?: unknown; expiresAt?: unknown } | null;
  if (typeof value?.accessToken !== "string" || !value.accessToken || typeof value.expiresAt !== "number") return null;
  cached = { token: value.accessToken, expiresAt: value.expiresAt };
  return cached.token;
}

/** Throws on an empty or too long question (no request), without a token (signed out, demo mode) or on any failed answer. */
export async function askCompanion(question: string, apiBase: string, fetcher: Fetch = (url, init) => fetch(url, init)): Promise<CompanionAnswer> {
  const q = question.trim();
  if (!q || q.length > MAX_QUESTION) throw new Error("Ask a question of 1 to 500 characters.");
  for (const fresh of [false, true]) {
    const token = await accessToken(fetcher, fresh);
    if (!token) throw new Error("No access token.");
    const response = await fetcher(`${apiBase.replace(/\/+$/, "")}/v1/companion/ask`, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ question: q }),
    });
    if (response.status === 401 && !fresh) continue;
    if (!response.ok) throw new Error(`The guide answered ${response.status}.`);
    const value = await response.json() as { text?: unknown; label?: unknown; grounded?: unknown };
    if (typeof value?.text !== "string") throw new Error("The guide gave no answer.");
    return { text: value.text, label: typeof value.label === "string" ? value.label : "", grounded: value.grounded === true };
  }
  throw new Error("The guide refused the access token.");
}
