// @vitest-environment node
import { describe, expect, it } from "vitest";
import { totp } from "../e2e/live/totp.mjs";

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890": the staging E2E's two-step codes depend on this.
describe("TOTP helper of the live E2E", () => {
  it("matches the RFC 6238 test vectors (last six digits)", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totp(secret, 59_000)).toBe("287082");
    expect(totp(secret, 1_111_111_109_000)).toBe("081804");
    expect(totp(secret, 2_000_000_000_000)).toBe("279037");
  });
});
