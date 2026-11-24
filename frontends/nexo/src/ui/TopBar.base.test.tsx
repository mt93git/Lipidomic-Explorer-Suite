import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';
import { startHref } from './startHref';

// Staging serves Nexo under /nexo-staging/ (built with --base); its Data and Review steps must stay there, never
// go to /team/ (which the server sends to production Nexo) or to a hard-coded /nexo/.
describe('the board top bar stays under the app base', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('Data and Review go to Start under the current base, on staging and production', () => {
    for (const base of ['/nexo-staging/', '/nexo/']) {
      vi.stubEnv('BASE_URL', base);
      const html = renderToStaticMarkup(<TopBar projectName="Synthetic" onCheckpoints={() => {}} saveText="Ready" saveStatus="idle"/>);
      const links = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(m => [m[2], m[1]]);
      expect(links).toEqual([['Data', base], ['Review', base]]);
      expect(html).not.toContain('/team/');
    }
  });

  it('startHref is the base itself', () => {
    vi.stubEnv('BASE_URL', '/nexo-staging/');
    expect(startHref()).toBe('/nexo-staging/');
  });

  it('no page or card links to a hard-coded app path (a card\'s Review button included)', () => {
    const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../mock/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const hardCoded = Object.entries(sources).filter(([, text]) => /(href\s*=\s*|location\.(href\s*=|assign\()\s*)['"`{]*\/(team|nexo|nexo-staging)\//.test(text)).map(([file]) => file);
    expect(hardCoded).toEqual([]);
  });
});
