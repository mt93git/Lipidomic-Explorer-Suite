/**
 * tour_guide.js
 * Interactive Guided Onboarding Tour & Floating HUD Widget
 * Global Lipidomic Explorer
 */

(function() {
  'use strict';

  var tourActive = false;
  var currentStep = 1;
  var totalSteps = 9;

  var TOUR_STEPS = [
    {
      step: 1,
      badge: "Step 1 of 9 • Data Ingestion",
      title: "Data Ingestion & Validation",
      icon: "fa-cloud-arrow-up",
      targetSelector: "#dock_panel_pipeline .dock-section:first-child",
      dockTab: "pipeline",
      desc: "Import an abundance matrix (<code>.csv</code> or <code>.xlsx</code>) along with its metadata mapping table to begin your lipidomics analysis.",
      highlightNote: "Verifies sample integrity, resolves lipid structural nomenclature, and prepares normalized quantitative matrices.",
      subAction: {
        text: "Point to Data Ingestion",
        action: "window.navigateToDataUpload(this)"
      }
    },
    {
      step: 2,
      badge: "Step 2 of 9 • Unified Dock",
      title: "Unified Left Sidebar Dock",
      icon: "fa-sliders-h",
      targetSelector: ".dock-segmented-switcher",
      dockTab: "pipeline",
      desc: "The unified left sidebar dock organizes analytical controls across three functional pillars:",
      dockPills: [
        { id: "pipeline", label: "Pipeline", icon: "fa-play-circle", desc: "Data ingestion, metadata mapping, pipeline execution, and session export/import." },
        { id: "cohorts", label: "Cohorts & Filters", icon: "fa-filter", desc: "Sample cohort filtering, contrast selection, lipid class filters, and global palettes." },
        { id: "plot_controls", label: "Plot Controls", icon: "fa-sliders-h", desc: "Active plot aesthetics, statistical cutoffs, and dimension controls." }
      ],
      subAction: {
        text: "Point to Dock Tabs",
        action: "window.flashHarmoniousFrame('.dock-segmented-switcher')"
      }
    },
    {
      step: 3,
      badge: "Step 3 of 9 • Analytical Navigation",
      title: "Analytical Navigation",
      icon: "fa-compass",
      targetSelector: "#main_navbar",
      desc: "Navigate across the 6 major analytical domains in the top navbar (<em>Data & Overview, Quality Control, Quantitative, Structural, Targeted Analysis, Reference & Methods</em>).",
      highlightNote: "Each domain groups specialized visualization modules, statistical tests, and interactive inspection tools for systematic lipidomic exploration.",
      subAction: {
        text: "Highlight Top Navbar",
        action: "window.flashHarmoniousFrame('#main_navbar')"
      }
    },
    {
      step: 4,
      badge: "Step 4 of 9 • Rigor & Math Proof",
      title: "Mathematical Demonstration & Audit",
      icon: "fa-square-root-variable",
      targetSelector: "#main_navbar .nav-link:contains('Reference & Methods'), a[data-value='Math Proof']",
      desc: "Inspect the exact 5-step data transformation pipeline with cell-by-cell mathematical proofs: Limit of Detection (LOD) screening, log2 transformation, QRILC left-censored tail imputation, sample median normalization, and exact linear restitution.",
      highlightNote: "Provides bit-for-bit numerical reproducibility, LaTeX export, and transition matrix auditing across all samples and lipids.",
      ctaButton: {
        text: "🔬 Open Live Math Proof",
        action: "window.navigateToMathProof(this)"
      }
    },
    {
      step: 5,
      badge: "Step 5 of 9 • Quality Control",
      title: "2. Quality Control",
      icon: "fa-shield-halved",
      targetSelector: "#main_navbar .nav-link:contains('Quality Control')",
      desc: "Evaluate data distribution profiles, identify potential technical outliers, inspect 2D and 3D Principal Component Analysis (PCA) scores and loadings, and examine sample-to-sample correlation matrices.",
      highlightNote: "Assesses variance structure and confirms sample reproducibility prior to differential comparisons.",
      subAction: {
        text: "Open Quality Control",
        action: "window.navigateToNavbarTab('Quality Control', 'Quality Check', this)"
      }
    },
    {
      step: 6,
      badge: "Step 6 of 9 • Quantitative",
      title: "3. Quantitative Analysis",
      icon: "fa-chart-simple",
      targetSelector: "#main_navbar .nav-link:contains('Quantitative')",
      desc: "Quantify differential lipid abundance across cohorts using hierarchical clustering heatmaps, class composition stacked bar charts, volcano significance plots, and Lipid Set Enrichment Analysis (LSEA).",
      highlightNote: "Applies linear modeling (limma) or non-parametric tests (Wilcoxon) with multiple testing correction.",
      subAction: {
        text: "Open Quantitative",
        action: "window.navigateToNavbarTab('Quantitative', 'Heatmap', this)"
      }
    },
    {
      step: 7,
      badge: "Step 7 of 9 • Structural",
      title: "4. Structural Analysis",
      icon: "fa-dna",
      targetSelector: "#main_navbar .nav-link:contains('Structural')",
      desc: "Analyze molecular lipid structures across carbon chain lengths and double bond unsaturation coordinates. Inspect class and acyl chain proportions, single-class or all-class structural grids, and violin distribution densities.",
      highlightNote: "Reveals systematic elongation, desaturation, and acyl chain remodeling trends across lipid families.",
      subAction: {
        text: "Open Structural",
        action: "window.navigateToNavbarTab('Structural', 'Structural', this)"
      }
    },
    {
      step: 8,
      badge: "Step 8 of 9 • Targeted Analysis",
      title: "5. Targeted Analysis",
      icon: "fa-diagram-project",
      targetSelector: "#main_navbar .nav-link:contains('Targeted Analysis')",
      desc: "Investigate focused biological mechanisms through Factor Level Adjustments (FLA), biosynthetic metabolic pathway networks, organelle-specific stress metrics, and longitudinal trajectory profiles.",
      highlightNote: "Connects quantitative alterations to subcellular organelle stress indicators and metabolic enzymes.",
      subAction: {
        text: "Open Targeted Analysis",
        action: "window.navigateToNavbarTab('Targeted Analysis', 'Functional Ratios', this)"
      }
    },
    {
      step: 9,
      badge: "Step 9 of 9 • Single Lipid Mode",
      title: "Single Lipid Mode (Targeted Isolation)",
      icon: "fa-bullseye",
      targetSelector: "#targeted_lipids_top_dock",
      desc: "Isolate a specific identified lipid species or define custom sub-cohorts rather than evaluating the complete abundance matrix. Restricts all downstream statistical models, PCA projections, and structural visualizations specifically to your chosen targets.",
      highlightNote: "Allows focused evaluation of individual biomarker candidates across experimental cohorts.",
      ctaButton: {
        text: "🎯 Open Single Lipid Selector",
        action: "window.openSingleLipidSelector(this)"
      }
    }
  ];

  function clearSpotlight() {
    $('.tour-spotlight-active, .harmonious-frame-blink').removeClass('tour-spotlight-active harmonious-frame-blink');
  }

  // Elegant harmonious frame blinking effect
  window.flashHarmoniousFrame = function(selectorOrEl) {
    if (!selectorOrEl) return;
    var $target = (typeof selectorOrEl === 'string') ? $(selectorOrEl) : $(selectorOrEl);
    if (!$target || !$target.length) return;

    if ($target.is('input, select, textarea')) {
      if ($target.closest('.shiny-input-container').length) {
        $target = $target.closest('.shiny-input-container');
      } else if ($target.closest('.form-group').length) {
        $target = $target.closest('.form-group');
      } else if ($target.closest('.selectize-control').length) {
        $target = $target.closest('.selectize-control');
      }
    }

    // Explicitly remove all conflicting spotlight / highlight classes
    $target.removeClass('harmonious-frame-blink tour-spotlight-active highlight-focus-pulse highlight-radar');

    // Force synchronous browser repaint/reflow to immediately restart CSS animation at 0%
    if ($target[0]) {
      void $target[0].offsetWidth;
    }

    // Apply the active blinking frame
    $target.addClass('harmonious-frame-blink');

    // Clear prior timer if user clicks multiple times rapidly
    var prevTimer = $target.data('blinkTimer');
    if (prevTimer) {
      clearTimeout(prevTimer);
    }

    var t = setTimeout(function() {
      $target.removeClass('harmonious-frame-blink');
      if (tourActive) {
        $target.addClass('tour-spotlight-active');
      }
    }, 2700);

    $target.data('blinkTimer', t);
  };

  function applySpotlight(selector) {
    clearSpotlight();
    if (!selector) return;
    var $el = $(selector);
    if ($el.length) {
      var $target = $el.first();
      $target.addClass('tour-spotlight-active');
      if (!$target.closest('.navbar, #main_navbar, #targeted_lipids_top_dock').length) {
        try {
          $target[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {}
      } else {
        try {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {}
      }
    }
  }

  function closeOpenModals() {
    var $modals = $('#shiny-modal, .modal');
    if ($modals.length) {
      try { $modals.modal('hide'); } catch (e) {}
    }
    $('.modal-backdrop').remove();
    $('body').removeClass('modal-open').css('overflow', '');
  }

  window.navigateToDataUpload = function(btn) {
    window._lastDataUploadClick = Date.now();
    if (btn) {
      $(btn).addClass('clicking');
      setTimeout(function() { $(btn).removeClass('clicking'); }, 350);
    }
    closeOpenModals();

    // 1. Ensure the Unified Sidebar Dock is on the Pipeline tab
    if (typeof window.activateDockTab === 'function') {
      window.activateDockTab('pipeline');
    }

    // 2. Uncollapse dock if currently collapsed
    var dockEl = document.querySelector('.unified-sidebar-dock');
    var wasCollapsed = dockEl && dockEl.classList.contains('collapsed');
    if (wasCollapsed) {
      dockEl.classList.remove('collapsed');
    }

    // 3. Connect visually to the loading button
    var $target = $('#dock_panel_pipeline .dock-section:first-child');
    if (!$target.length) {
      $target = $('#data_hub-files').closest('.dock-section');
    }

    if ($target.length) {
      $target[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Instantly trigger the blinking frame!
      window.flashHarmoniousFrame($target);

      if (wasCollapsed) {
        setTimeout(function() {
          window.flashHarmoniousFrame($target);
        }, 220);
      }
    }

    var $browseBtn = $('#data_hub-files').closest('.data-upload-container').find('.btn-file, .btn');
    if ($browseBtn.length) {
      $browseBtn.addClass('btn-file-connecting-pulse');
      setTimeout(function() {
        $browseBtn.removeClass('btn-file-connecting-pulse');
      }, 3000);
    }

    // 4. Open native OS file browse window connecting to the loading button
    var fileInput = document.getElementById('data_hub-files');
    if (fileInput) {
      try {
        fileInput.click();
      } catch (err) {
        console.warn('[DataUpload] Triggering file browse window error:', err);
      }
    }
  };

  window.loadDemoDataset = function(btn) {
    if (typeof window.navigateToDataUpload === 'function') {
      window.navigateToDataUpload(btn);
    }
  };

  window.navigateToSessionRestore = function() {
    closeOpenModals();
    if (typeof window.activateDockTab === 'function') {
      window.activateDockTab('pipeline');
    }
    var dockEl = document.querySelector('.unified-sidebar-dock');
    var wasCollapsed = dockEl && dockEl.classList.contains('collapsed');
    if (wasCollapsed) {
      dockEl.classList.remove('collapsed');
    }

    var $target = $('#data_hub-import_session_file').closest('.dock-section');
    if (!$target.length) $target = $('#data_hub-import_session_file');
    if ($target.length) {
      $target[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.flashHarmoniousFrame($target);
      if (wasCollapsed) {
        setTimeout(function() {
          window.flashHarmoniousFrame($target);
        }, 220);
      }
    }
  };

  window.navigateToMathProof = function(btn) {
    if (btn) {
      $(btn).addClass('clicking');
      setTimeout(function() { $(btn).removeClass('clicking'); }, 350);
    }
    // Select Math Proof navbar tab
    var $mathTab = $('a[data-value="Math Proof"], a.dropdown-item:contains("Math Proof")');
    if ($mathTab.length) {
      $mathTab[0].click();
    }
    if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
      Shiny.setInputValue('main_navbar', 'Math Proof');
    }
    // Switch dock to plot_controls and highlight Math Proof controls
    setTimeout(function() {
      if (typeof window.activateDockTab === 'function') {
        window.activateDockTab('plot_controls');
      }
      var dockEl = document.querySelector('.unified-sidebar-dock');
      if (dockEl && dockEl.classList.contains('collapsed')) {
        dockEl.classList.remove('collapsed');
      }
      var $acc = $('#dock_panel_plot_controls .accordion-item:contains("Math Proof Controls")');
      if ($acc.length) {
        var btn = $acc.find('.accordion-button')[0];
        if (btn && btn.classList.contains('collapsed')) btn.click();
        $acc[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.flashHarmoniousFrame($acc);
      }
    }, 250);
  };

  window.navigateToNavbarTab = function(menuText, panelValue, btn) {
    if (btn) {
      $(btn).addClass('clicking');
      setTimeout(function() { $(btn).removeClass('clicking'); }, 350);
    }
    closeOpenModals();
    if (panelValue) {
      var $item = $('a[data-value="' + panelValue + '"], a.dropdown-item:contains("' + panelValue + '")');
      if ($item.length) {
        $item[0].click();
      }
      if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
        Shiny.setInputValue('main_navbar', panelValue);
      }
    }
    setTimeout(function() {
      var $menu = $('#main_navbar .nav-link:contains("' + menuText + '")');
      if ($menu.length) {
        window.flashHarmoniousFrame($menu);
      }
    }, 150);
  };

  window.openSingleLipidSelector = function(btn) {
    if (btn) {
      $(btn).addClass('clicking');
      setTimeout(function() { $(btn).removeClass('clicking'); }, 350);
    }
    closeOpenModals();
    var editBtn = document.getElementById('targeted_lipids_hub-btn_scope_edit');
    var targBtn = document.getElementById('targeted_lipids_hub-btn_scope_targeted');
    if (editBtn) {
      editBtn.click();
    } else if (targBtn) {
      targBtn.click();
    } else if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
      Shiny.setInputValue('targeted_lipids_hub-click_scope_edit', Math.random(), {priority: 'event'});
    }
    setTimeout(function() {
      window.flashHarmoniousFrame('#targeted_lipids_top_dock');
    }, 150);
  };

  window.previewDockTab = function(dockTabId) {
    if (typeof window.activateDockTab === 'function') {
      window.activateDockTab(dockTabId);
    }
    var dockEl = document.querySelector('.unified-sidebar-dock');
    if (dockEl && dockEl.classList.contains('collapsed')) {
      dockEl.classList.remove('collapsed');
    }
    $('.dock-pill-btn').removeClass('active');
    $('#dock_pill_' + dockTabId).addClass('active');

    var pills = (TOUR_STEPS[1] && TOUR_STEPS[1].dockPills) ? TOUR_STEPS[1].dockPills : [];
    var match = pills.filter(function(p) { return p.id === dockTabId; })[0];
    if (match && document.getElementById('dock_pill_desc')) {
      $('#dock_pill_desc').html('<i class="fas ' + match.icon + ' text-primary me-1"></i> <strong>' + match.label + ':</strong> ' + match.desc);
    }

    // Flash the active dock panel harmoniously
    var $panel = $('#dock_panel_' + dockTabId);
    if ($panel.length) {
      window.flashHarmoniousFrame($panel);
    }
  };

  function renderHud(stepData) {
    var $hud = $('#tour_guide_hud');
    if (!$hud.length) {
      $('body').append('<div id="tour_guide_hud" class="tour-hud-widget shadow-lg"></div>');
      $hud = $('#tour_guide_hud');
    }

    var progressPct = Math.round((stepData.step / totalSteps) * 100);

    var pillsHtml = '';
    if (stepData.dockPills && stepData.dockPills.length) {
      pillsHtml += '<div class="tour-hud-pills-container mt-2 mb-2">';
      stepData.dockPills.forEach(function(pill) {
        var activeCls = (pill.id === 'pipeline') ? ' active' : '';
        pillsHtml += '<button type="button" id="dock_pill_' + pill.id + '" class="btn btn-sm btn-outline-secondary dock-pill-btn' + activeCls + '" onclick="window.previewDockTab(\'' + pill.id + '\')">';
        pillsHtml += '<i class="fas ' + pill.icon + ' me-1"></i> ' + pill.label;
        pillsHtml += '</button>';
      });
      var firstPill = stepData.dockPills[0];
      pillsHtml += '<div id="dock_pill_desc" class="small text-muted p-2 rounded bg-light border mb-2">';
      if (firstPill) {
        pillsHtml += '<i class="fas ' + firstPill.icon + ' text-primary me-1"></i> <strong>' + firstPill.label + ':</strong> ' + firstPill.desc;
      } else {
        pillsHtml += '<i class="fas fa-info-circle text-primary me-1"></i> Click the tabs above to preview the left sidebar dock adapting in real time.';
      }
      pillsHtml += '</div>';
    }

    var ctaHtml = '';
    if (stepData.ctaButton) {
      ctaHtml = '<div class="mt-3 mb-1 text-center">' +
        '<button type="button" class="btn btn-sm btn-primary w-100 fw-bold py-2 shadow-sm tour-pointer-btn" onclick="' + stepData.ctaButton.action + '">' +
        stepData.ctaButton.text +
        '</button>' +
        '</div>';
    } else if (stepData.subAction) {
      ctaHtml = '<div class="mt-2 mb-1">' +
        '<button type="button" class="btn btn-sm btn-outline-primary py-1 px-3 fw-semibold shadow-sm tour-pointer-btn" onclick="' + stepData.subAction.action + '">' +
        '<i class="fas fa-arrow-pointer me-1 text-primary"></i> ' + stepData.subAction.text +
        '</button>' +
        '</div>';
    }

    var highlightNoteHtml = '';
    if (stepData.highlightNote) {
      highlightNoteHtml = '<div class="tour-hud-note mt-2 p-2 rounded border bg-light-subtle small text-dark">' +
        stepData.highlightNote +
        '</div>';
    }

    var prevDisabled = (stepData.step === 1) ? ' disabled' : '';
    var nextLabel = (stepData.step === totalSteps) ? 'Finish <i class="fas fa-check ms-1"></i>' : 'Next <i class="fas fa-arrow-right ms-1"></i>';
    var nextBtnClass = (stepData.step === totalSteps) ? 'btn-success' : 'btn-primary';

    var html = '' +
      '<div class="tour-hud-progress">' +
      '  <div class="tour-hud-progress-bar" style="width: ' + progressPct + '%;"></div>' +
      '</div>' +
      '<div class="tour-hud-inner p-3">' +
      '  <div class="d-flex align-items-center justify-content-between mb-2">' +
      '    <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 small fw-semibold">' +
      '      <i class="fas ' + stepData.icon + ' me-1"></i> ' + stepData.badge +
      '    </span>' +
      '    <button type="button" class="btn btn-sm btn-close tour-close-btn" onclick="window.exitGuidedTour()" title="Close Walkthrough" aria-label="Close"></button>' +
      '  </div>' +
      '  <h6 class="tour-hud-title fw-bold text-dark mb-2">' + stepData.title + '</h6>' +
      '  <div class="tour-hud-body text-secondary small mb-2" style="line-height: 1.55;">' +
      stepData.desc +
      '  </div>' +
      pillsHtml +
      highlightNoteHtml +
      ctaHtml +
      '  <div class="d-flex align-items-center justify-content-between mt-3 pt-2 border-top">' +
      '    <button type="button" class="btn btn-sm btn-link text-muted text-decoration-none p-0" onclick="window.exitGuidedTour()">' +
      '      Exit Tour' +
      '    </button>' +
      '    <div class="d-flex gap-2">' +
      '      <button type="button" class="btn btn-sm btn-outline-secondary px-3"' + prevDisabled + ' onclick="window.prevTourStep()">' +
      '        <i class="fas fa-arrow-left me-1"></i> Previous' +
      '      </button>' +
      '      <button type="button" class="btn btn-sm ' + nextBtnClass + ' px-3 fw-semibold" onclick="window.nextTourStep()">' +
      nextLabel +
      '      </button>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    $hud.html(html);
  }

  window.goToTourStep = function(stepIndex) {
    if (stepIndex < 1) stepIndex = 1;
    if (stepIndex > totalSteps) {
      window.exitGuidedTour();
      return;
    }
    currentStep = stepIndex;
    var stepData = TOUR_STEPS[currentStep - 1];

    // Dock positioning
    if (stepData.dockTab && typeof window.activateDockTab === 'function') {
      window.activateDockTab(stepData.dockTab);
      var dockEl = document.querySelector('.unified-sidebar-dock');
      if (dockEl && dockEl.classList.contains('collapsed')) {
        dockEl.classList.remove('collapsed');
      }
    }

    // Render HUD
    renderHud(stepData);

    // Apply spotlight
    setTimeout(function() {
      applySpotlight(stepData.targetSelector);
    }, 150);

    if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
      Shiny.setInputValue('tour_state', { active: true, step: currentStep }, { priority: 'event' });
    }
  };

  window.startGuidedTour = function(initialStep) {
    closeOpenModals();
    tourActive = true;
    window.goToTourStep(initialStep || 1);
  };

  window.nextTourStep = function() {
    window.goToTourStep(currentStep + 1);
  };

  window.prevTourStep = function() {
    window.goToTourStep(currentStep - 1);
  };

  window.exitGuidedTour = function() {
    tourActive = false;
    clearSpotlight();
    $('#tour_guide_hud').remove();
    if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
      Shiny.setInputValue('tour_state', { active: false, step: currentStep }, { priority: 'event' });
    }
  };

  // Register Shiny custom message handlers once Shiny is ready
  $(document).on('shiny:connected', function() {
    if (window.Shiny && typeof window.Shiny.addCustomMessageHandler === 'function') {
      Shiny.addCustomMessageHandler('startGuidedTour', function(msg) {
        var st = (msg && msg.step) ? msg.step : 1;
        window.startGuidedTour(st);
      });
      Shiny.addCustomMessageHandler('loadDemoDataset', function(msg) {
        window.loadDemoDataset();
      });
      Shiny.addCustomMessageHandler('navigateToDataUpload', function(msg) {
        if (!window._lastDataUploadClick || (Date.now() - window._lastDataUploadClick > 1500)) {
          window.navigateToDataUpload();
        }
      });
      Shiny.addCustomMessageHandler('navigateToSessionRestore', function(msg) {
        window.navigateToSessionRestore();
      });
      Shiny.addCustomMessageHandler('navigateToMathProof', function(msg) {
        window.navigateToMathProof();
      });
      Shiny.addCustomMessageHandler('pipelineExecutionActive', function(msg) {
        var $runBtn = $('.btn-run-analysis, #data_hub-runAnalysis');
        $runBtn.removeClass('btn-run-analysis-primed').addClass('btn-run-analysis-running');
        setTimeout(function() {
          $runBtn.removeClass('btn-run-analysis-running');
        }, 3500);
      });
    }
  });

  // Connect file selection in native browse dialog to loading button and Run Analysis activation
  $(document).on('change', '#data_hub-files', function() {
    if (this.files && this.files.length > 0) {
      // Highlight loading button
      var $browseBtn = $(this).closest('.data-upload-container').find('.btn-file, .btn');
      $browseBtn.removeClass('btn-file-connecting-pulse').addClass('btn-file-loaded');
      setTimeout(function() { $browseBtn.removeClass('btn-file-loaded'); }, 3500);

      // Visually activate and prime the Run Analysis button
      var $runBtn = $('.btn-run-analysis, #data_hub-runAnalysis');
      $runBtn.addClass('btn-run-analysis-primed');

      // Connect visually to the pipeline execution section
      var $pipelineSection = $runBtn.closest('.dock-section');
      if ($pipelineSection.length && typeof window.flashHarmoniousFrame === 'function') {
        window.flashHarmoniousFrame($pipelineSection);
      }
    }
  });

  window.showWelcomeModal = function() {
    if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
      window.Shiny.setInputValue('trigger_show_welcome_modal', Math.random(), { priority: 'event' });
    }
  };

  // Clear active spotlight when a modal is opened to prevent visual clipping
  $(document).on('show.bs.modal', function() {
    clearSpotlight();
  });

})();
