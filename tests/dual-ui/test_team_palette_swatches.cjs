// Run with: node tests/dual-ui/test_team_palette_swatches.cjs
// Colors & palettes modal (R12): "Choose color" opens a popover INSIDE the modal with 12 preset colours
// and a native colour input; the chosen colour goes through the same colourpicker input and binding
// as before; the popover uses the qw_layers popover token, closes with Escape (the modal stays open)
// and returns focus to the swatch; "Apply color changes" keeps its ID and is visible at 1280, 1440
// and 390 px. In HEX mode the retained vendor picker panel stays inside the visible modal body, above
// the footer, so Apply stays clickable.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('../browser/ci/node_modules/playwright');

const teamUi = fs.readFileSync('R/frontends/team/ui.R', 'utf8');
assert.match(teamUi, /includeScript\("www\/team\/js\/palette_editor\.js"\),\s*\n\s*includeCSS\("www\/team\/css\/palette_swatches\.css"\), includeScript\("www\/team\/js\/palette_swatches\.js"\),/,
  'the swatch popover loads right after the palette editor, in both Team modes');
const css = fs.readFileSync('www/team/css/palette_swatches.css', 'utf8');
assert.deepEqual(css.match(/z-index:[^;]+/g), ['z-index: var(--z-popover, 10200)'], 'only the popover token is used');
assert.ok(!/z-index:\s*\d/.test(fs.readFileSync('www/team/css/palette_editor.css', 'utf8')), 'no raw z-index in the palette editor');

const field = (id, label, value) => `<div class="palette-color-field" data-palette-label="${label}">
  <span class="palette-color-label">${label}</span>
  <div class="palette-color-control">
    <button type="button" class="palette-swatch-button" style="--palette-color:${value}" aria-label="Choose color for ${label} current color ${value}" aria-haspopup="dialog" aria-expanded="false">
      <span class="palette-swatch-mark" aria-hidden="true"></span><span>Choose color</span></button>
    <div class="palette-color-input"><div class="form-group shiny-input-container"><input id="${id}" type="text" class="form-control colourpicker-input" value="${value}"></div></div>
  </div></div>`;
