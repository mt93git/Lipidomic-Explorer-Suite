import { expect, it } from 'vitest';
// The entry illustrations and the lab logo (nexo-entry-build.md C6), copied from the proposal into public/entry/.
const fsName = 'node:fs';
const { existsSync } = await import(fsName) as { existsSync: (path: URL) => boolean };
const files = ['login-spectrum.svg', 'login-spectrum-static.svg', 'data-matrix.svg', 'data-matrix-static.svg', 'step-backdrop.svg',
  'step-backdrop-portrait.svg', 'help-macrophage.svg', 'help-neutrophil.svg', 'libreros-lab-logo.webp'];
it.each(files)('public/entry/%s is served', name => { expect(existsSync(new URL(`../../../public/entry/${name}`, import.meta.url))).toBe(true); });
