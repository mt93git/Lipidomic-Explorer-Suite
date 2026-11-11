import type { NextConfig } from "next";
import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBasePath, servedBasePath } from "./src/lib/base-path";

// The base path the build in .next recorded, if there is one.
function builtBasePath(): string | undefined {
  try {
    const { basePath } = JSON.parse(readFileSync(path.join(process.cwd(), ".next", "routes-manifest.json"), "utf8")) as { basePath?: unknown };
    return typeof basePath === "string" && basePath ? basePath : undefined;
  } catch {
    return undefined;
  }
}

// ADMIN_BASE_PATH (build time): "/admin" unless set, e.g. "/admin-staging" for staging on the same host.
export default function config(phase: string): NextConfig {
  const basePath = phase === PHASE_PRODUCTION_SERVER
    ? servedBasePath(builtBasePath(), process.env.ADMIN_BASE_PATH)
    : parseBasePath(process.env.ADMIN_BASE_PATH);
  return {
    basePath,
    env: { NEXT_PUBLIC_ADMIN_BASE_PATH: basePath },
    poweredByHeader: false,
    // Next 16 dev blocks its dev resources (hot reload, chunks) for origins other than localhost; Playwright uses 127.0.0.1.
    allowedDevOrigins: ["127.0.0.1"],
    transpilePackages: ["@lipidomic/admin-ingest"],
    experimental: { cpus: 2, serverActions: { bodySizeLimit: "6mb" } },
    turbopack: {
      // The repository root, so Turbopack can follow the file: link to packages/admin-ingest.
      root: path.resolve(process.cwd(), "../.."),
      // Offline builds (scripts/next.mjs sets ADMIN_FONT_MODE=system) swap the Google fonts module for system fonts.
      ...(process.env.ADMIN_FONT_MODE === "system" ? { resolveAlias: { "@/app/fonts": "./src/app/fonts-system.ts" } } : {}),
    },
  };
}