const FIELDS = [['data_hub-globalGroupCol_Group1_Control', 'Control', '#E41A1C'], ['data_hub-globalGroupCol_Group1_Treatment', 'Treatment', '#377EB8'],
  ['data_hub-globalGroupCol_Group1_Vehicle', 'Vehicle', '#4DAF4A'], ['data_hub-globalGroupCol_Group1_Sham', 'Sham', '#984EA3']];
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;font:14px sans-serif}
  .modal{position:fixed;inset:0;overflow-y:auto}
  .modal-dialog{max-width:800px;margin:1.75rem auto;position:relative}
  @media (max-width:575px){.modal-dialog{margin:.5rem}}
  .modal-content{background:#fff;overflow:hidden}
  .modal-header,.modal-footer{padding:12px 18px}.modal-body{padding:18px}
  .modal-footer{display:flex;justify-content:flex-end}
  .tall{height:900px}
</style></head><body><main><button id="open_palette_editor" type="button">Colors &amp; palettes</button></main>
<div id="shiny-modal-wrapper"></div>
<script>
  window.calls=[];window.modalEscapes=0;
  window.jQuery=function(el){return {on:function(){return this;},
    colourpicker:function(m,v){calls.push([el.id,m,v]);if(m==='value'&&v!==undefined)el.value=v;return this;},
    trigger:function(t){calls.push([el.id,'trigger',t]);return this;}};};
  window.jQuery.fn={colourpicker:function(){}};
  window.openModal=function(){document.getElementById('shiny-modal-wrapper').innerHTML=
    '<div id="shiny-modal" class="modal show" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">'+
    '<div class="modal-header"><h4 class="modal-title">Colors &amp; palettes</h4></div><div class="modal-body"><div class="palette-editor">'+
    '<h5>Choose a palette</h5><div class="tall"></div><h5>Fine-tune colors</h5>'+
    '<div id="data_hub-classColorUI" class="shiny-html-output"><div class="palette-color-grid">${FIELDS.map(f => field(...f)).join('').replace(/\n/g, '')}</div></div>'+
    '<button class="btn btn-default action-button btn-primary" id="data_hub-btn_apply_colors" type="button"><i class="fas fa-palette" role="presentation" aria-label="palette icon"></i>Apply color changes</button>'+
    '<hr><h5>Save &amp; reuse</h5><div class="tall"></div></div></div>'+
    '<div class="modal-footer"><button type="button" class="btn btn-default" data-bs-dismiss="modal">Close</button></div></div></div></div>';
    document.getElementById('shiny-modal').addEventListener('keydown',function(e){if(e.key==='Escape')modalEscapes++;});};
</script></body></html>`;

async function load(page) {
  await page.setContent(fixture);
  for (const f of ['palette_editor.css', 'palette_swatches.css', 'qw_layers.css']) await page.addStyleTag({path: path.resolve('www/team/css', f)});
  for (const f of ['palette_editor.js', 'palette_swatches.js']) await page.addScriptTag({path: path.resolve('www/team/js', f)});
  await page.evaluate(() => window.openModal());
  await page.waitForSelector('.modal.tx-palette-modal .modal-footer #data_hub-btn_apply_colors');
}
const unobstructed = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s); const r = el.getBoundingClientRect();
  const inView = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return inView && !!hit && (hit === el || el.contains(hit));
}, sel);
const within = (page, inner, outer) => page.evaluate(([i, o]) => {
  const a = document.querySelector(i).getBoundingClientRect(), b = document.querySelector(o).getBoundingClientRect();
  return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5 && a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
}, [inner, outer]);
const swatchButton = name => `.palette-color-field[data-palette-label="${name}"] .palette-swatch-button`;

(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    for (const [width, height] of [[1280, 800], [1440, 900], [390, 844]]) {
      const page = await browser.newPage({viewport: {width, height}});
      await load(page);
      const apply = '#data_hub-btn_apply_colors';
      assert.equal(await page.locator(apply).count(), 1, 'Apply keeps its ID');
      assert.equal(await page.locator(`${apply} .fa-check`).count(), 1, 'Apply shows a check icon');
      assert.ok(await unobstructed(page, apply), `Apply visible at the top of the modal at ${width}`);
      await page.evaluate(() => { const b = document.querySelector('.modal-body'); b.scrollTop = b.scrollHeight; });
      assert.ok(await unobstructed(page, apply), `Apply visible at the bottom of the modal at ${width}`);
      assert.ok(await page.evaluate(() => { const b = document.querySelector('.modal-body'); return b.scrollHeight > b.clientHeight; }),
        'the modal body is its own scroll region');

      // Open the last swatch: the popover stays inside the modal body and never covers Apply.
      for (const name of ['Control', 'Sham']) {
        await page.locator(swatchButton(name)).scrollIntoViewIfNeeded();
        await page.locator(swatchButton(name)).click();
        const pop = '.tx-swatch-pop';
        assert.equal(await page.locator(pop).count(), 1);
        assert.equal(await page.locator(swatchButton(name)).getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator(`${pop}[role="dialog"]`).getAttribute('aria-label'), `Choose color for ${name}`);
        assert.equal(await page.locator(`${pop} .tx-swatch`).count(), 12, '12 preset colours');
        assert.equal(await page.locator(`${pop} input[type="color"]`).count(), 1, 'a native colour input');
        assert.ok(await within(page, pop, '.modal-body'), `the ${name} popover renders inside the modal body at ${width}`);
        assert.ok(await page.locator(`${pop} .tx-swatch`).first().isVisible());
        assert.equal(await page.evaluate(s => getComputedStyle(document.querySelector(s)).zIndex, pop), '10200', 'popover token');
        assert.ok(await unobstructed(page, apply), `the popover does not cover Apply at ${width}`);
        assert.equal(await page.locator('.colourpicker-panel').count(), 0);
        assert.ok(!(await page.evaluate(() => calls.some(c => c[1] === 'show'))), 'the vendor panel is not opened');

        // Escape closes only the popover and returns focus to the swatch.
        await page.keyboard.press('Escape');
        assert.equal(await page.locator(pop).count(), 0);
        assert.equal(await page.locator(swatchButton(name)).getAttribute('aria-expanded'), 'false');
        assert.ok(await page.evaluate(s => document.activeElement === document.querySelector(s), swatchButton(name)));
        assert.equal(await page.evaluate(() => modalEscapes), 0, 'Escape does not close the modal');
      }

      // HEX mode keeps the vendor colourpicker panel (FIXR1B item 4). Shown for an input just above the
      // footer, or scrolled under it, the panel stays inside the visible modal body: Apply stays clickable.
      await page.evaluate(() => {
        document.querySelector('.palette-editor').classList.add('palette-show-hex');
        const input = document.getElementById('data_hub-globalGroupCol_Group1_Sham');
        const box = document.createElement('div'); box.className = 'colourpicker-input-container';
        input.parentNode.insertBefore(box, input); box.appendChild(input);
        const panel = document.createElement('div'); panel.className = 'colourpicker-panel';
        panel.style.cssText = 'display:none;position:absolute;top:100%;left:0;width:220px;height:240px;background:#fff;border:1px solid #333';
        box.appendChild(panel);
      });
      for (const where of ['just above the footer', 'scrolled under the footer']) {
        await page.evaluate(w => {
          const body = document.querySelector('.modal-body'), box = document.querySelector('.colourpicker-input-container');
          const b = body.getBoundingClientRect(), r = box.getBoundingClientRect();
          body.scrollTop += r.top - (w === 'just above the footer' ? b.bottom - 10 - r.height : b.bottom + 40);
          document.querySelector('.colourpicker-panel').style.display = 'block';
        }, where);
        await page.evaluate(() => new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 30)));
        const geo = await page.evaluate(() => {
          const rect = el => { const x = el.getBoundingClientRect(); return { left: x.left, right: x.right, top: x.top, bottom: x.bottom }; };
          const p = document.querySelector('.colourpicker-panel');
          return { pinned: p.classList.contains('tx-vendor-pinned'), panel: rect(p), body: rect(document.querySelector('.modal-body')),
            footer: rect(document.querySelector('.modal-footer')), input: rect(document.querySelector('.colourpicker-input-container')) };
        });
        const label = `${width}, input ${where}: ${JSON.stringify(geo)}`;
        assert.ok(geo.pinned, `${label}: the vendor panel is pinned`);
        assert.ok(geo.panel.top >= geo.body.top - 0.5 && geo.panel.bottom <= geo.body.bottom + 0.5 && geo.panel.left >= geo.body.left - 0.5 && geo.panel.right <= geo.body.right + 0.5, `${label}: the panel stays inside the modal body`);
        assert.ok(geo.panel.bottom <= geo.footer.top + 0.5, `${label}: the panel ends above the footer`);
        assert.ok(geo.input.top >= geo.body.top - 0.5 && geo.input.bottom <= geo.body.bottom + 0.5, `${label}: its input is in view`);
        assert.ok(geo.panel.bottom <= geo.input.top + 0.5 || geo.panel.top >= geo.input.bottom - 0.5, `${label}: the panel does not cover its input`);
        assert.ok(await unobstructed(page, apply), `${label}: Apply is visible and clickable`);
        await page.evaluate(() => { document.querySelector('.colourpicker-panel').style.display = 'none'; });
        await page.waitForFunction(() => !document.querySelector('.colourpicker-panel').classList.contains('tx-vendor-pinned'));
      }
      await page.close();
    }

    // Choosing a colour goes through the same colourpicker input, with keyboard only.
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    await load(page);
    await page.locator(swatchButton('Control')).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'true', 'focus starts on the current colour');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.color), '#E41A1C');
    assert.equal(await page.locator('.tx-swatch[tabindex="0"]').count(), 1, 'one tab stop in the grid');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.color), '#56B4E9');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => calls), [
      ['data_hub-globalGroupCol_Group1_Control', 'value', '#56B4E9'],
      ['data_hub-globalGroupCol_Group1_Control', 'trigger', 'change']]);
    assert.equal(await page.inputValue('#data_hub-globalGroupCol_Group1_Control'), '#56B4E9');
    assert.equal(await page.locator('.tx-swatch-pop').count(), 0);
    assert.ok(await page.evaluate(s => document.activeElement === document.querySelector(s), swatchButton('Control')));
    assert.equal(await page.locator(swatchButton('Control')).evaluate(b => b.style.getPropertyValue('--palette-color')), '#56B4E9');

    // A custom value from the native input takes the same path, normalised to upper case like the vendor.
    await page.evaluate(() => { calls.length = 0; });
    await page.locator(swatchButton('Treatment')).click();
    assert.equal(await page.inputValue('.tx-swatch-pop input[type="color"]'), '#377eb8');
    await page.locator('.tx-swatch-pop input[type="color"]').evaluate(i => { i.value = '#123abc'; i.dispatchEvent(new Event('change', {bubbles: true})); });
    assert.deepEqual(await page.evaluate(() => calls), [
      ['data_hub-globalGroupCol_Group1_Treatment', 'value', '#123ABC'],
      ['data_hub-globalGroupCol_Group1_Treatment', 'trigger', 'change']]);
    assert.equal(await page.locator('.tx-swatch-pop').count(), 0);

    // A click outside closes it without changing anything.
    await page.evaluate(() => { calls.length = 0; });
    await page.locator(swatchButton('Vehicle')).click();
    await page.locator('.modal-title').click();
    assert.equal(await page.locator('.tx-swatch-pop').count(), 0);
    assert.deepEqual(await page.evaluate(() => calls), []);
    await page.close();
    console.log('team palette swatches: ok');
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
