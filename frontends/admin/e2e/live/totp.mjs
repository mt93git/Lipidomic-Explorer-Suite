// RFC 6238 TOTP (SHA-1, 30 s, 6 digits), the scheme GoTrue enrolls. Shared by seed.mjs and live.spec.ts so the
// staging E2E can pass the two-step step of a test operator. Test helper only: never used by the app.
import { createHmac } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** @param {string} secret base32 */
function base32(secret) {
  let bits = "";
  for (const char of secret.replace(/[\s=]/g, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("TOTP secret is not base32");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The 30-second step a millisecond instant falls in. @param {number} [now] */
export function totpStep(now = Date.now()) {
  return Math.floor(now / 1000 / 30);
}

/** @param {string} secret base32 @param {number} [now] epoch milliseconds @returns {string} */
export function totp(secret, now = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(totpStep(now)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
