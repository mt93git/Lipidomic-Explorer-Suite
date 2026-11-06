(function () {
  function pickerInput(field) {
    return field && field.querySelector('.palette-color-input input');
  }
  function syncField(field) {
    const input = pickerInput(field);
    const button = field && field.querySelector('.palette-swatch-button');
    if (!input || !button) return;
    const value = input.value;
    if (/^#[0-9a-fA-F]{6}$/.test(value)) {
      button.style.setProperty('--palette-color', value);
      button.setAttribute('aria-label', 'Choose color for ' + field.dataset.paletteLabel + ', current color ' + value);
    }
    input.tabIndex = field.closest('.palette-show-hex') ? 0 : -1;
  }
  function syncAll(root) {
    (root || document).querySelectorAll('.palette-color-field').forEach(syncField);
  }
  function setExpanded(button, expanded) {
    if (button && button.getAttribute('aria-expanded') !== String(expanded)) {
      button.setAttribute('aria-expanded', String(expanded));
    }
  }
  function syncPickerState() {
    const active = document.querySelector('.palette-editor .colourpicker-focus');
    const activeField = active && active.closest('.palette-color-field');
    document.querySelectorAll('.palette-color-field').forEach(function (field) {
      const button = field.querySelector('.palette-swatch-button');
      // palette_swatches.js owns the swatch button state once it has taken over the editor.
      if (button && button.hasAttribute('aria-expanded') && !field.closest('.tx-swatches')) {
        setExpanded(button, field === activeField);
      }
    });
  }
  document.addEventListener('click', function (event) {
    if (event.target.closest('.tx-swatches .palette-swatch-button, .tx-swatch-pop')) return;
    const button = event.target.closest('.palette-swatch-button');
    const popup = event.target.closest('.colourpicker-panel, .sp-container');
    document.querySelectorAll('.palette-editor:not(.tx-swatches) .palette-swatch-button[aria-expanded="true"]').forEach(function (openButton) {
      if (openButton === button || (!button && popup)) return;
      const field = openButton.closest('.palette-color-field');
      const input = pickerInput(field);
      if (input && window.jQuery && window.jQuery.fn.colourpicker) {
        window.jQuery(input).colourpicker('hide');
      }
      setExpanded(openButton, false);
    });
    if (!button) return;
    const input = pickerInput(button.closest('.palette-color-field'));
    if (!input) return;
    // colourpicker opens on focus, and also exposes an explicit show method.
    // The method keeps keyboard focus on this visible button.
    if (window.jQuery && window.jQuery.fn.colourpicker) {
      window.jQuery(input).colourpicker('show');
      setExpanded(button, true);
    } else {
      input.focus();
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    const active = document.querySelector('.palette-editor .colourpicker-focus');
    if (!active) return;
    const field = active.closest('.palette-color-field');
    const input = pickerInput(field);
    if (input && window.jQuery && window.jQuery.fn.colourpicker) {
      window.jQuery(input).colourpicker('hide');
    }
    const button = field && field.querySelector('.palette-swatch-button');
    if (button) {
      setExpanded(button, false);
      button.focus();
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);
  document.addEventListener('input', function (event) {
    const field = event.target.closest('.palette-color-field');
    if (field) syncField(field);
  });
  document.addEventListener('change', function (event) {
    const field = event.target.closest('.palette-color-field');
    if (field) syncField(field);
    if (event.target.matches('.palette-advanced-toggle input')) {
      const editor = event.target.closest('.palette-editor');
      if (editor) {
        editor.classList.toggle('palette-show-hex', event.target.checked);
        syncAll(editor);
      }
    }
  });
  if (window.jQuery) {
    window.jQuery(document).on('change.paletteEditor input.paletteEditor',
      '.palette-color-input .colourpicker-input', function () {
        syncField(this.closest('.palette-color-field'));
      });
  }
  const observer = new MutationObserver(function (mutations) {
    // Only added subtrees can hold new fields (or new parts of an existing field), and only class
    // changes inside a palette editor can move colourpicker focus; the rest of the page is skipped.
    const fields = new Set();
    mutations.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (node) {
        if (node.nodeType !== 1) return;
        const own = node.closest('.palette-color-field');
        if (own) fields.add(own);
        node.querySelectorAll('.palette-color-field').forEach(function (field) { fields.add(field); });
      });
    });
    fields.forEach(syncField);
    if (mutations.some(function (m) { return m.type === 'attributes' && m.attributeName === 'class' && m.target.closest && m.target.closest('.palette-editor'); })) syncPickerState();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      syncAll(document);
    });
  } else {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    syncAll(document);
  }
})();
