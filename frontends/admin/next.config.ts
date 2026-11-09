import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  basePath: "/admin",
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

export default config;
