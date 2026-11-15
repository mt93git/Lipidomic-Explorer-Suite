// Local CLI only; all keys, tokens and files are synthetic.
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const script = fileURLToPath(new URL('../tools/nexo-reader-token.mjs', import.meta.url));
const secret = 'synthetic-jwt-secret-for-tests';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function mint(claims) {
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}
const decode = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
let dir; let file; let stack;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nexo-token-'));
  file = join(dir, 'nexo.env'); stack = join(dir, 'stack.env');
  writeFileSync(file, '# synthetic config\nOTHER=keep=this\nLIPIDOMIC_ADMIN_NEXO_TOKEN=old-synthetic-token\nLAST=untouched\n');
  chmodSync(file, 0o640);
  writeFileSync(stack, `JWT_SECRET=${secret}\nOTHER=ignored\n`, { mode: 0o600 });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('nexo_reader token CLI', () => {
  test('rotates for 90 days, signs role/iat/exp, preserves other lines and file mode, and replaces atomically', () => {
    const before = readFileSync(file, 'utf8'); const inode = statSync(file).ino;
    const start = Math.floor(Date.now() / 1000);
    const result = cli('--rotate', file, '--jwt-secret-file', stack);
    expect(result.status).toBe(0);
    const after = readFileSync(file, 'utf8');
    const token = after.match(/^LIPIDOMIC_ADMIN_NEXO_TOKEN=(.*)$/m)[1];
    const [header, payload, signature] = token.split('.');
    const claims = decode(token);
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(claims).toEqual({ role: 'nexo_reader', iat: expect.any(Number), exp: expect.any(Number) });
    expect(claims.iat).toBeGreaterThanOrEqual(start);
    expect(claims.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(claims.exp - claims.iat).toBe(90 * 86400);
    expect(signature).toBe(createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url'));
    expect(after).toBe(before.replace('old-synthetic-token', token));
    expect(statSync(file).mode & 0o777).toBe(0o640);
    expect(statSync(file).ino).not.toBe(inode);
    expect(readdirSync(dir).sort()).toEqual(['nexo.env', 'stack.env']);
    expect(result.stdout).toBe(`${new Date(claims.exp * 1000).toISOString()}\n`);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain(token); expect(result.stdout).not.toContain(secret);
  });
  test('accepts custom days, export syntax, quoted values and CRLF without changing other lines', () => {
    writeFileSync(file, '# keep\r\nexport LIPIDOMIC_ADMIN_NEXO_TOKEN = "old"\r\nLAST=x\r\n');
    writeFileSync(stack, `export JWT_SECRET='${secret}' # synthetic\r\n`);
    const result = cli('--rotate', file, '--jwt-secret-file', stack, '--days', '30');
    expect(result.status).toBe(0);
    const after = readFileSync(file, 'utf8');
    const token = after.split('\r\n')[1].split(' = ')[1];
    expect(decode(token).exp - decode(token).iat).toBe(30 * 86400);
    expect(after).toBe(`# keep\r\nexport LIPIDOMIC_ADMIN_NEXO_TOKEN = ${token}\r\nLAST=x\r\n`);
    const [h, p, sig] = token.split('.');
    expect(sig).toBe(createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url'));
  });
  test.each([90, 15, 13, -1])('checks metadata and exits nonzero only below 14 days (%i days)', days => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { role: 'nexo_reader', iat: now - 864000, exp: now + days * 86400 };
    const token = mint(claims);
    const text = `LIPIDOMIC_ADMIN_NEXO_TOKEN='${token}'\n`;
    writeFileSync(file, text);
    const result = cli('--check', file);
    expect(result.status).toBe(days < 14 ? 1 : 0);
    expect(result.stdout).toMatch(/^role: nexo_reader\nissued: .*\nexpiry: .*\ndays left: -?\d+\.\d{2}\n$/);
    expect(result.stdout).toContain(new Date(claims.iat * 1000).toISOString());
    expect(result.stdout).toContain(new Date(claims.exp * 1000).toISOString());
    expect(result.stdout + result.stderr).not.toContain(token);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });
  test.each(['0', '-2', 'NaN', '1.5'])('rejects invalid lifetime %s without changing the file', days => {
    const before = readFileSync(file, 'utf8');
    const result = cli('--rotate', file, '--jwt-secret-file', stack, '--days', days);
    expect(result.status).not.toBe(0); expect(result.stdout).toBe('');
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(result.stderr).not.toContain(secret);
  });
  test.each([
    'not-a-token', mint({ role: 'nexo_reader', iat: 1 }), mint({ role: 'owner', iat: 1, exp: 9999999999 }),
  ])('rejects malformed or incorrect claims without echoing the token', token => {
    writeFileSync(file, `LIPIDOMIC_ADMIN_NEXO_TOKEN=${token}\n`);
    const result = cli('--check', file);
    expect(result.status).toBe(1); expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain(token);
  });
  test.each(['OTHER=only\n', 'LIPIDOMIC_ADMIN_NEXO_TOKEN=a\nLIPIDOMIC_ADMIN_NEXO_TOKEN=b\n'])('refuses missing or duplicate token assignments', text => {
    writeFileSync(file, text);
    const result = cli('--rotate', file, '--jwt-secret-file', stack);
    expect(result.status).toBe(1); expect(result.stdout).toBe('');
    expect(readFileSync(file, 'utf8')).toBe(text);
  });
  test('requires the secret file and leaves the token file untouched on read/validation errors', () => {
    const before = readFileSync(file, 'utf8');
    for (const args of [[], ['--jwt-secret-file', join(dir, 'missing')], ['--jwt-secret-file', stack]]) {
      writeFileSync(stack, 'OTHER=no-secret\n');
      const result = cli('--rotate', file, ...args);
      expect(result.status).not.toBe(0); expect(result.stdout).toBe('');
      expect(readFileSync(file, 'utf8')).toBe(before);
    }
  });
});
