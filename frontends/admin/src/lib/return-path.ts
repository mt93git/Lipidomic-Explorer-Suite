// Where the sign-in, forgot-password and invitation pages may send someone back to (next=). Pure; server and client.
//
// A Nexo path: /nexo/<path> or /nexo-staging/<path> on this origin (production and staging Nexo), with its query and
// fragment. Accepted only when the URL parser keeps it exactly as given, so no other origin, no "//host", no dot
// segment (also percent-encoded), no backslash and no unencoded space or control character gets through.
const NEXO = /^\/(?:nexo|nexo-staging)\//;
const BASE = "http://return.invalid";

export function nexoReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048 || !NEXO.test(value)) return undefined;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return undefined;
  }
  return url.origin === BASE && NEXO.test(url.pathname) && `${url.pathname}${url.search}${url.hash}` === value ? value : undefined;
}

// An invitation link, optionally continuing to a Nexo path once accepted: /invite/<token>?next=<encoded Nexo path>.
export const invitationReturn = (invitation: string, nexo?: string) => nexo ? `${invitation}?next=${encodeURIComponent(nexo)}` : invitation;

const INVITE = /^(\/invite\/[0-9a-f]{64})(?:\?next=([^&#]+))?$/;

// The sign-in page's next: a Nexo path, an invitation link, or an invitation link that continues to a Nexo path.
export function signInNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (nexoReturnPath(value)) return value;
  const match = INVITE.exec(value);
  if (!match) return undefined;
  if (match[2] === undefined) return value;
  let nexo: string;
  try {
    nexo = decodeURIComponent(match[2]);
  } catch {
    return undefined;
  }
  return nexoReturnPath(nexo) && invitationReturn(match[1], nexo) === value ? value : undefined;
}

// A same-origin path to Admin's sign-in page that returns to next when given.
export const signInHref = (next?: string) => next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
