/* Move existing bound controls, never clone IDs or maintain a second scientific state. */
(() => {
  const move = (node, target) => { const slot = document.getElementById(target); if(node && slot && node.parentNode !== slot) slot.appendChild(node); };
  function updateNavigation() {
    const active=document.querySelector('#main_navbar .nav-link.active[data-value]');
    const guided=['Experiment','Design','Question','Results','3D Show','Share'];
    document.body.classList.add('shared-guided');
    document.body.classList.toggle('shared-guide-page-active',guided.includes(active?.dataset.value));
  }
  function mount() {
    updateNavigation();
    const upload = document.getElementById('data_hub-files');
    if(upload) move(upload.closest('.dock-section'), 'shared-upload-slot');
    const run = document.getElementById('data_hub-runAnalysis');
    if(run) move(run.closest('.dock-section'),'shared-run-slot');
    const restore = document.getElementById('data_hub-import_session_file');
    if(restore) move(restore.closest('.dock-section'),'shared-session-slot');
    if(restore) move(restore.closest('.shiny-input-container'),'shared-restore-slot');
    move(document.getElementById('data_hub-import_status_display'),'shared-restore-slot');
    const de = document.getElementById('data_hub-deMethod');
    if(de) { const item=de.closest('.accordion-item');move(item,'shared-contrast-slot');item?.querySelector('.accordion-collapse')?.classList.add('show'); }
  }
  document.addEventListener('DOMContentLoaded',mount);
  document.addEventListener('click', e => {const b=e.target.closest('[data-shared-tool]');if(b&&window.Shiny)Shiny.setInputValue('shared_tool',b.dataset.sharedTool,{priority:'event'});});
  if(window.jQuery)jQuery(document).on('shiny:connected shiny:bound',mount).on('shown.bs.tab',updateNavigation);
})();
