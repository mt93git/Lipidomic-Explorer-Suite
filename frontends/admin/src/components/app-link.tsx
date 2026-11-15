// eslint-disable-next-line no-restricted-imports -- the one place that wraps next/link
import NextLink from "next/link";
import type { ComponentProps } from "react";

// Every Admin link: next/link without prefetching. A back office gains little from prefetching, and it was a suspect
// in the stalled server-action responses seen on staging (2026-11-09). Turning it off everywhere did not remove
// them (docs/admin/admin-pilot-simulation.md), but it keeps each page view to one request.
export default function Link(props: Omit<ComponentProps<typeof NextLink>, "prefetch">) {
  return <NextLink {...props} prefetch={false} />;
}
