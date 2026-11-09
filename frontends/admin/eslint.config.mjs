import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Admin links never prefetch (see src/components/app-link.tsx).
const nextLink = { name: "next/link", message: "Use @/components/app-link: Admin links do not prefetch." };
const config = [
  { ignores: [".next/**", "node_modules/**", ".npm-cache/**", "next-env.d.ts", "verification/**"] },
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: [nextLink] }] },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [nextLink],
        patterns: [{ group: ["@supabase/*", "@/lib/supabase/*", "@/lib/environment"], message: "Use server actions; credentials and Supabase clients stay on the server." }],
      }],
    },
  },
];
export default config;
