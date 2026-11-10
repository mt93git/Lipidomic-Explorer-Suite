// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lab screens are read at arm's length: no text below 11 px. The mono eyebrow keeps 10 px because of its
// tracking (the sidebar's group heading is the same mono eyebrow), and the ADMIN badge is part of the brand mark.
// The floor lives in tokens.css as --text-xs / --text-sm.
const files = ["src/app/globals.css", "src/app/samples.css", "src/app/tokens.css", "src/app/(workspace)/release/release.module.css", "src/app/(workspace)/ingest-results/results.module.css", "src/app/(workspace)/audit-log/audit.module.css"];
const allowed = new Set([".eyebrow", ".badge", ".nav-heading"]);
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("type floor", () => {
  it("declares the two small sizes as tokens", () => {
    const tokens = read("src/app/tokens.css");
    expect(tokens).toMatch(/--text-xs:\s*11px/);
    expect(tokens).toMatch(/--text-sm:\s*12px/);
  });
  it("sets no font-size below 11 px outside the eyebrow and the badge", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const rule of read(file).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selector = rule[1].trim().split("\n").at(-1)!.trim();
        for (const size of rule[2].matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
          if (Number(size[1]) < 11 && !allowed.has(selector)) offenders.push(`${file}: ${selector} ${size[1]}px`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
