// Colors & palettes modal (R12): each "Choose color" swatch opens a small popover inside the modal
// with 12 preset colours and a native colour input, in place of the vendor picker that was clipped
// by the modal's lower edge. The chosen colour goes through the same colourpicker input (same ID,
// same Shiny binding) the vendor panel used. The modal body gets its own scroll region and
// "Apply color changes" moves into the footer so it is always visible.
(function () {
  const PRESETS = [
    ['#E69F00', 'Orange'], ['#56B4E9', 'Sky blue'], ['#009E73', 'Bluish green'], ['#F0E442', 'Yellow'],
    ['#0072B2', 'Blue'], ['#D55E00', 'Vermillion'], ['#CC79A7', 'Reddish purple'], ['#E41A1C', 'Red'],
    ['#377EB8', 'Steel blue'], ['#4DAF4A', 'Green'], ['#984EA3', 'Purple'], ['#000000', 'Black']
  ];
  const COLUMNS = 6;
  const HEX = /^#[0-9a-fA-F]{6}$/;
  let open = null; // { pop, button, field }
  let seq = 0;

  function pickerInput(field) {
    return field && field.querySelector('.palette-color-input input');
  }
  function currentColor(field) {
    const input = pickerInput(field);
    const value = input ? String(input.value || '') : '';
    return HEX.test(value) ? value.toUpperCase() : '';
  }

  function enhance(editor) {
    if (editor.classList.contains('tx-swatches')) return;
    editor.classList.add('tx-swatches');
    const modal = editor.closest('.modal');
    if (!modal) return;
    modal.classList.add('tx-palette-modal');
    const apply = editor.querySelector('button[id$="btn_apply_colors"]');
    const footer = modal.querySelector('.modal-footer');
    if (apply && footer) {
      // Moving the node keeps its ID and Shiny action-button binding.
      apply.classList.add('tx-palette-apply');
      footer.appendChild(apply);
      const icon = apply.querySelector('.fa-palette');
      if (icon) { icon.classList.remove('fa-palette'); icon.classList.add('fa-check'); }
    }
    // The vendor shows and hides its panel through its inline style (and the container's class).
    vendorWatch.observe(editor, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
    pinVendorPanels();
  }

  function close(returnFocus) {
    if (!open) return;
    const state = open;
    open = null;
    if (state.pop.isConnected) state.pop.remove();
    if (state.button.isConnected) {
      state.button.setAttribute('aria-expanded', 'false');
      state.button.removeAttribute('aria-controls');
      if (returnFocus) state.button.focus();
    }
  }

  function applyColor(field, button, hex) {
    hex = hex.toUpperCase();
    const input = pickerInput(field);
    if (!input || !HEX.test(hex)) return;
    // Same path as the vendor panel: set the colourpicker value, then fire its change event.
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.colourpicker) {
      window.jQuery(input).colourpicker('value', hex);
      window.jQuery(input).trigger('change');
    } else {
      input.value = hex;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    button.style.setProperty('--palette-color', hex);
    button.setAttribute('aria-label', 'Choose color for ' + field.dataset.paletteLabel + ', current color ' + hex);
  }

  function place(pop, button) {
    const scroller = pop.closest('.modal-body');
    if (!scroller) return;
    const b = button.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const below = s.bottom - b.bottom;
    const above = b.top - s.top;
    pop.classList.toggle('is-above', below < pop.offsetHeight + 8 && above > below);
    if (typeof pop.scrollIntoView === 'function') pop.scrollIntoView({ block: 'nearest' });
  }

  function build(field, button) {
    const label = field.dataset.paletteLabel || 'this category';
    const current = currentColor(field);
    const pop = document.createElement('div');
    pop.className = 'tx-swatch-pop';
    pop.id = 'tx-swatch-pop-' + (++seq);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choose color for ' + label);
    const grid = document.createElement('div');
    grid.className = 'tx-swatch-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Preset colors');
    let selected = -1;
    PRESETS.forEach(function (preset, i) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'tx-swatch';
      swatch.dataset.color = preset[0];
      swatch.style.setProperty('--palette-color', preset[0]);
      swatch.setAttribute('aria-label', preset[1] + ' ' + preset[0]);
      swatch.title = preset[1];
      const pressed = preset[0] === current;
      if (pressed) selected = i;
      swatch.setAttribute('aria-pressed', String(pressed));
      swatch.tabIndex = -1;
      grid.appendChild(swatch);
    });
    grid.children[selected < 0 ? 0 : selected].tabIndex = 0;
    const custom = document.createElement('label');
    custom.className = 'tx-swatch-custom';
    const native = document.createElement('input');
    native.type = 'color';
    native.value = (current || '#B0B0B0').toLowerCase();
    const text = document.createElement('span');
    text.textContent = 'Custom color';
    custom.appendChild(native);
    custom.appendChild(text);
    pop.appendChild(grid);
    pop.appendChild(custom);
    return pop;
  }

  function show(button) {
    const field = button.closest('.palette-color-field');
    const control = button.closest('.palette-color-control');
    if (!field || !control || !pickerInput(field)) return;
    const pop = build(field, button);
    control.appendChild(pop);
    open = { pop: pop, button: button, field: field };
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', pop.id);
    place(pop, button);
    const first = pop.querySelector('.tx-swatch[tabindex="0"]');
    if (first) first.focus();
  }

  document.addEventListener('click', function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (open && open.pop.contains(target)) {
      const swatch = target.closest('.tx-swatch');
      if (swatch) {
        const state = open;
        applyColor(state.field, state.button, swatch.dataset.color);
        close(true);
      }
      return;
    }
    const button = target.closest('.tx-swatches .palette-swatch-button');
    const wasOpen = open && open.button === button;
    if (open) close(false);
    if (button && !wasOpen) show(button);
  });

  document.addEventListener('change', function (event) {
    if (!open || !open.pop.contains(event.target) || event.target.type !== 'color') return;
    const state = open;
    applyColor(state.field, state.button, event.target.value);
    close(true);
  });

  document.addEventListener('keydown', function (event) {
    if (!open) return;
    if (event.key === 'Escape') {
      // Focus already left the popover and its opener (e.g. Shift+Tab twice): close it quietly and
      // leave this Escape to whatever has focus now.
      if (!open.pop.contains(event.target) && event.target !== open.button) { close(false); return; }
      // Close only the popover; the modal stays open.
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const swatch = event.target.closest && event.target.closest('.tx-swatch');
    if (!swatch || !open.pop.contains(swatch)) return;
    const all = Array.prototype.slice.call(open.pop.querySelectorAll('.tx-swatch'));
    const i = all.indexOf(swatch);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[event.key];
    let next = -1;
    if (step) next = i + step;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = all.length - 1;
    else return;
    event.preventDefault();
    if (next < 0 || next >= all.length) return;
    all.forEach(function (s) { s.tabIndex = -1; });
    all[next].tabIndex = 0;
    all[next].focus();
  }, true);

  // Leaving the popover with Tab (or clicking elsewhere) closes it; focus moving into the
  // browser's own colour dialog has no related target and keeps it open.
  document.addEventListener('focusout', function (event) {
    if (!open) return;
    // Focus moving on from the opener (after Shift+Tab out of the grid) to anything outside closes it too.
    if (event.target === open.button) { const after = event.relatedTarget; if (after && !open.pop.contains(after)) close(false); return; }
    if (!open.pop.contains(event.target)) return;
    const next = event.relatedTarget;
    if (next && !open.pop.contains(next) && next !== open.button) close(false);
  });

  // HEX mode keeps the vendor colourpicker. Its panel is absolute inside the scrolling modal body,
  // which clips it at the body's edge. While it is shown it is pinned (palette_swatches.css
  // .tx-vendor-pinned, fixed) next to its input, but kept inside the visible modal body, above the
  // footer: below the input, else above it, else the body scrolls the input up to make room below;
  // a body too short for it caps the panel's height (it scrolls). Apply is never covered. Hidden,
  // the panel goes back to the vendor's own place.
  function setVar(panel, name, value) {
    if (panel.style.getPropertyValue(name) !== value) panel.style.setProperty(name, value);
  }
  function unpin(panel) {
    if (!panel.classList.contains('tx-vendor-pinned')) return;
    panel.classList.remove('tx-vendor-pinned');
    ['--tx-vendor-top', '--tx-vendor-left', '--tx-vendor-max-height'].forEach(function (name) { panel.style.removeProperty(name); });
  }
  // The visible part of the modal body: the viewport cut by the body's own box (the footer is below it).
  function bodyRegion(panel) {
    const body = panel.closest('.modal-body');
    const r = body ? body.getBoundingClientRect() : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
    return { body: body, top: Math.max(8, r.top + 4), left: Math.max(8, r.left + 4), bottom: Math.min(window.innerHeight - 8, r.bottom - 4), right: Math.min(window.innerWidth - 8, r.right - 4) };
  }
  function pinVendorPanels() {
    document.querySelectorAll('.tx-swatches .colourpicker-panel').forEach(function (panel) {
      const anchor = panel.parentElement;
      if (!anchor || getComputedStyle(panel).display === 'none') { unpin(panel); return; }
      if (!panel.classList.contains('tx-vendor-pinned')) panel.classList.add('tx-vendor-pinned');
      let region = bodyRegion(panel), a = anchor.getBoundingClientRect();
      // An input scrolled out of the body (under the footer, above the header) comes back into view first.
      if (region.body && (a.top < region.top - 4 || a.bottom > region.bottom + 4)) {
        anchor.scrollIntoView({ block: 'nearest' });
        region = bodyRegion(panel); a = anchor.getBoundingClientRect();
      }
      const room = Math.max(0, region.bottom - region.top);
      setVar(panel, '--tx-vendor-max-height', Math.floor(room) + 'px');
      const w = panel.offsetWidth, h = Math.min(panel.offsetHeight, room);
      let top;
      if (a.bottom + 4 + h <= region.bottom) top = a.bottom + 4;
      else if (a.top - 4 - h >= region.top) top = a.top - h - 4;
      else if (region.body && a.bottom + 4 + h - region.bottom <= a.top - region.top) {
        // Scroll the input up just enough for the panel to fit below it, the input still in view.
        region.body.scrollTop += Math.ceil(a.bottom + 4 + h - region.bottom);
        a = anchor.getBoundingClientRect();
        top = Math.min(a.bottom + 4, region.bottom - h);
      } else top = region.top;
      top = Math.max(region.top, Math.min(top, region.bottom - h));
      const left = Math.max(region.left, Math.min(a.left, region.right - w));
      // A transformed ancestor (the modal's opening animation) would offset a fixed box: correct by it.
      const cur = panel.getBoundingClientRect();
      const dx = panel.style.getPropertyValue('--tx-vendor-left') ? cur.left - parseFloat(panel.style.getPropertyValue('--tx-vendor-left')) : 0;
      const dy = panel.style.getPropertyValue('--tx-vendor-top') ? cur.top - parseFloat(panel.style.getPropertyValue('--tx-vendor-top')) : 0;
      setVar(panel, '--tx-vendor-left', Math.round(left - dx) + 'px');
      setVar(panel, '--tx-vendor-top', Math.round(top - dy) + 'px');
    });
  }
  const vendorWatch = new MutationObserver(pinVendorPanels);
  document.addEventListener('scroll', function () { if (document.querySelector('.tx-vendor-pinned')) pinVendorPanels(); }, true);
  window.addEventListener('resize', function () { if (document.querySelector('.tx-vendor-pinned')) pinVendorPanels(); });

  function scan(root) {
    if (root.matches && root.matches('.palette-editor')) enhance(root);
    if (root.querySelectorAll) root.querySelectorAll('.palette-editor').forEach(enhance);
  }
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (node) { if (node.nodeType === 1) scan(node); });
    });
    if (open && !open.button.isConnected) close(false);
  });
  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    scan(document);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
