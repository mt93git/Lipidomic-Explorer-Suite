#!/usr/bin/env node
// Local env files only. Never print tokens, JWT secrets, input values or filesystem error details.
import { createHmac, randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const TOKEN_KEY = 'LIPIDOMIC_ADMIN_NEXO_TOKEN';
const DAY = 86400;
function assignment(text, key) {
  const matches = [...text.matchAll(new RegExp(`^([ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[ \\t]*)([^\\r\\n]*)`, 'gm'))];
  if (matches.length !== 1) throw new Error('expected exactly one assignment');
  return matches[0];
}
function valueOf(match) {
  const raw = match[2].trim();
  const quoted = raw.match(/^(['"])(.*?)\1\s*(?:#.*)?$/);
  if (raw.startsWith('"') || raw.startsWith("'")) {
    if (!quoted) throw new Error('invalid quoted value');
    return quoted[2];
  }
  return raw.replace(/\s+#.*$/, '').trim();
}
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const iso = seconds => new Date(seconds * 1000).toISOString();

function main(args) {
  const [operation, file, ...rest] = args;
  if (!['--check', '--rotate'].includes(operation) || !file) throw new Error('invalid arguments');
  let secretFile; let days = 90;
  for (let i = 0; i < rest.length; i += 2) {
    if (operation !== '--rotate' || !rest[i + 1]) throw new Error('invalid arguments');
    if (rest[i] === '--jwt-secret-file' && !secretFile) secretFile = rest[i + 1];
    else if (rest[i] === '--days' && /^\d+$/.test(rest[i + 1])) days = Number(rest[i + 1]);
    else throw new Error('invalid arguments');
  }
  if (!Number.isSafeInteger(days) || days <= 0 || (operation === '--rotate' && !secretFile)) throw new Error('invalid arguments');
  const text = readFileSync(file, 'utf8');
  const match = assignment(text, TOKEN_KEY);
  const now = Math.floor(Date.now() / 1000);
  if (operation === '--check') {
    // Metadata check only: no secret is needed and no signature verification is claimed.
    const token = valueOf(match);
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('invalid token');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || claims.role !== 'nexo_reader' || !Number.isSafeInteger(claims.iat)
      || !Number.isSafeInteger(claims.exp) || claims.exp <= claims.iat) throw new Error('invalid claims');
    const issued = iso(claims.iat); const expiry = iso(claims.exp);
    const left = (claims.exp - now) / DAY;
    console.log(`role: nexo_reader\nissued: ${issued}\nexpiry: ${expiry}\ndays left: ${left.toFixed(2)}`);
    return left < 14 ? 1 : 0;
  }
  const secret = valueOf(assignment(readFileSync(secretFile, 'utf8'), 'JWT_SECRET'));
  if (!secret) throw new Error('empty secret');
  const exp = now + days * DAY;
  const expiry = iso(exp); // Validate the lifetime before touching the destination.
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'nexo_reader', iat: now, exp })}`;
  const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  const next = text.slice(0, match.index) + match[1] + token + text.slice(match.index + match[0].length);
  const mode = statSync(file).mode & 0o7777;
  const temporary = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, next, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    chmodSync(temporary, mode);
    renameSync(temporary, file);
  } finally {
    try { unlinkSync(temporary); } catch { /* Already renamed, or creation failed. */ }
  }
  console.log(expiry);
  return 0;
}

try { process.exitCode = main(process.argv.slice(2)); } catch {
  console.error('nexo-reader-token: invalid arguments, env file or token; no credentials are shown');
  process.exitCode = 1;
}
