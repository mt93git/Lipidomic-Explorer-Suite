const pw = require(require.resolve('@playwright/test', { paths: [process.argv[2]] }));
(async () => { const b = await pw.webkit.launch(); const p = await b.newPage(); const msgs = [];
 p.on('console', m => msgs.push(m.type()+': '+m.text()));
 for (const mode of ['keep', 'lose', 'lose+detach+zero']) {
  msgs.length = 0;
  const r = await p.evaluate(mode => { const out=[]; for (let i = 0; i < 24; i++) { const c = document.createElement('canvas'); document.body.append(c); const g = c.getContext('webgl');
    if (mode !== 'keep') { g.getExtension('WEBGL_lose_context').loseContext(); c.remove(); if (mode.includes('zero')) { c.width = 0; c.height = 0; } } } return out; }, mode);
  await p.waitForTimeout(300);
  console.log(mode, msgs.filter(m=>/too many/.test(m)).length, 'warnings', msgs.slice(0,2));
  await p.reload();
 }
 await b.close(); })();
