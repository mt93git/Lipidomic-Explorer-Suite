// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// SUPABASE_SERVICE_ROLE_KEY bypasses RLS: it is read in one server-only module and must never reach the browser.
const src = fileURLToPath(new URL("../src", import.meta.url));
const service = join(src, "lib/supabase/service.ts");
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
});
const sources = files(src);
const read = (path: string) => readFileSync(path, "utf8");
const directive = (path: string) => read(path).match(/^\s*(?:\/\/.*\n|\s)*["']use (client|server)["']/)?.[1] ?? null;

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(src, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(path => existsSync(path) && statSync(path).isFile()) ?? null;
}
const importsOf = (path: string) => [...read(path).matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)]
  .map(match => resolveImport(path, match[1] ?? match[2])).filter((item): item is string => !!item);

test("the service-role key is read only in supabase/service.ts, which is server-only, and never under a public name", () => {
  expect(read(service).trimStart().startsWith('import "server-only";')).toBe(true);
  const readers = sources.filter(path => read(path).includes("SUPABASE_SERVICE_ROLE_KEY")).map(path => relative(src, path));
  expect(readers).toEqual(["lib/supabase/service.ts"]);
  expect(sources.filter(path => /NEXT_PUBLIC_[A-Z_]*SERVICE/.test(read(path)))).toEqual([]);
});

test("no client component reaches the service-role module through its imports (server actions are the boundary)", () => {
  const clients = sources.filter(path => directive(path) === "client");
  expect(clients.length).toBeGreaterThan(5);
  for (const entry of clients) {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length) {
      const path = queue.pop()!;
      if (seen.has(path)) continue;
      seen.add(path);
      expect(path, `${relative(src, entry)} imports the service-role module`).not.toBe(service);
      // A "use server" module is called over the network from the browser; its imports stay on the server.
      if (path !== entry && directive(path) === "server") continue;
      queue.push(...importsOf(path));
    }
  }
});
