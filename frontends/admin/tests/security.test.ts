// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
}

describe("credential boundary", () => {
  it("forbids service credentials throughout the app, including client dependency code", () => {
    const files = sourceFiles(resolve("src"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/SUPABASE_SERVICE|SERVICE_ROLE|service_role|sb_secret_/i);
      // The two public env values are the only Supabase credentials this app can use.
      for (const match of source.matchAll(/process\.env\.([A-Z_]*SUPABASE[A-Z_]*)/g)) {
        expect(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]).toContain(match[1]);
      }
    }
  });
  it("marks the cookie-backed Supabase client as server-only", () => {
    expect(readFileSync(resolve("src/lib/supabase/server.ts"), "utf8")).toContain('import "server-only"');
  });
});
