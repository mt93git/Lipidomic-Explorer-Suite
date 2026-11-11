import { BASE_PATH } from "./base-path";

// Scoped to the base path, so /admin and /admin-staging sessions on one host never mix.
export const appCookieScope = {
  path: BASE_PATH,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
export const authCookieOptions = { name: "le-admin-auth", ...appCookieScope };
export const preferenceCookieOptions = {
  ...appCookieScope,
  maxAge: 60 * 60 * 24 * 30,
};
export const clientCookie = "le-admin-client";
export const viewCookie = "le-admin-demo-view";
export const signedOutCookie = "le-admin-demo-signed-out";
