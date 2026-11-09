import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const compat = new FlatCompat({ baseDirectory: path.dirname(fileURLToPath(import.meta.url)) });
const config = [
  { ignores: [".next/**", "node_modules/**", ".npm-cache/**", "next-env.d.ts", "verification/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@supabase/*", "@/lib/supabase/*", "@/lib/environment"], message: "Use server actions; credentials and Supabase clients stay on the server." }],
      }],
    },
  },
];
export default config;
