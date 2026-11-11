// The app's URL base path (Next.js basePath), chosen at build time: ADMIN_BASE_PATH, default "/admin" (production;
// staging builds with "/admin-staging" on the same host). next.config.ts validates it with parseBasePath, sets
// basePath and inlines it as NEXT_PUBLIC_ADMIN_BASE_PATH; everything in src/ that needs the prefix reads BASE_PATH here.
// Pure: no React, no server imports (next.config.ts, server and client code all import it).
export const DEFAULT_BASE_PATH = "/admin";

// One or more "/segment"s: starts with "/", never ends with one, no empty, "." or ".." segment.
const SHAPE = /^(\/(?!\.\.?(?:\/|$))[A-Za-z0-9._~-]+)+$/;

export function parseBasePath(value: string | undefined): string {
  if (value === undefined || value === "") return DEFAULT_BASE_PATH;
  if (!SHAPE.test(value)) throw new Error(`ADMIN_BASE_PATH must start with "/" and not end with "/", like "/admin" (got ${JSON.stringify(value)}).`);
  return value;
}

export const BASE_PATH = parseBasePath(process.env.NEXT_PUBLIC_ADMIN_BASE_PATH);

// For URLs Next.js does not prefix itself: plain <a href>/<form action>, Location headers, links shown to copy.
export const withBasePath = (path: string) => `${BASE_PATH}${path}`;

// usePathname() can include the base path (it does not in the app router today); the app's own path either way.
export function stripBasePath(pathname: string): string {
  const rest = pathname === BASE_PATH ? "" : pathname.startsWith(`${BASE_PATH}/`) ? pathname.slice(BASE_PATH.length) : pathname;
  return rest || "/";
}

// `next start` evaluates next.config.ts again: it serves the base path its build recorded (built), so a staging build
// started without ADMIN_BASE_PATH still serves /admin-staging. A different ADMIN_BASE_PATH at start is an error, not
// a silent mix of the two (the client bundles and the cookie path were fixed at build time).
export function servedBasePath(built: string | undefined, value: string | undefined): string {
  if (built === undefined) return parseBasePath(value);
  if (value && parseBasePath(value) !== built) throw new Error(`This build serves ${built}; rebuild with ADMIN_BASE_PATH=${value} to serve that instead.`);
  return built;
}
