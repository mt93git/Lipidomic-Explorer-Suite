import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  basePath: "/admin",
  poweredByHeader: false,
  transpilePackages: ["@lipidomic/admin-ingest"],
  experimental: { cpus: 2, serverActions: { bodySizeLimit: "6mb" } },
  webpack(config, { webpack }) {
    if (process.env.ADMIN_FONT_MODE === "system") {
      // Replace before Next's tsconfig-paths resolver or next/font's loader runs.
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /(?:^@\/app\/fonts$|\/src\/app\/fonts(?:\.ts)?$)/,
        path.resolve(process.cwd(), "src/app/fonts-system.ts"),
      ));
    }
    return config;
  },
};

export default config;
