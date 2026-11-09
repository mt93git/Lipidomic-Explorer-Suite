import { describe, expect, it } from "vitest";
import { initials } from "@/lib/initials";

describe("avatar initials", () => {
  it("takes up to two words that start with a letter, uppercased", () => {
    expect(initials("Stephania (simulated)")).toBe("S");
    expect(initials("Ana María López")).toBe("AM");
    expect(initials("álvaro díaz")).toBe("ÁD");
  });
  it("falls back to ? when no word starts with a letter", () => {
    expect(initials("(x)")).toBe("?");
    expect(initials("  ")).toBe("?");
  });
});
