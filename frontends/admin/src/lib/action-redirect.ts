import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function redirectAfterAction(path: string): Promise<never> {
  // In Next 15, enhanced actions apply basePath in the client router; plain
  // form submissions use the action's Location header verbatim.
  const requestHeaders = await headers();
  redirect(requestHeaders.has("next-action") ? path : `/admin${path}`);
}
