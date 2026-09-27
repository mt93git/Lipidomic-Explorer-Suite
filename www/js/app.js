// ==============================================================================
// REAL-TIME RSTUDIO CONSOLE INTERACTION & CLICK TRACER
// Intercepts all button clicks, file uploads, tab switches, and interactions
// and transmits them live to the R session to be displayed in the RStudio console.
// ==============================================================================
(function() {
  function sendTraceToShiny(eventType, payload) {
    if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
      window.Shiny.setInputValue('client_ui_trace', {
        type: eventType,
        payload: payload,
        timestamp: new Date().toLocaleTimeString()
      }, { priority: 'event' });
    }
  }

  // 1. Universal Click Interceptor for buttons, tabs, accordions, and controls
  $(document).on('click', 'button, .btn, .action-button, .dock-segment-btn, a.nav-link, .nav-tabs a, .nav-pills a, input[type="file"], input[type="checkbox"], input[type="radio"], select, .dropdown-item, .accordion-button, .sidebar-btn-centered', function(e) {
    var $el = $(this);
    var id = $el.attr('id') || $el.attr('name') || $el.data('dock-target') || $el.data('bs-target') || '';
    var label = $el.text().trim().replace(/\s+/g, ' ');
    if (!label && $el.attr('title')) label = $el.attr('title');
    if (!label && $el.attr('aria-label')) label = $el.attr('aria-label');
    if (!label && $el.find('i').length) label = '[Icon: ' + $el.find('i').attr('class') + ']';
    if (label.length > 50) label = label.substring(0, 50) + '...';
    
    var tag = this.tagName;
    var classes = $el.attr('class') || '';
    var dockTarget = $el.data('dock-target') || '';
    
    sendTraceToShiny('CLICK', {
      tag: tag,
      id: id || '(no id)',
      label: label || '(no label)',
      dock_target: dockTarget,
      classes: classes.substring(0, 80)
    });
  });

  // 2. File Input Selection & Change Tracker
  $(document).on('change', 'input[type="file"]', function(e) {
    var files = this.files;
    var fileDetails = [];
    if (files && files.length > 0) {
      for (var i = 0; i < files.length; i++) {
        fileDetails.push({
          name: files[i].name,
          size: files[i].size,
          size_mb: (files[i].size / (1024 * 1024)).toFixed(2) + ' MB',
          type: files[i].type || 'unknown'
        });
      }
    }
    sendTraceToShiny('FILE_SELECTED', {
      input_id: $(this).attr('id') || 'unknown',
      count: fileDetails.length,
      files: fileDetails
    });
  });

  // 3. Shiny File Upload Complete Event
  $(document).on('shiny:file-uploaded', function(event) {
    sendTraceToShiny('FILE_UPLOAD_COMPLETE', {
      input_id: event.target ? event.target.id : 'unknown'
    });
  });

  // 4. Shiny Connection Status
  $(document).on('shiny:connected', function() {
    sendTraceToShiny('STATUS', { message: 'Shiny connected successfully to browser session' });
  });

  // 5. Catch and Report Unhandled Client-side Errors to R
  window.addEventListener('error', function(e) {
    sendTraceToShiny('JS_ERROR', {
      message: e.message || 'Unknown error',
      filename: e.filename || '',
      lineno: e.lineno || 0,
      colno: e.colno || 0
    });
  });

  // 6. Modal Backdrop Auto-Remover (prevents screen freezing on modal close)
  $(document).on('hidden.bs.modal', function() {
    setTimeout(function() {
      if ($('.modal.show').length === 0) {
        $('.modal-backdrop').remove();
        $('body').removeClass('modal-open').css('overflow', '');
      }
    }, 150);
  });
})();

      // Programmatic Download Trigger via Custom Message Handler
      function initAppCustomHandlers() {
        if (window.Shiny && typeof window.Shiny.addCustomMessageHandler === 'function') {
          try {
            window.Shiny.addCustomMessageHandler('triggerClick', function(message) {
              if (message && message.id) {
                var el = document.getElementById(message.id);
                if (el && typeof el.click === 'function') {
                  el.click();
                }
              }
            });

            window.Shiny.addCustomMessageHandler('setTimePointControlState', function(msg) {
              if (!msg || !msg.id) return;
              var el = document.getElementById(msg.id);
              var container = msg.containerId ? document.getElementById(msg.containerId) : (el ? el.closest('.timepoint-checkbox-container') : null);

              if (msg.enabled) {
                if (el) {
                  el.disabled = false;
                  el.removeAttribute('disabled');
                  $(el).prop('disabled', false);
                }
                if (container) {
                  container.classList.remove('control-disabled-greyed');
                  $(container).css({'opacity': '1', 'cursor': 'default'});
                }
              } else {
                if (el) {
                  el.disabled = true;
                  el.setAttribute('disabled', 'disabled');
                  $(el).prop('disabled', true).prop('checked', false);
                }
                if (container) {
                  container.classList.add('control-disabled-greyed');
                  $(container).css({'opacity': '0.52', 'cursor': 'not-allowed'});
                }
              }
            });
          } catch(e) {}
        }
      }
      initAppCustomHandlers();
      $(function() {
        initAppCustomHandlers();
        // Ensure initial disabled state is strictly applied to DOM element
        var tpInput = document.getElementById('data_hub-deOrientTimePoint');
        if (tpInput && !tpInput.checked) {
          var container = tpInput.closest('.timepoint-checkbox-container');
          if (container && container.classList.contains('control-disabled-greyed')) {
            tpInput.disabled = true;
            tpInput.setAttribute('disabled', 'disabled');
            $(tpInput).prop('disabled', true);
          }
        }
      });
      $(document).on('shiny:connected', initAppCustomHandlers);

      // Helper function to dismiss and remove all active tooltips
      window.dismissAllTooltips = function() {
        $('.tooltip').removeClass('show').remove();
        if (window.bootstrap && window.bootstrap.Tooltip) {
          document.querySelectorAll('[data-bs-toggle="tooltip"], [data-toggle="tooltip"], .tp-info-tooltip-trigger').forEach(function(el) {
            try {
              var inst = window.bootstrap.Tooltip.getInstance(el);
              if (inst) inst.hide();
            } catch(e) {}
          });
        }
      };

      // Open Metadata Mapping Modal Programmatically
      window.triggerOpenMetadataMapping = function(e) {
        if (e) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }

        // Immediately dismiss and destroy all tooltips
        window.dismissAllTooltips();

        var btn = document.getElementById('data_hub-openMetadataMappingBtn') ||
                  document.querySelector('.btn-metadata-mapping');
        if (btn) {
          btn.click();
        } else if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('data_hub-openMetadataMappingBtn', Math.random(), {priority: 'event'});
        }
      };

      // Guard: prevent clicks on disabled container from toggling the checkbox, while allowing tooltip interaction
      $(document).on('click', '.control-disabled-greyed', function(e) {
        if ($(e.target).closest('.tp-info-tooltip-trigger, .open-meta-mapping-link, bslib-tooltip, .bslib-tooltip, .fa-circle-info, a').length > 0) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
      });

      // Dismiss tooltips when clicking on the link inside the tooltip
      $(document).on('click', '.open-meta-mapping-link', function(e) {
        window.dismissAllTooltips();
      });

      // Dismiss tooltips when clicking anywhere outside of tooltip trigger or tooltip content
      $(document).on('click', function(e) {
        if (!$(e.target).closest('.tp-info-tooltip-trigger, .tooltip, [data-bs-toggle="tooltip"]').length) {
          window.dismissAllTooltips();
        }
      });

      // When any modal shows or hides, dismiss all tooltips
      $(document).on('show.bs.modal shown.bs.modal hide.bs.modal hidden.bs.modal', function() {
        window.dismissAllTooltips();
      });

      // Interactive tooltip hover retention: allow cursor to move from icon into tooltip to click links
      $(document).on('mouseenter', '.tooltip', function() {
        $(this).stop(true, true).css({'opacity': '1', 'display': 'block'}).addClass('show');
      }).on('mouseleave', '.tooltip', function() {
        var $tip = $(this);
        setTimeout(function() {
          if (!$tip.is(':hover')) {
            $tip.removeClass('show').css({'opacity': '', 'display': 'none'}).remove();
          }
        }, 150);
      });

      // Instant Client-Side Lexicon Search Filter
      $(document).on('input', '#lexicon-filter-input', function() {
        var q = $(this).val().toLowerCase().trim();
        $('.lexicon-item').each(function() {
          var text = $(this).text().toLowerCase();
          $(this).toggle(!q || text.indexOf(q) !== -1);

        });
      });

      // ==============================================================================
      // CORE SIDEBAR TRANSITION & SCROLL UTILITIES
      // ==============================================================================
      function collapseSidebar($sb) {
        if (!$sb || $sb.length === 0) return;
        $sb.each(function() {
          var $el = $(this);
          var $layout = $el.closest('.bslib-sidebar-layout');
          var $toggle = $layout.find('> .collapse-toggle, > button.collapse-toggle');
          if ($toggle.length && $toggle.attr('aria-expanded') === 'true') {
            $toggle.first().click();
          } else {
            $el.addClass('sidebar-collapsed');
            if ($layout.length) $layout.addClass('sidebar-collapsed-layout');
          }
        });
      }
      window.collapseSidebar = collapseSidebar;

      function expandSidebar($sb) {
        if (!$sb || $sb.length === 0) return;
        $sb.each(function() {
          var $el = $(this);
          var $layout = $el.closest('.bslib-sidebar-layout');
          var $toggle = $layout.find('> .collapse-toggle, > button.collapse-toggle');
          if ($toggle.length && $toggle.attr('aria-expanded') === 'false') {
            $toggle.first().click();
          } else {
            $el.removeClass('sidebar-collapsed');
            if ($layout.length) $layout.removeClass('sidebar-collapsed-layout');
          }
        });
      }
      window.expandSidebar = expandSidebar;

      function switchSidebar(sidebarToExpand, sidebarToCollapse, onReady) {
        var isOtherExpanded = sidebarToCollapse && sidebarToCollapse.length &&
                              sidebarToCollapse.filter(':visible:not(.sidebar-collapsed)').length > 0;

        if (isOtherExpanded) {
          // 1. Fluid Retraction of the opened sidebar first
          collapseSidebar(sidebarToCollapse);

          // 2. Smoothly open the target sidebar after retraction initiates
          setTimeout(function() {
            expandSidebar(sidebarToExpand);
            if (typeof onReady === 'function') {
              setTimeout(onReady, 60);
            }
          }, 180);
        } else {
          // Other sidebar is already retracted: open target sidebar directly
          expandSidebar(sidebarToExpand);
          if (typeof onReady === 'function') {
            setTimeout(onReady, 50);
          }
        }
      }
      window.switchSidebar = switchSidebar;

      function openAccordionItem($item) {
        if (!$item || !$item.length) return;

        // 1. Expand ancestor accordion items if nested (e.g. in secondary sidebars)
        $item.parents('.accordion-item').each(function() {
          var $p = $(this);
          var pBtn = $p.children('.accordion-header').find('.accordion-button')[0] ||
                     $p.find('.accordion-button')[0];
          var pCollapse = $p.children('.accordion-collapse')[0] ||
                          $p.find('.accordion-collapse')[0];
          if (pBtn && pBtn.classList.contains('collapsed')) {
            pBtn.click();
          }
          if (pCollapse && window.bootstrap && window.bootstrap.Collapse) {
            try {
              window.bootstrap.Collapse.getOrCreateInstance(pCollapse, { toggle: false }).show();
            } catch (e) {}
          }
        });

        // 2. Expand target item itself
        var btn = $item.children('.accordion-header').find('.accordion-button')[0] ||
                  $item.find('.accordion-button')[0];
        var collapseEl = $item.children('.accordion-collapse')[0] ||
                         $item.find('.accordion-collapse')[0];

        if (btn && btn.classList.contains('collapsed')) {
          btn.click();
        }
        if (collapseEl && window.bootstrap && window.bootstrap.Collapse) {
          try {
            window.bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show();
          } catch (e) {}
        }

        // 3. Inform Shiny server of active panel for main accordion
        var val = $item.attr('data-value');
        if (val && window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('data_hub-main_accordion', val);
        }
      }
      window.openAccordionItem = openAccordionItem;

      function scrollDrawerToItem($drawer, $item) {
        if (!$drawer || !$drawer.length || !$item || !$item.length) return;
        var drawerEl = $drawer[0];
        var itemEl = $item[0];

        // Ensure accordion item is fully expanded
        openAccordionItem($item);

        function performScroll() {
          var drawerRect = drawerEl.getBoundingClientRect();
          var itemRect = itemEl.getBoundingClientRect();
          var relativeTop = itemRect.top - drawerRect.top + drawerEl.scrollTop;
          var targetScroll = Math.max(0, Math.round(relativeTop));

          drawerEl.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          });
        }

        performScroll();
        setTimeout(performScroll, 50);
        setTimeout(performScroll, 160);
        setTimeout(performScroll, 320);
        setTimeout(performScroll, 500);
      }
      window.scrollDrawerToItem = scrollDrawerToItem;

      window.syncInlineDEMode = function(modeVal) {
        var radio = document.querySelector('input[name="data_hub-deComparisonMode"][value="' + modeVal + '"]');
        if (radio) {
          radio.checked = true;
          $(radio).trigger('change');
        }
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('data_hub-deComparisonMode', modeVal, {priority: 'event'});
          window.Shiny.setInputValue('data_hub-inline_de_mode', modeVal, {priority: 'event'});
        }
        document.querySelectorAll('.de-inline-mode-btn').forEach(function(btn) {
          if (btn.getAttribute('data-mode') === modeVal) {
            btn.classList.add('active', 'btn-primary');
            btn.classList.remove('btn-outline-primary');
          } else {
            btn.classList.remove('active', 'btn-primary');
            btn.classList.add('btn-outline-primary');
          }
        });
        document.querySelectorAll('.de-inline-direct-panel').forEach(function(el) {
          el.style.display = (modeVal === 'direct') ? 'flex' : 'none';
        });
        document.querySelectorAll('.de-inline-interaction-panel').forEach(function(el) {
          el.style.display = (modeVal === 'interaction') ? 'flex' : 'none';
        });
      };

      var _isSyncingDE = false;
      window.syncInlineDEToSidebar = function(targetType, selectEl) {
        if (!selectEl || _isSyncingDE) return;
        _isSyncingDE = true;
        try {
          var selectedVals = [];
          if (selectEl.selectize) {
            selectedVals = selectEl.selectize.getValue();
            if (!Array.isArray(selectedVals)) {
              selectedVals = selectedVals ? [selectedVals] : [];
            }
          } else {
            selectedVals = Array.from(selectEl.selectedOptions).map(function(opt) { return opt.value; });
          }

          var sidebarId = (targetType === 'ref') ? 'data_hub-deReferenceGroups' : 'data_hub-deComparisonGroups';
          var shinyEventName = (targetType === 'ref') ? 'data_hub-inline_de_ref' : 'data_hub-inline_de_comp';

          // 1. Sync sidebar selectize instance silently (silent = true prevents loop)
          var $sideEl = $('#' + sidebarId);
          if ($sideEl.length && $sideEl[0].selectize) {
            $sideEl[0].selectize.setValue(selectedVals, true);
          }

          // 2. Notify Shiny reactive domain
          if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
            window.Shiny.setInputValue(sidebarId, selectedVals);
            window.Shiny.setInputValue(shinyEventName, selectedVals);
          }
        } finally {
          _isSyncingDE = false;
        }
      };

      window.syncInlineDEInteraction = function(field, val) {
        var sideInput = document.getElementById('data_hub-' + field);
        if (sideInput) {
          sideInput.value = val;
          $(sideInput).trigger('change');
        }
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('data_hub-' + field, val, {priority: 'event'});
        }
      };

      window.pointToDifferentialExpressionMenu = function(e) {
        if (e && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        if (e && typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }

        // Animated feedback on the clicked button itself
        if (e && e.target) {
          var clickedBtn = e.target.closest('.btn-point-de-menu, .btn-open-de-menu');
          if (clickedBtn) {
            var crosshairIcon = clickedBtn.querySelector('.fa-crosshairs, .fa-sliders');
            if (crosshairIcon) {
              crosshairIcon.classList.add('fa-spin');
              setTimeout(function() { crosshairIcon.classList.remove('fa-spin'); }, 1200);
            }
          }
        }

        // 0. Notify Shiny server unconditionally and immediately
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('trigger_open_de_menu', Math.random(), {priority: 'event'});
          window.Shiny.setInputValue('data_hub-ensure_analysis_run', Math.random(), {priority: 'event'});
          window.Shiny.setInputValue('data_hub-main_accordion', '3. Differential Expression');
        }

        // Debounce guard: prevent rapid multiple executions within 500ms
        if (window._isOpeningDEMenu) return;
        window._isOpeningDEMenu = true;
        setTimeout(function() { window._isOpeningDEMenu = false; }, 500);

        if (typeof window.activateDockTab === 'function') {
          window.activateDockTab('cohorts');
        }
        var dockEl = document.querySelector('.unified-sidebar-dock');
        if (dockEl && dockEl.classList.contains('collapsed')) {
          dockEl.classList.remove('collapsed');
        }

        try {
          var $drawer = $('.unified-sidebar-dock .sidebar-content');
          if (!$drawer.length) $drawer = $('#dock_panel_cohorts').closest('.sidebar-content');
          if (!$drawer.length) $drawer = $('.sidebar-content');

          // Collapse Sample Selection panel so Differential Expression moves to the very top
          var $sampleSelItem = $('#dock_panel_cohorts .accordion-item').filter(function() {
            return $(this).text().indexOf('Sample Selection') !== -1;
          });
          if ($sampleSelItem.length) {
            var sampleBtn = $sampleSelItem.find('.accordion-button')[0];
            if (sampleBtn && !sampleBtn.classList.contains('collapsed')) {
              sampleBtn.click();
            }
          }

          var $deItem = $('#dock_panel_cohorts .accordion-item').filter(function() {
            return $(this).text().indexOf('Differential Expression') !== -1;
          });
          if (!$deItem.length) {
            $deItem = $('#data_hub-main_accordion .accordion-item[data-value="3. Differential Expression"]');
          }
          if (!$deItem.length) {
            $('.accordion-item').each(function() {
              if ($(this).text().indexOf('Differential Expression') !== -1) {
                $deItem = $(this);
                return false;
              }
            });
          }

          if ($deItem && $deItem.length) {
            // Expand Differential Expression panel if collapsed
            var btn = $deItem.find('.accordion-button')[0];
            var collapseEl = $deItem.find('.accordion-collapse')[0];
            if (btn && btn.classList.contains('collapsed')) {
              btn.click();
            } else if (collapseEl && window.bootstrap && window.bootstrap.Collapse) {
              try { window.bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show(); } catch (e) {}
            }

            // Target the actual cohort selection textboxes
            var $targetItem = $('#data_hub-deReferenceGroupUI');
            if (!$targetItem.length || !$targetItem.is(':visible')) {
              $targetItem = $deItem.find('.dock-group-block').filter(function() {
                return $(this).text().indexOf('Compared Analysis') !== -1 || $(this).text().indexOf('Contrast Definition') !== -1;
              });
            }
            if (!$targetItem.length) $targetItem = $deItem;

            // Scroll the actual scrolling container (.sidebar-content)
            setTimeout(function() {
              if ($drawer.length && $targetItem.length) {
                var drawerEl = $drawer[0];
                var itemEl = $targetItem[0];
                var offset = itemEl.getBoundingClientRect().top - drawerEl.getBoundingClientRect().top + drawerEl.scrollTop - 20;
                $drawer.stop().animate({ scrollTop: Math.max(0, offset) }, 300);
              }
            }, 120);

            // Visual halo pulse feedback
            var applyPulse = function() {
              var elementsToPulse = [$deItem[0]];
              var pointedSelectors = [
                '#data_hub-deReferenceGroupUI',
                '#data_hub-deComparisonGroupUI',
                '#data_hub-deInteractionGroupUI'
              ];
              for (var s = 0; s < pointedSelectors.length; s++) {
                var target = document.querySelector(pointedSelectors[s]);
                if (target) {
                  var innerInput = target.querySelector('.selectize-input');
                  if (innerInput) elementsToPulse.push(innerInput);
                  else elementsToPulse.push(target);
                }
              }

              elementsToPulse.forEach(function(el) {
                if (el) {
                  el.classList.remove('de-menu-highlight-pulse');
                  void el.offsetWidth;
                  el.classList.add('de-menu-highlight-pulse');
                  setTimeout(function() { el.classList.remove('de-menu-highlight-pulse'); }, 3000);
                }
              });
            };

            setTimeout(applyPulse, 180);

            // Focus the first interactive selectize input
            setTimeout(function() {
              var firstInput = document.querySelector('#data_hub-deReferenceGroupUI .selectize-input input, #data_hub-deReferenceGroupUI select');
              if (firstInput && typeof firstInput.focus === 'function') {
                try { firstInput.focus(); } catch (errFocus) {}
              }
            }, 350);
          }
        } catch (errDE) {
          console.warn('[pointToDifferentialExpressionMenu]', errDE);
        }
      };

      // Backwards-compatible alias
      window.openDifferentialExpressionMenu = window.pointToDifferentialExpressionMenu;

      // Tab-Aware Analysis Launchers: Structural Remodeling & Longitudinal Analysis
      window.runStructuralAnalysis = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        var structBtn = document.getElementById('structural_tab-runAnalysis') || document.querySelector('.btn-initiate-structural');
        if (structBtn) {
          structBtn.click();
        }
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('structural_tab-runAnalysis', Math.random(), {priority: 'event'});
        }
      };

      window.pointToStructuralLauncher = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        var structBtn = document.getElementById('structural_tab-runAnalysis') || document.querySelector('.btn-initiate-structural');
        if (structBtn) {
          // Expand structural sidebar if closed
          var structSidebar = structBtn.closest('.sidebar, aside');
          var structLayout = structSidebar ? structSidebar.closest('.bslib-sidebar-layout') : null;
          if (structLayout) {
            var sbInstance = null;
            if (window.bslib && window.bslib.Sidebar && typeof window.bslib.Sidebar.getInstance === 'function') {
              sbInstance = window.bslib.Sidebar.getInstance(structLayout);
            }
            if (sbInstance && sbInstance.isClosed) {
              sbInstance.toggle('open');
            } else {
              var toggleBtn = structLayout.querySelector('button.collapse-toggle');
              if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') {
                toggleBtn.click();
              } else if (structSidebar && (structSidebar.hidden || structLayout.classList.contains('sidebar-collapsed'))) {
                structSidebar.hidden = false;
                structLayout.classList.remove('sidebar-collapsed');
              }
            }
          }

          var scrollContainer = structSidebar ? (structSidebar.querySelector('.sidebar-content') || structSidebar) : null;
          var performScroll = function() {
            if (scrollContainer && structBtn) {
              var btnRect = structBtn.getBoundingClientRect();
              var containerRect = scrollContainer.getBoundingClientRect();
              var relativeTop = btnRect.top - containerRect.top + scrollContainer.scrollTop;
              scrollContainer.scrollTo({
                top: Math.max(0, relativeTop - Math.floor(scrollContainer.clientHeight / 3)),
                behavior: 'smooth'
              });
            } else if (structBtn && typeof structBtn.scrollIntoView === 'function') {
              try { structBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(err) {}
            }
            if (typeof structBtn.focus === 'function') {
              try { structBtn.focus(); } catch(err) {}
            }
          };

          performScroll();
          setTimeout(performScroll, 120);
          setTimeout(performScroll, 320);

          structBtn.classList.remove('de-menu-highlight-pulse');
          void structBtn.offsetWidth;
          structBtn.classList.add('de-menu-highlight-pulse');
          setTimeout(function() {
            structBtn.classList.remove('de-menu-highlight-pulse');
          }, 3200);
        }
      };

      // Acyl Chain Selection Matrix Handlers (Subclass & Acyl Chain Proportions)
      window.syncPropMatrixSelection = function(containerEl) {
        var container = containerEl || document.querySelector('.prop-matrix-container');
        if (!container) return;
        var inputId = container.getAttribute('data-shiny-id') || 'structural_tab-prop_matrix_selected_chains';
        var cbs = container.querySelectorAll('.prop-matrix-cb:checked');
        var selected = [];
        cbs.forEach(function(cb) {
          var chain = cb.getAttribute('data-chain');
          if (chain) selected.push(chain);
        });
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue(inputId, selected, {priority: 'event'});
        }
      };

      window.propMatrixSelectAll = function(btn) {
        var container = btn ? btn.closest('.prop-matrix-container') : document.querySelector('.prop-matrix-container');
        if (!container) return;
        var cbs = container.querySelectorAll('.prop-matrix-cb');
        cbs.forEach(function(cb) { cb.checked = true; });
        window.syncPropMatrixSelection(container);
      };

      window.propMatrixSelectNone = function(btn) {
        var container = btn ? btn.closest('.prop-matrix-container') : document.querySelector('.prop-matrix-container');
        if (!container) return;
        var cbs = container.querySelectorAll('.prop-matrix-cb');
        cbs.forEach(function(cb) { cb.checked = false; });
        window.syncPropMatrixSelection(container);
      };

      window.propMatrixSelectSaturated = function(btn) {
        var container = btn ? btn.closest('.prop-matrix-container') : document.querySelector('.prop-matrix-container');
        if (!container) return;
        var cbs = container.querySelectorAll('.prop-matrix-cb');
        cbs.forEach(function(cb) {
          var db = cb.getAttribute('data-db');
          cb.checked = (db === '0');
        });
        window.syncPropMatrixSelection(container);
      };

      window.propMatrixSelectUnsaturated = function(btn) {
        var container = btn ? btn.closest('.prop-matrix-container') : document.querySelector('.prop-matrix-container');
        if (!container) return;
        var cbs = container.querySelectorAll('.prop-matrix-cb');
        cbs.forEach(function(cb) {
          var db = cb.getAttribute('data-db');
          cb.checked = (db !== '0');
        });
        window.syncPropMatrixSelection(container);
      };

      window.propMatrixToggleCol = function(headerEl, db) {
        var container = headerEl ? headerEl.closest('.prop-matrix-container') : document.querySelector('.prop-matrix-container');
        if (!container) return;
        var cbs = container.querySelectorAll('.prop-matrix-cb[data-db=\"' + db + '\"]');
        if (cbs.length === 0) return;
        var allChecked = Array.from(cbs).every(function(cb) { return cb.checked; });
        cbs.forEach(function(cb) { cb.checked = !allChecked; });
        window.syncPropMatrixSelection(container);
      };

      window.propMatrixToggleRow = function(headerEl, c) {
        var container = headerEl ? headerEl.closest('.prop-matrix-container') : document.querySelector('.prop-matrix-container');
        if (!container) return;
        var cbs = container.querySelectorAll('.prop-matrix-cb[data-c=\"' + c + '\"]');
        if (cbs.length === 0) return;
        var allChecked = Array.from(cbs).every(function(cb) { return cb.checked; });
        cbs.forEach(function(cb) { cb.checked = !allChecked; });
        window.syncPropMatrixSelection(container);
      };

      window.runLongitudinalAnalysis = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        var longBtn = document.getElementById('longitudinal_tab-submit_longitudinal_btn') || document.querySelector('[id$=\"-submit_longitudinal_btn\"]');
        if (longBtn) {
          longBtn.click();
        }
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('longitudinal_tab-submit_longitudinal_btn', Math.random(), {priority: 'event'});
        }
      };

      window.pointToLongitudinalLauncher = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        var longBtn = document.getElementById('longitudinal_tab-submit_longitudinal_btn') || document.querySelector('[id$=\"-submit_longitudinal_btn\"]');
        if (longBtn) {
          var longSidebar = longBtn.closest('.sidebar, aside');
          var longLayout = longSidebar ? longSidebar.closest('.bslib-sidebar-layout') : null;
          if (longLayout) {
            var sbInstance = null;
            if (window.bslib && window.bslib.Sidebar && typeof window.bslib.Sidebar.getInstance === 'function') {
              sbInstance = window.bslib.Sidebar.getInstance(longLayout);
            }
            if (sbInstance && sbInstance.isClosed) {
              sbInstance.toggle('open');
            } else {
              var toggleBtn = longLayout.querySelector('button.collapse-toggle');
              if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') {
                toggleBtn.click();
              }
            }
          }

          var scrollContainer = longSidebar ? (longSidebar.querySelector('.sidebar-content') || longSidebar) : null;
          var performScroll = function() {
            if (scrollContainer && longBtn) {
              var btnRect = longBtn.getBoundingClientRect();
              var containerRect = scrollContainer.getBoundingClientRect();
              var relativeTop = btnRect.top - containerRect.top + scrollContainer.scrollTop;
              scrollContainer.scrollTo({
                top: Math.max(0, relativeTop - Math.floor(scrollContainer.clientHeight / 3)),
                behavior: 'smooth'
              });
            } else if (typeof longBtn.scrollIntoView === 'function') {
              try { longBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(err) {}
            }
            if (typeof longBtn.focus === 'function') {
              try { longBtn.focus(); } catch(err) {}
            }
          };

          performScroll();
          setTimeout(performScroll, 120);
          setTimeout(performScroll, 320);

          longBtn.classList.remove('de-menu-highlight-pulse');
          void longBtn.offsetWidth;
          longBtn.classList.add('de-menu-highlight-pulse');
          setTimeout(function() {
            longBtn.classList.remove('de-menu-highlight-pulse');
          }, 3200);
        }
      };

      window.pointToBaselineSelector = function(targetId, e) {
        if (targetId && typeof targetId.preventDefault === 'function') {
          e = targetId;
          targetId = null;
        }
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        // 1. Tactile active feedback on the clicked button
        if (e && e.target) {
          var btn = e.target.closest('.btn-point-baseline, .btn-point-baseline-launcher, button');
          if (btn) {
            btn.classList.add('active');
            setTimeout(function() { btn.classList.remove('active'); }, 500);
          }
        }

        // 2. Switch dock tab to Plot Controls (analytical module controls are docked into #dock_panel_plot_controls)
        if (typeof window.activateDockTab === 'function') {
          window.activateDockTab('plot_controls');
        }

        // 3. Ensure active plot controls are docked
        if (typeof window.dockActivePlotControls === 'function') {
          window.dockActivePlotControls();
        }

        // 4. Ensure sidebar / unified dock is expanded (not collapsed)
        var $sidebar = $('#main_sidebar, aside.sidebar, .unified-sidebar-dock, #main_sidebar_container');
        if ($sidebar.hasClass('collapsed') || $('.bslib-sidebar-layout').hasClass('sidebar-collapsed')) {
          var $toggle = $('.collapse-toggle, button[data-bs-target="#main_sidebar"], [aria-controls="main_sidebar"]');
          if ($toggle.length) {
            $toggle.trigger('click');
          } else {
            $sidebar.removeClass('collapsed');
            $('.bslib-sidebar-layout').removeClass('sidebar-collapsed');
          }
        }
        var layouts = document.querySelectorAll('.bslib-sidebar-layout');
        layouts.forEach(function(l) {
          if (window.bslib && window.bslib.Sidebar && typeof window.bslib.Sidebar.getInstance === 'function') {
            var inst = window.bslib.Sidebar.getInstance(l);
            if (inst && inst.isClosed) inst.toggle('open');
          }
        });

        // Helper to expand Bootstrap collapses and parent accordion items
        var expandCollapseAndAncestors = function(collapseEl) {
          if (!collapseEl) return;
          var $collapses = $(collapseEl).add($(collapseEl).parents('.accordion-collapse, .collapse'));
          $collapses.each(function() {
            var col = this;
            if (!col.classList.contains('show')) {
              var $item = $(col).closest('.accordion-item');
              var cBtn = $item.children('.accordion-header').find('.accordion-button')[0] ||
                         $item.find('.accordion-button')[0] ||
                         document.querySelector('button[data-bs-target="#' + col.id + '"]');
              if (cBtn && cBtn.classList.contains('collapsed')) {
                cBtn.click();
              } else if (window.bootstrap && window.bootstrap.Collapse) {
                try { window.bootstrap.Collapse.getOrCreateInstance(col, { toggle: false }).show(); } catch (err) {}
              } else {
                col.classList.add('show');
              }
            }
          });
        };

        // 5. Locator for baseline selector element
        var findBaselineElement = function() {
          var el = null;
          var cleanId = (targetId && typeof targetId === 'string') ? targetId.replace(/^[#.]/, '') : null;

          if (cleanId) {
            el = document.getElementById(cleanId) ||
                 document.querySelector('[id$="' + cleanId + '"]') ||
                 document.querySelector('[name$="' + cleanId + '"]');
          }

          if (!el) {
            var dockedActive = document.querySelector('#docked_active_plot_controls .docked-module-block.active');
            if (dockedActive) {
              el = dockedActive.querySelector('[id$="-selectedBaseline"], [id$="-baselineSelectorUI"]');
            }
          }

          if (!el) {
            var activePane = document.querySelector('.tab-pane.active');
            if (activePane) {
              el = activePane.querySelector('[id$="-selectedBaseline"], [id$="-baselineSelectorUI"]');
            }
          }

          if (!el) {
            el = document.querySelector('#docked_active_plot_controls [id$="-selectedBaseline"], #docked_active_plot_controls [id$="-baselineSelectorUI"]');
          }

          if (!el) {
            el = document.querySelector('[id$="-selectedBaseline"], [id$="-baselineSelectorUI"]');
          }

          return el;
        };

        // 6. Staged scroll, focus, and visual frame flash
        var scrollAndPulse = function() {
          var baselineEl = findBaselineElement();
          if (!baselineEl) return;

          var $el = $(baselineEl);

          // Expand ancestor collapses
          $el.parents('.accordion-collapse, .collapse').each(function() {
            expandCollapseAndAncestors(this);
          });

          // Determine container for scrolling and highlighting
          var $target = $el;
          if ($el.closest('.shiny-input-container').length) {
            $target = $el.closest('.shiny-input-container');
          } else if ($el.closest('.form-group').length) {
            $target = $el.closest('.form-group');
          } else if ($el.closest('.dock-group-block').length) {
            $target = $el.closest('.dock-group-block');
          }

          // Scroll into view
          var scrollDom = null;
          if ($target.is(':visible') && $target[0]) {
            scrollDom = $target[0];
          } else if ($el.is(':visible') && $el[0]) {
            scrollDom = $el[0];
          } else {
            var $visParent = $target.parents(':visible');
            if ($visParent.length) scrollDom = $visParent[0];
          }

          if (scrollDom && typeof scrollDom.scrollIntoView === 'function') {
            try {
              scrollDom.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (err) {}
          }

          var $dockScroll = $target.closest('#dock_panel_plot_controls, .dock-sidebar-body, .sidebar-content, aside.sidebar');
          if ($dockScroll.length && scrollDom) {
            try {
              var elRect = scrollDom.getBoundingClientRect();
              var containerRect = $dockScroll[0].getBoundingClientRect();
              var relativeTop = elRect.top - containerRect.top + $dockScroll[0].scrollTop;
              $dockScroll[0].scrollTo({
                top: Math.max(0, relativeTop - Math.floor($dockScroll[0].clientHeight / 3)),
                behavior: 'smooth'
              });
            } catch (e) {}
          }

          // Focus selectize input
          var selectizeInput = $target.find('.selectize-input input')[0] || $target.find('.selectize-input')[0] || baselineEl;
          if (selectizeInput && typeof selectizeInput.focus === 'function') {
            try { selectizeInput.focus(); } catch (err) {}
          }

          // Visual highlighting and frame pulse
          if (typeof window.flashHarmoniousFrame === 'function') {
            window.flashHarmoniousFrame($target);
          }
          $target.removeClass('harmonious-frame-blink highlight-focus-pulse highlight-radar de-menu-highlight-pulse');
          if ($target[0]) void $target[0].offsetWidth;
          $target.addClass('harmonious-frame-blink highlight-focus-pulse highlight-radar de-menu-highlight-pulse');
          setTimeout(function() {
            $target.removeClass('harmonious-frame-blink highlight-focus-pulse highlight-radar de-menu-highlight-pulse');
          }, 3200);
        };

        // Multi-phase execution to guarantee visibility during and after dock/collapse transitions
        scrollAndPulse();
        setTimeout(scrollAndPulse, 80);
        setTimeout(scrollAndPulse, 250);
        setTimeout(scrollAndPulse, 500);
      };

      // Delegated click listener for all interactive action buttons
      document.addEventListener('click', function(e) {
        if (!e.target || !e.target.closest) return;
        var deTrigger = e.target.closest('.btn-open-de-menu, .btn-point-de-menu, [data-action="open-de-menu"], [data-action="point-de-menu"]');
        if (deTrigger) {
          window.pointToDifferentialExpressionMenu(e);
          return;
        }
        var structRunTrigger = e.target.closest('.btn-run-structural-analysis');
        if (structRunTrigger) {
          window.runStructuralAnalysis(e);
          return;
        }
        var structPointTrigger = e.target.closest('.btn-point-structural-launcher');
        if (structPointTrigger) {
          window.pointToStructuralLauncher(e);
          return;
        }
        var longRunTrigger = e.target.closest('.btn-run-longitudinal-analysis');
        if (longRunTrigger) {
          window.runLongitudinalAnalysis(e);
          return;
        }
        var longPointTrigger = e.target.closest('.btn-point-longitudinal-launcher');
        if (longPointTrigger) {
          window.pointToLongitudinalLauncher(e);
          return;
        }
        var baselinePointTrigger = e.target.closest('.btn-point-baseline, .btn-point-baseline-launcher, [data-action="point-baseline"]');
        if (baselinePointTrigger) {
          var targetBaselineId = baselinePointTrigger.getAttribute('data-target-baseline') || null;
          window.pointToBaselineSelector(targetBaselineId, e);
          return;
        }
        var plotTarget = e.target.closest('.shiny-plot-output');
        if (plotTarget && !e.target.closest('button, a, input, select')) {
          var pane = plotTarget.closest('.tab-pane');
          if (pane) {
            var isViolin = plotTarget.id && plotTarget.id.indexOf('logratio_tab') !== -1;
            var isFla = plotTarget.id && plotTarget.id.indexOf('fla_tab') !== -1;
            var isCellOrg = plotTarget.id && plotTarget.id.indexOf('cellular_org_tab') !== -1;
            var targetNs = isViolin ? 'logratio_tab' : (isFla ? 'fla_tab' : (isCellOrg ? 'cellular_org_tab' : ''));
            var baselineInput = pane.querySelector('[id$="-selectedBaseline"]') ||
                                (targetNs ? document.getElementById(targetNs + '-selectedBaseline') : null) ||
                                document.querySelector('#docked_active_plot_controls [id$="-selectedBaseline"]');
            if (baselineInput && (!baselineInput.value || baselineInput.value.trim() === '')) {
              window.pointToBaselineSelector(baselineInput.id, e);
              return;
            }

            var isDEPlot = (plotTarget.id && (
              plotTarget.id.indexOf('filteredHeatmap') !== -1 ||
              plotTarget.id.indexOf('barPlotFiltered') !== -1 ||
              plotTarget.id.indexOf('donutPlotFiltered') !== -1 ||
              plotTarget.id.indexOf('volcano') !== -1 ||
              plotTarget.id.indexOf('lsea') !== -1 ||
              plotTarget.id.indexOf('structural_grid') !== -1 ||
              plotTarget.id.indexOf('pathway') !== -1
            )) || !!pane.querySelector('.de-not-run-banner');

            if (isDEPlot) {
              var refItems = document.querySelectorAll('#data_hub-deReferenceGroupUI .selectize-input .item');
              var compItems = document.querySelectorAll('#data_hub-deComparisonGroupUI .selectize-input .item');
              var hasBanner = !!pane.querySelector('.de-not-run-banner');
              if (hasBanner || refItems.length === 0 || compItems.length === 0) {
                window.pointToDifferentialExpressionMenu(e);
                return;
              }
            }
          }
        }
      });

      window.switchToRawPValue = function() {
        if (typeof window.openDifferentialExpressionMenu === 'function') {
          window.openDifferentialExpressionMenu();
        }
        var rawRadio = document.querySelector('input[name=data_hub-pValueType][value=raw]');
        if (rawRadio) {
          rawRadio.click();
        }
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('trigger_switch_to_raw_p', Math.random());
        }
      };

      window.openOutliersDetectionTab = function() {
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('trigger_go_to_outliers', Math.random());
        }
        setTimeout(function() {
          var navLinks = document.querySelectorAll('.navbar-nav .nav-link, a[data-bs-toggle=tab], .nav-pills .nav-link');
          for (var i = 0; i < navLinks.length; i++) {
            if (navLinks[i].textContent.trim().includes('Quality Check')) {
              navLinks[i].click();
              break;
            }
          }
          setTimeout(function() {
            var subLinks = document.querySelectorAll('.nav-pills .nav-link, .nav-tabs .nav-link, a[data-bs-toggle=pill]');
            for (var j = 0; j < subLinks.length; j++) {
              if (subLinks[j].textContent.trim().includes('Outliers Detection')) {
                subLinks[j].click();
                break;
              }
            }
          }, 150);
        }, 50);
      };

      document.addEventListener('DOMContentLoaded', function() {
        if (window.ResizeObserver) {
          var ro = new ResizeObserver(function(entries) {
            // If the user manually resized the plot via its own anchor, update our tracking max-height
            entries.forEach(function(entry) {
                var el = $(entry.target);
                if(el.hasClass('shiny-plot-output') && el.data('user-resized')) {
                    el.data('orig-plot-h', el.height());
                }
            });
          });
          var attachPlotListeners = function(el) {
              if (el.hasAttribute('data-resize-observed')) return;
              el.setAttribute('data-resize-observed', 'true');
              ro.observe(el);
              el.addEventListener('mousedown', function(e) {
                  if (e.offsetX > el.offsetWidth - 20 && e.offsetY > el.offsetHeight - 20) {
                      $(el).data('user-resized', true);
                  }
              });
              document.addEventListener('mouseup', function() {
                  $(el).data('user-resized', false);
              });
          };

          // Setup MutationObserver to attach listeners to newly created dynamically rendered plots
          var mo = new MutationObserver(function(mutations) {
              mutations.forEach(function(mutation) {
                  mutation.addedNodes.forEach(function(node) {
                      if (node.nodeType === 1) { // ELEMENT_NODE
                          if (node.classList.contains('shiny-plot-output')) attachPlotListeners(node);
                          node.querySelectorAll('.shiny-plot-output').forEach(attachPlotListeners);
                      }
                  });
              });
          });
          
          mo.observe(document.body, { childList: true, subtree: true });

          // Also attach to any initially existing plots
          setTimeout(function() {
            document.querySelectorAll('.shiny-plot-output').forEach(attachPlotListeners);
          }, 500);
        }
      });
      
      // Dynamic Plot Compression and Expansion for jqui_resizable containers
      $(document).on('resize', function(e) {
         var target = $(e.target);

         if (target.hasClass('ui-resizable')) {
             // If target is directly a shiny-plot-output, allow jQuery UI to set width & height directly
             if (target.hasClass('shiny-plot-output')) {
                 target.find('img').css({
                     'width': '100%',
                     'height': '100%'
                 });
                 return;
             }

             var isDedicatedContainer = (target.attr('id') && target.attr('id').indexOf('container') !== -1);
             var plots = target.find('.shiny-plot-output');
             plots.each(function() {
                 var plot = $(this);
                 
                 // Ensure inner plot images scale smoothly in real time during drag
                 plot.find('img').css({
                     'width': '100%',
                     'height': '100%',
                     'max-width': '100%',
                     'max-height': '100%',
                     'object-fit': 'contain'
                 });
                 
                 // If the plot is hosted inside a dedicated scrollable viewport, preserve its server-driven intrinsic height for scrolling
                 if (plot.closest('.prop-plot-scroll-viewport').length > 0) {
                     plot.css('width', '100%');
                     return;
                 }
                 
                 // Initialize intrinsic geometries robustly
                 if (!plot.data('orig-plot-h')) {
                     var inlineH = plot[0].style.height;
                     var parsedH = parseInt(inlineH);
                     if (isNaN(parsedH) || parsedH <= 0) parsedH = plot.height();
                     
                     plot.data('orig-plot-h', parsedH);
                     
                     // Calculate the chrome (headers, footers, padding) height
                     var chromeH = target.height() - plot.height();
                     if (isDedicatedContainer) {
                         chromeH = Math.max(0, Math.min(60, chromeH));
                     } else if (chromeH < 0 || chromeH > 400) {
                         chromeH = 150; // Standard fallback for navset_card_tab chrome
                     }
                     plot.data('chrome-h', chromeH);
                 }
                 
                 var origPlotH = plot.data('orig-plot-h');
                 var chromeH = plot.data('chrome-h');
                 
                 if (origPlotH) {
                     var newPlotH = target.height() - chromeH;
                     
                     // Constrain compressing to a visible minimum and reasonable maximum
                     if (newPlotH < 150) {
                         newPlotH = 150;
                     } else if (newPlotH > 3200) {
                         newPlotH = 3200;
                     }
                     
                     plot.css('height', newPlotH + 'px');
                     plot.css('width', '100%');
                 }
             });
         }
      });

       // Notify Shiny upon resize completion so it draws crisp resolution at new dimensions
       var resizeStopTimer = null;
       $(document).on('resizestop', function(e) {
          clearTimeout(resizeStopTimer);
          resizeStopTimer = setTimeout(function() {
             window.dispatchEvent(new Event('resize'));
             $(window).trigger('resize');
          }, 120);
       });

      // Automatic download button tagging for Acrobat Red (PDF) and Excel Green (CSV)
      function tagDownloadButtons() {
        var links = document.querySelectorAll('a.shiny-download-link, button.shiny-download-link');
        for (var i = 0; i < links.length; i++) {
          var el = links[i];
          var txt = (el.textContent || el.innerText || '').toUpperCase();
          var id = (el.id || '').toUpperCase();
          var isPdf = txt.indexOf('PDF') !== -1 || id.indexOf('PDF') !== -1;
          var isCsv = txt.indexOf('CSV') !== -1 || txt.indexOf('DATA') !== -1 || id.indexOf('CSV') !== -1 || id.indexOf('TABLE') !== -1;
          if (isPdf) {
            if (!el.classList.contains('btn-download-pdf')) el.classList.add('btn-download-pdf');
            if (el.classList.contains('btn-outline-primary')) {
              el.classList.remove('btn-outline-primary');
              el.classList.add('btn-outline-secondary');
            }
          } else if (isCsv) {
            if (!el.classList.contains('btn-download-csv')) el.classList.add('btn-download-csv');
          }
        }
      }
      document.addEventListener('DOMContentLoaded', tagDownloadButtons);
      if (window.jQuery) {
        // Universal Fail-Safe Subtab Navigation Handler
        $(document).on('click', '.nav-tabs a, .nav-pills a, [data-bs-toggle="tab"], [data-bs-toggle="pill"], [data-toggle="tab"]', function(e) {
          var $link = $(this);
          var href = $link.attr('href') || $link.attr('data-bs-target') || $link.attr('data-target');
          if (href && href.startsWith('#')) {
            var targetPane = document.querySelector(href);
            if (targetPane && targetPane.classList.contains('tab-pane')) {
              if (typeof $link.tab === 'function') {
                try { $link.tab('show'); } catch(err) {}
              } else if (window.bootstrap && window.bootstrap.Tab) {
                try {
                  var tab = window.bootstrap.Tab.getOrCreateInstance(this);
                  if (tab) tab.show();
                } catch(err) {}
              }
            }
          }
        });

        $(document).on('shown.bs.tab shown.bs.collapse', function(e) {
          tagDownloadButtons();
          var targetTab = $(e.target).attr('href') || $(e.target).data('bs-target');
          if (targetTab) {
            var $pane = $(targetTab);
            $pane.find('.shiny-plot-output').each(function() {
              $(this).css('width', '100%');
              $(this).removeData('orig-plot-h');
              $(this).removeData('chrome-h');
            });
            $pane.find('.ui-resizable').each(function() {
              if ($(this).attr('id') && $(this).attr('id').indexOf('container') !== -1) {
                $(this).css('width', '100%');
              }
            });
          }
          window.dispatchEvent(new Event('resize'));
          $(window).trigger('resize');
        });
        $(document).on('shiny:connected shiny:value shiny:idle', tagDownloadButtons);
      }
      setInterval(tagDownloadButtons, 3000);

      // Dynamic Empty Plot Overlays with Tab-Aware Launch Analysis Trigger
      function injectEmptyPlotOverlays() {
        var plots = document.querySelectorAll('.shiny-plot-output');
        for (var i = 0; i < plots.length; i++) {
          var plot = plots[i];
          var hasMedia = plot.querySelector('img, canvas, svg');
          var existingOverlays = plot.querySelectorAll('.empty-plot-overlay');
          if (hasMedia) {
            existingOverlays.forEach(function(el) { el.remove(); });
            continue;
          }

          var isPropPlot = (plot.id && (plot.id.indexOf('propPlot') !== -1 || plot.id.indexOf('diffAcyl') !== -1)) || !!plot.closest('.prop-card-tabs, .diff-acyl-container');
          var isStructural = !isPropPlot && ((plot.id && plot.id.indexOf('structural_tab') !== -1) || !!plot.closest('#structural_tab, [data-value="Structural"]'));
          var isLongitudinal = (plot.id && plot.id.indexOf('longitudinal_tab') !== -1) || !!plot.closest('#longitudinal_tab, [data-value="Longitudinal"]');
          var isViolin = !isStructural && ((plot.id && plot.id.indexOf('logratio_tab') !== -1) || !!plot.closest('#logratio_tab, [data-value="Violin Plots"]'));
          var isFla = (plot.id && plot.id.indexOf('fla_tab') !== -1) || !!plot.closest('#fla_tab, [data-value="Functional Ratios"]');
          var isCellOrg = (plot.id && plot.id.indexOf('cellular_org_tab') !== -1) || !!plot.closest('#cellular_org_tab, [data-value="Cellular Organization"]');
          var tabPane = plot.closest('.tab-pane');
          var targetNs = isViolin ? 'logratio_tab' : (isFla ? 'fla_tab' : (isCellOrg ? 'cellular_org_tab' : ''));
          var tabBaselineInput = (isViolin || isFla || isCellOrg) ? (
            (tabPane ? tabPane.querySelector('[id$="-selectedBaseline"]') : null) ||
            (targetNs ? document.getElementById(targetNs + '-selectedBaseline') : null) ||
            document.querySelector('#docked_active_plot_controls [id$="-selectedBaseline"]') ||
            document.querySelector('[id$="-selectedBaseline"]')
          ) : null;
          var isAwaitingBaseline = (isViolin || isFla || isCellOrg) && tabBaselineInput && (!tabBaselineInput.value || tabBaselineInput.value.trim() === '');

          var isFilteredHeatmap = (plot.id && (plot.id.indexOf('filteredHeatmap') !== -1 || plot.id.indexOf('filteredHeatmapSD') !== -1));
          var isFilteredComp = (plot.id && (plot.id.indexOf('barPlotFiltered') !== -1 || plot.id.indexOf('donutPlotFiltered') !== -1));
          var isVolcano = (plot.id && plot.id.indexOf('volcano') !== -1) || !!plot.closest('#volcano_tab, [data-value="Volcano Plot"]');
          var isLsea = (plot.id && plot.id.indexOf('lsea') !== -1) || !!plot.closest('#lsea_tab, [data-value="LSEA"]');
          var isStructuralGrid = (plot.id && plot.id.indexOf('structural_grid') !== -1) || !!plot.closest('#structural_grid_tab, [data-value="Structural Grid"]');
          var isPathway = (plot.id && plot.id.indexOf('pathway') !== -1) || !!plot.closest('#pathway_tab, [data-value="Lipid Pathways"]');
          var isDEPlot = isFilteredHeatmap || isFilteredComp || isVolcano || isLsea || isStructuralGrid || isPathway;

          var refItems = document.querySelectorAll('#data_hub-deReferenceGroupUI .selectize-input .item');
          var compItems = document.querySelectorAll('#data_hub-deComparisonGroupUI .selectize-input .item');
          var hasDeBanner = tabPane ? !!tabPane.querySelector('.de-not-run-banner') : false;
          var isAwaitingDE = isDEPlot && (hasDeBanner || refItems.length === 0 || compItems.length === 0);

          var overlayType = 'default';
          if (isStructural) overlayType = 'structural';
          else if (isLongitudinal) overlayType = 'longitudinal';
          else if (isAwaitingBaseline) overlayType = 'baseline';
          else if (isAwaitingDE) overlayType = 'de';

          // Strictly enforce: AT MOST ONE overlay per plot output! Prevent duplicate stacking loops
          if (existingOverlays.length > 0) {
            if (existingOverlays.length === 1 && existingOverlays[0].getAttribute('data-overlay-type') === overlayType) {
              continue; // Current overlay matches required state, do not append another
            }
            // Remove previous or duplicate overlays before re-injecting fresh one
            existingOverlays.forEach(function(el) { el.remove(); });
          }

          var overlay = document.createElement('div');
          overlay.className = 'empty-plot-overlay';
          overlay.setAttribute('data-overlay-type', overlayType);

              if (isStructural) {
                overlay.innerHTML = 
                  '<div class=\"empty-plot-title\">🧬  Awaiting Structural Analysis</div>' +
                  '<div class=\"empty-plot-subtitle\">Configure parameters and click Initiate Structural Analysis to compute chain length & unsaturation remodeling</div>' +
                  '<div class=\"d-flex gap-2 justify-content-center flex-wrap\">' +
                    '<button type=\"button\" class=\"btn btn-primary btn-run-structural-analysis\">' +
                      '<i class=\"fa-solid fa-play me-1\"></i> Initiate Structural Analysis' +
                    '</button>' +
                    '<button type=\"button\" class=\"btn btn-outline-primary btn-point-structural-launcher\">' +
                      '<i class=\"fa-solid fa-crosshairs me-1\"></i> Point to Button' +
                    '</button>' +
                  '</div>';
              } else if (isLongitudinal) {
                overlay.innerHTML = 
                  '<div class=\"empty-plot-title\">📈  Awaiting Longitudinal Analysis</div>' +
                  '<div class=\"empty-plot-subtitle\">Select cohorts & timepoints and click Generate Analysis to compute trajectory paths</div>' +
                  '<div class=\"d-flex gap-2 justify-content-center flex-wrap\">' +
                    '<button type=\"button\" class=\"btn btn-primary btn-run-longitudinal-analysis\">' +
                      '<i class=\"fa-solid fa-play me-1\"></i> Generate Analysis' +
                    '</button>' +
                    '<button type=\"button\" class=\"btn btn-outline-primary btn-point-longitudinal-launcher\">' +
                      '<i class=\"fa-solid fa-crosshairs me-1\"></i> Point to Button' +
                    '</button>' +
                  '</div>';
              } else if (isAwaitingBaseline) {
                var tabTitle = isViolin ? 'Violin Plots' : (isFla ? 'Functional Ratios' : 'Cellular Organization');
                overlay.innerHTML = 
                  '<div class=\"empty-plot-title\">⚖️  Awaiting Reference Baseline Selection</div>' +
                  '<div class=\"empty-plot-subtitle\">Please select an item in <strong>Reference Baseline:</strong> in the left sidebar to generate ' + tabTitle + '</div>' +
                  '<div class=\"d-flex gap-2 justify-content-center flex-wrap\">' +
                    '<button type=\"button\" class=\"btn btn-warning text-dark btn-point-baseline\" data-target-baseline=\"' + (tabBaselineInput ? tabBaselineInput.id : (targetNs ? (targetNs + '-selectedBaseline') : '')) + '\">' +
                      '<i class=\"fa-solid fa-crosshairs me-1\"></i> Point to Reference Baseline' +
                    '</button>' +
                  '</div>';
              } else if (isAwaitingDE) {
                var deTabTitle = isFilteredHeatmap ? 'Filtered Heatmap' : (isFilteredComp ? 'Filtered Composition' : (isVolcano ? 'Volcano Plot' : (isLsea ? 'LSEA' : (isStructuralGrid ? 'Structural Grid' : 'Differential Expression Analysis'))));
                overlay.innerHTML = 
                  '<div class="empty-plot-title">⚖️  Awaiting Differential Expression Configuration</div>' +
                  '<div class="empty-plot-subtitle">Please select Reference & Comparison cohorts above or in the menu to generate ' + deTabTitle + '. Detailed options (Log2FC, P-value, etc.) are available in the full menu.</div>' +
                  '<div class="d-flex gap-2 justify-content-center flex-wrap">' +
                    '<button type="button" class="btn btn-warning text-dark btn-point-de-menu" data-action="point-de-menu">' +
                      '<i class="fa-solid fa-sliders me-1"></i> Show in menu' +
                    '</button>' +
                  '</div>';
              } else {
                overlay.innerHTML = 
                  '<div class=\"empty-plot-title\">📈  Awaiting Analysis Execution</div>' +
                  '<div class=\"empty-plot-subtitle\">Configure parameters in sidebar and click Run Analysis to project coordinates</div>' +
                  '<button type=\"button\" class=\"btn btn-primary btn-launch-default-analysis\">' +
                    '<i class=\"fa-solid fa-play me-1\"></i> Launch Analysis (Default Parameters)' +
                  '</button>';
              }
          plot.appendChild(overlay);
        }
      }

      var _initInlineTimer = null;
      function getSidebarDEOptions(type) {
        var id = (type === 'ref') ? 'data_hub-deReferenceGroups' : 'data_hub-deComparisonGroups';
        var el = document.getElementById(id);
        if (el && el.selectize && el.selectize.options) {
          return Object.keys(el.selectize.options).map(function(k) {
            var rawOpt = el.selectize.options[k] || {};
            var valStr = rawOpt.value || k;
            var lblStr = rawOpt.label || rawOpt.text || k;
            return { value: valStr, label: lblStr, text: lblStr };
          });
        }
        return [];
      }

      function initInlineDESelectize() {
        if (!window.jQuery || !$.fn.selectize) return;

        var refOpts = getSidebarDEOptions('ref');
        var compOpts = getSidebarDEOptions('comp');
        if ((!compOpts || compOpts.length === 0) && refOpts && refOpts.length > 0) compOpts = refOpts;
        if ((!refOpts || refOpts.length === 0) && compOpts && compOpts.length > 0) refOpts = compOpts;

        var sideRefVal = $('#data_hub-deReferenceGroups').val() || [];
        if (!Array.isArray(sideRefVal)) sideRefVal = sideRefVal ? [sideRefVal] : [];
        var sideCompVal = $('#data_hub-deComparisonGroups').val() || [];
        if (!Array.isArray(sideCompVal)) sideCompVal = sideCompVal ? [sideCompVal] : [];

        $('select.de-inline-ref-select').each(function() {
          var $el = $(this);
          var sz = this.selectize;
          if (!sz) {
            $el.selectize({
              plugins: ['remove_button'],
              maxItems: null,
              openOnFocus: true,
              valueField: 'value',
              labelField: 'label',
              searchField: ['label', 'value', 'text'],
              render: {
                item: function(item, escape) {
                  return '<div>' + escape(item.label || item.text || item.value) + '</div>';
                },
                option: function(item, escape) {
                  return '<div>' + escape(item.label || item.text || item.value) + '</div>';
                }
              },
              placeholder: 'Select groups (multiple allowed)...',
              onChange: function(value) {
                window.syncInlineDEToSidebar('ref', $el[0]);
              }
            });
            sz = this.selectize;
          }
          if (sz) {
            $el.find('option').each(function() {
              var val = $(this).val();
              var txt = $(this).text();
              if (val && !sz.options[val]) {
                sz.addOption({ value: val, label: txt, text: txt });
              }
            });
            if (refOpts && refOpts.length > 0) {
              refOpts.forEach(function(opt) {
                if (!sz.options[opt.value]) {
                  sz.addOption({ value: opt.value, label: opt.label || opt.text || opt.value, text: opt.text || opt.label || opt.value });
                }
              });
            }
            sz.refreshOptions(false);
            if (sideRefVal.length > 0 && (!sz.getValue() || sz.getValue().length === 0)) {
              _isSyncingDE = true;
              try { sz.setValue(sideRefVal, true); } finally { _isSyncingDE = false; }
            }
          }
        });

        $('select.de-inline-comp-select').each(function() {
          var $el = $(this);
          var sz = this.selectize;
          if (!sz) {
            $el.selectize({
              plugins: ['remove_button'],
              maxItems: null,
              openOnFocus: true,
              valueField: 'value',
              labelField: 'label',
              searchField: ['label', 'value', 'text'],
              render: {
                item: function(item, escape) {
                  return '<div>' + escape(item.label || item.text || item.value) + '</div>';
                },
                option: function(item, escape) {
                  return '<div>' + escape(item.label || item.text || item.value) + '</div>';
                }
              },
              placeholder: 'Select groups (multiple allowed)...',
              onChange: function(value) {
                window.syncInlineDEToSidebar('comp', $el[0]);
              }
            });
            sz = this.selectize;
          }
          if (sz) {
            $el.find('option').each(function() {
              var val = $(this).val();
              var txt = $(this).text();
              if (val && !sz.options[val]) {
                sz.addOption({ value: val, label: txt, text: txt });
              }
            });
            var optsToUse = (compOpts && compOpts.length > 0) ? compOpts : refOpts;
            if (optsToUse && optsToUse.length > 0) {
              optsToUse.forEach(function(opt) {
                if (!sz.options[opt.value]) {
                  sz.addOption({ value: opt.value, label: opt.label || opt.text || opt.value, text: opt.text || opt.label || opt.value });
                }
              });
            }
            sz.refreshOptions(false);
            if (sideCompVal.length > 0 && (!sz.getValue() || sz.getValue().length === 0)) {
              _isSyncingDE = true;
              try { sz.setValue(sideCompVal, true); } finally { _isSyncingDE = false; }
            }
          }
        });
      }

      function scheduleInitInlineDESelectize() {
        if (_initInlineTimer) clearTimeout(_initInlineTimer);
        _initInlineTimer = setTimeout(function() {
          initInlineDESelectize();
        }, 50);
      }

      document.addEventListener('DOMContentLoaded', function() {
        injectEmptyPlotOverlays();
        initInlineDESelectize();
      });
      if (window.jQuery) {
        $(document).on('shown.bs.tab shown.bs.collapse', function() {
          injectEmptyPlotOverlays();
          scheduleInitInlineDESelectize();
        });
        $(document).on('shiny:idle', function() {
          scheduleInitInlineDESelectize();
        });
        $(document).on('shiny:value', function(e) {
          try {
            var targetId = (e.target && typeof e.target.id === 'string') ? e.target.id : '';
            if (targetId.indexOf('banner') !== -1 || (e.target && e.target.querySelector && e.target.querySelector('select.de-inline-select'))) {
              scheduleInitInlineDESelectize();
            }
          } catch(err) {
            console.warn('Fail-safe caught in shiny:value handler:', err);
          }
        });
        $(document).on('click', '#tertiary_subsubtab_bar .subsubtab-pill, #secondary_subtab_bar .subtab-pill, .navbar-nav a', function() {
          scheduleInitInlineDESelectize();
        });
        $(document).on('change', '#data_hub-deReferenceGroups', function() {
          if (_isSyncingDE) return;
          var val = $(this).val() || [];
          if (!Array.isArray(val)) val = val ? [val] : [];
          var refOpts = getSidebarDEOptions('ref');
          $('select.de-inline-ref-select.selectized').each(function() {
            if (this.selectize) {
              var sz = this.selectize;
              refOpts.forEach(function(opt) { if (!sz.options[opt.value]) sz.addOption(opt); });
              _isSyncingDE = true;
              try { sz.setValue(val, true); } finally { _isSyncingDE = false; }
            }
          });
        });
        $(document).on('change', '#data_hub-deComparisonGroups', function() {
          if (_isSyncingDE) return;
          var val = $(this).val() || [];
          if (!Array.isArray(val)) val = val ? [val] : [];
          var compOpts = getSidebarDEOptions('comp');
          $('select.de-inline-comp-select.selectized').each(function() {
            if (this.selectize) {
              var sz = this.selectize;
              compOpts.forEach(function(opt) { if (!sz.options[opt.value]) sz.addOption(opt); });
              _isSyncingDE = true;
              try { sz.setValue(val, true); } finally { _isSyncingDE = false; }
            }
          });
        });
        $(document).on('click', '.btn-open-de-menu, .btn-point-de-menu, [data-action="open-de-menu"], [data-action="point-de-menu"]', function(e) {
          window.pointToDifferentialExpressionMenu(e);
        });
        $(document).on('click', '.btn-launch-default-analysis', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var $btn = $(this);
          $btn.prop('disabled', true).html('<i class=\"fa-solid fa-spinner fa-spin me-1\"></i> Launching Analysis...');
          $('.btn-launch-default-analysis').prop('disabled', true);
          if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
            window.Shiny.setInputValue('data_hub-launch_default_analysis', Math.random(), {priority: 'event'});
            window.Shiny.setInputValue('launch_default_analysis', Math.random(), {priority: 'event'});
          }
        });

        // Automated Verification Support: Auto-trigger default analysis when URL has ?autostart=1
        if (window.location.search.indexOf('autostart=1') > -1) {
          $(document).one('shiny:idle', function() {
            setTimeout(function() {
              console.log('[AUTOSTART] Auto-triggering default analysis for verification...');
              var $btn = $('.btn-launch-default-analysis').first();
              if ($btn.length) {
                $btn.click();
              }
            }, 800);
          });
        }
        $(document).on('click', '.btn-run-structural-analysis', function(e) {
          window.runStructuralAnalysis(e);
        });
        $(document).on('click', '.btn-point-structural-launcher', function(e) {
          window.pointToStructuralLauncher(e);
        });
        $(document).on('click', '.btn-run-longitudinal-analysis', function(e) {
          window.runLongitudinalAnalysis(e);
        });
        $(document).on('click', '.btn-point-longitudinal-launcher', function(e) {
          window.pointToLongitudinalLauncher(e);
        });
        $(document).on('click', '.btn-point-baseline, .btn-point-baseline-launcher', function(e) {
          var targetId = $(this).attr('data-target-baseline') || null;
          window.pointToBaselineSelector(targetId, e);
        });
        $(document).on('click', '.shiny-plot-output', function(e) {
          if (e.target && $(e.target).closest('button, a, input, select').length) return;
          var pane = this.closest('.tab-pane');
          var isViolin = this.id && this.id.indexOf('logratio_tab') !== -1;
          var isFla = this.id && this.id.indexOf('fla_tab') !== -1;
          var isCellOrg = this.id && this.id.indexOf('cellular_org_tab') !== -1;
          var targetNs = isViolin ? 'logratio_tab' : (isFla ? 'fla_tab' : (isCellOrg ? 'cellular_org_tab' : ''));
          var baselineInput = (pane ? pane.querySelector('[id$="-selectedBaseline"]') : null) ||
                              (targetNs ? document.getElementById(targetNs + '-selectedBaseline') : null) ||
                              document.querySelector('#docked_active_plot_controls [id$="-selectedBaseline"]');
          if (baselineInput && (!baselineInput.value || baselineInput.value.trim() === '')) {
            window.pointToBaselineSelector(baselineInput.id, e);
          }
        });
      }
      setInterval(injectEmptyPlotOverlays, 3000);

      // -------------------------------------------------------------------------
      // Brand Logo & Navbar Lock: Permanent Stable Dimensions (No Layout Shifts)
      // -------------------------------------------------------------------------
      function syncLogoWithLeftRibbon() {
        var brand = document.querySelector('.navbar-brand');
        var logoImg = document.querySelector('.navbar-brand-logo-full, #navbar_brand_logo_img');

        if (brand) {
          brand.classList.remove('sidebar-is-collapsed');
          brand.style.width = 'auto';
          brand.style.maxWidth = 'none';
          brand.style.justifyContent = 'flex-start';
        }

        if (logoImg) {
          logoImg.style.height = '38px';
          logoImg.style.width = 'auto';
          logoImg.style.maxHeight = '38px';
          logoImg.style.maxWidth = '200px';
          logoImg.style.marginLeft = '0';
          logoImg.style.marginRight = '0';
        }
      }

      // Global synchronized secondary sidebar width
      var globalSecondarySidebarWidth = 285;
      try {
        var savedW = localStorage.getItem('global_secondary_sidebar_width');
        if (savedW) globalSecondarySidebarWidth = parseInt(savedW, 10);
      } catch(e) {}

      function syncAllSecondarySidebars(width) {
        if (!width || width < 240) width = 285;
        globalSecondarySidebarWidth = width;
        try { localStorage.setItem('global_secondary_sidebar_width', width); } catch(e) {}

        $('.bslib-sidebar-layout .bslib-sidebar-layout > aside.sidebar').each(function() {
          var $sb = $(this);
          $sb.css({
            'width': width + 'px',
            'max-width': width + 'px',
            'flex-basis': width + 'px'
          });
          $sb.attr('data-last-expanded-width', width);
          var $layout = $sb.closest('.bslib-sidebar-layout');
          if ($layout.length) {
            $layout[0].style.setProperty('--_sidebar-width', width + 'px');
            $layout[0].style.setProperty('--bslib-sidebar-width', width + 'px');
          }
        });
        window.dispatchEvent(new Event('resize'));
        $(window).trigger('resize');
      }
      window.syncAllSecondarySidebars = syncAllSecondarySidebars;

      function initSidebarResizer() {
        var sidebar = document.getElementById('main_sidebar') || document.querySelector('aside#main_sidebar') || document.querySelector('.bslib-sidebar-layout > aside.sidebar');
        if (!sidebar) return;
        if (sidebar.querySelector('.sidebar-drag-resizer')) return;

        var handle = document.createElement('div');
        handle.className = 'sidebar-drag-resizer';
        handle.title = 'Drag to resize dock width';
        sidebar.appendChild(handle);

        var isDragging = false;
        var startX = 0;
        var startWidth = 0;
        var layout = sidebar.closest('.bslib-sidebar-layout');

        handle.addEventListener('mousedown', function(e) {
          isDragging = true;
          startX = e.clientX;
          startWidth = sidebar.getBoundingClientRect().width;
          handle.classList.add('is-dragging');
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
          e.preventDefault();
        });

        var onMouseMove = function(e) {
          if (!isDragging) return;
          var delta = e.clientX - startX;
          var minW = 240;
          var maxW = Math.min(window.innerWidth * 0.65, 750);
          var newWidth = Math.max(minW, Math.min(maxW, startWidth + delta));
          sidebar.style.width = newWidth + 'px';
          sidebar.style.maxWidth = newWidth + 'px';
          sidebar.style.flexBasis = newWidth + 'px';
          sidebar.setAttribute('data-last-expanded-width', newWidth);
          if (layout) {
            layout.style.setProperty('--_sidebar-width', newWidth + 'px');
            layout.style.setProperty('--bslib-sidebar-width', newWidth + 'px');
          }
          syncLogoWithLeftRibbon();
          window.dispatchEvent(new Event('resize'));
          $(window).trigger('resize');
        };

        var onMouseUp = function() {
          if (!isDragging) return;
          isDragging = false;
          handle.classList.remove('is-dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.dispatchEvent(new Event('resize'));
          $(window).trigger('resize');
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }

      $(function() {
        syncLogoWithLeftRibbon();
        initSidebarResizer();
        setTimeout(syncLogoWithLeftRibbon, 100);
        setTimeout(syncLogoWithLeftRibbon, 400);
        setTimeout(syncLogoWithLeftRibbon, 1000);
        setTimeout(initSidebarResizer, 1200);

        $(window).on('resize', syncLogoWithLeftRibbon);
      });
      $(document).on('shiny:connected', function() {
        syncLogoWithLeftRibbon();
        initSidebarResizer();
      });

      // Tab Introduction Full Card Collapse & Re-expand (Sidebar-Style Arrow Head)
      $(document).on('click', '.tab-intro-wrapper .tab-intro-header', function(e) {
        var wrapper = $(this).closest('.tab-intro-wrapper');
        var card = wrapper.find('.tab-intro-card');
        var reexpandBar = wrapper.find('.tab-intro-reexpand-bar');

        if (card.is(':visible') && !card.is(':animated')) {
          card.slideUp(200, function() {
            reexpandBar.css('display', 'flex').hide().fadeIn(150);
            setTimeout(function() {
              window.dispatchEvent(new Event('resize'));
              $(window).trigger('resize');
            }, 60);
          });
        }
      });

      $(document).on('click', '.tab-intro-wrapper .intro-reexpand-btn', function(e) {
        e.stopPropagation();
        var wrapper = $(this).closest('.tab-intro-wrapper');
        var card = wrapper.find('.tab-intro-card');
        var reexpandBar = wrapper.find('.tab-intro-reexpand-bar');

        if (!card.is(':visible') && !card.is(':animated')) {
          reexpandBar.fadeOut(150, function() {
            card.slideDown(200, function() {
              setTimeout(function() {
                window.dispatchEvent(new Event('resize'));
                $(window).trigger('resize');
              }, 60);
            });
          });
        }
      });

      // ==============================================================================
      // SECONDARY HORIZONTAL SUBNAVBAR (REPLACES FLOATING DROPDOWN MENUS)
      // ==============================================================================

      var NAV_STRUCTURE = [
        {
          hypertab: "1. Data & Overview",
          shortTitle: "Data & Overview",
          icon: "fa-database",
          subtabs: [
            { label: "App Info", icon: "fa-info-circle", target: "App Info" },
            { label: "Lexicon", icon: "fa-book", target: "Lexicon" }
          ]
        },
        {
          hypertab: "2. Quality Control",
          shortTitle: "Quality Control",
          icon: "fa-shield-halved",
          subtabs: [
            {
              label: "Quality Check",
              icon: "fa-sitemap",
              target: "Quality Check",
              subsubtabs: [
                { label: "Normalization Check", icon: "fa-chart-area", target: "Normalization Check" },
                { label: "Outliers Detection", icon: "fa-magnifying-glass-chart", target: "Outliers Detection" },
                { label: "PCA Score Plots", icon: "fa-chart-scatter", target: "PCA Score Plots" },
                { label: "PCA Loading Plots", icon: "fa-chart-line", target: "PCA Loading Plots" },
                { label: "Sample Correlation", icon: "fa-table-cells", target: "Sample Correlation" },
                { label: "BQC CoV Analysis", icon: "fa-microscope", target: "BQC CoV Analysis" }
              ]
            }
          ]
        },
        {
          hypertab: "3. Quantitative",
          shortTitle: "Quantitative",
          icon: "fa-chart-simple",
          subtabs: [
            {
              label: "Heatmap",
              icon: "fa-table-cells",
              target: "Heatmap",
              subsubtabs: [
                { label: "Unfiltered Heatmap", icon: "fa-table-cells", target: "Unfiltered Heatmap" },
                { label: "Filtered Heatmap", icon: "fa-filter", target: "Filtered Heatmap" },
                { label: "Violin View", icon: "fa-scale-unbalanced", target: "Violin View" }
              ]
            },
            {
              label: "Composition",
              icon: "fa-chart-bar",
              target: "Composition",
              subsubtabs: [
                { label: "Unfiltered (All)", icon: "fa-chart-pie", target: "Unfiltered (All)" },
                { label: "Filtered", icon: "fa-filter", target: "Filtered" }
              ]
            },
            { label: "Volcano Plot", icon: "fa-mountain-sun", target: "Volcano Plot" },
            { label: "LSEA", icon: "fa-chart-line", target: "LSEA" }
          ]
        },
        {
          hypertab: "4. Structural",
          shortTitle: "Structural",
          icon: "fa-dna",
          subtabs: [
            {
              label: "Structural",
              icon: "fa-dna",
              target: "Structural",
              subsubtabs: [
                { label: "Structural Analysis Dot Plots", icon: "fa-chart-scatter", target: "Structural Analysis Dot Plots" },
                { label: "Violin Plots", icon: "fa-scale-unbalanced", target: "Violin Plots" },
                { label: "Correlation Networks", icon: "fa-circle-nodes", target: "Correlation Networks" }
              ]
            },
            {
              label: "Main Class & Acyl Chain Proportions",
              icon: "fa-chart-column",
              target: "Main Class & Acyl Chain Proportions",
              subsubtabs: [
                { label: "Stacked Proportions", icon: "fa-chart-bar", target: "Stacked Proportions" },
                { label: "Differential Acyl Chain Expression", icon: "fa-scale-balanced", target: "Differential Acyl Chain Expression" }
              ]
            },
            {
              label: "Structural Grid",
              icon: "fa-table-cells-large",
              target: "Structural Grid",
              subsubtabs: [
                { label: "Single Class View", icon: "fa-table-cells", target: "Single Class View" },
                { label: "All Classes View", icon: "fa-table-cells-large", target: "All Classes View" }
              ]
            },
            { label: "Violin Plots", icon: "fa-scale-unbalanced", target: "Violin Plots" }
          ]
        },
        {
          hypertab: "5. Targeted Analysis",
          shortTitle: "Targeted Analysis",
          icon: "fa-diagram-project",
          subtabs: [
            { label: "Functional Ratios", icon: "fa-calculator", target: "Functional Ratios" },
            { label: "Lipid Pathways", icon: "fa-diagram-project", target: "Lipid Pathways" },
            { label: "Cellular Organization", icon: "fa-cubes", target: "Cellular Organization" },
            { label: "Longitudinal", icon: "fa-clock", target: "Longitudinal" }
          ]
        },
        {
          hypertab: "6. Reference & Methods",
          shortTitle: "Reference & Methods",
          icon: "fa-book-bookmark",
          subtabs: [
            { label: "Statistics", icon: "fa-terminal", target: "Statistics" },
            {
              label: "Math Proof",
              icon: "fa-square-root-variable",
              target: "Math Proof",
              subsubtabs: [
                { label: "1. Ingestion & LOD", icon: "fa-file-import", target: "step1" },
                { label: "2. Log2 Transform", icon: "fa-calculator", target: "step2" },
                { label: "3. QRILC Imputation", icon: "fa-dice", target: "step3" },
                { label: "4. Median Normalization", icon: "fa-scale-balanced", target: "step4" },
                { label: "5. Linear Restitution", icon: "fa-arrow-up-right-from-square", target: "step5" },
                { label: "Full 5-Step Pipeline (Stacked)", icon: "fa-layer-group", target: "overview" }
              ]
            },
            { label: "About & Citation", icon: "fa-info-circle", target: "About & Citation" }
          ]
        }
      ];

      var activeSubtabMap = {
        "1. Data & Overview": "App Info",
        "2. Quality Control": "Quality Check",
        "3. Quantitative": "Heatmap",
        "4. Structural": "Structural",
        "5. Targeted Analysis": "Functional Ratios",
        "6. Reference & Methods": "Math Proof"
      };

      var activeSubsubMap = {
        "Heatmap": "Unfiltered Heatmap",
        "Composition": "Unfiltered (All)",
        "Structural": "Structural Analysis Dot Plots",
        "Main Class & Acyl Chain Proportions": "Stacked Proportions",
        "Structural Grid": "Single Class View",
        "Quality Check": "PCA Score Plots",
        "Math Proof": "step1"
      };

      function updateDendrogramCanvas() {
        var $subnav = $('#secondary_subtab_bar');
        var $subsubnav = $('#tertiary_subsubtab_bar');
        if ($subnav.length === 0 || $subsubnav.length === 0 || !$subsubnav.is(':visible')) return;

        var $svg = $subsubnav.find('.dendrogram-canvas');
        if ($svg.length === 0) return;

        var $activeSubtab = $subnav.find('.subtab-pill.active');
        var $childPills = $subsubnav.find('.subsubtab-pill');

        if ($activeSubtab.length === 0 || $childPills.length <= 1) {
          $svg.empty();
          return;
        }

        var containerOffset = $subsubnav.offset();
        if (!containerOffset) return;

        var parentOffset = $activeSubtab.offset();
        var xParent = Math.round(parentOffset.left + ($activeSubtab.outerWidth() / 2) - containerOffset.left);

        var childCoords = [];
        var xActiveChild = xParent;
        $childPills.each(function() {
          var $cp = $(this);
          var cpOffset = $cp.offset();
          var xC = Math.round(cpOffset.left + ($cp.outerWidth() / 2) - containerOffset.left);
          childCoords.push(xC);
          if ($cp.hasClass('active')) {
            xActiveChild = xC;
          }
        });

        if (childCoords.length === 0) {
          $svg.empty();
          return;
        }

        var xMin = Math.min.apply(null, childCoords);
        var xMax = Math.max.apply(null, childCoords);
        var spanMin = Math.min(xMin, xParent);
        var spanMax = Math.max(xMax, xParent);

        var yTop = 0;
        var yMid = 10;
        var yBottom = 20;

        // Construct SVG dendrogram paths:
        // 1. Inactive full tree scaffold
        var scaffoldPath = 'M ' + xParent + ' ' + yTop + ' L ' + xParent + ' ' + yMid;
        scaffoldPath += ' M ' + spanMin + ' ' + yMid + ' L ' + spanMax + ' ' + yMid;
        childCoords.forEach(function(xC) {
          scaffoldPath += ' M ' + xC + ' ' + yMid + ' L ' + xC + ' ' + yBottom;
        });

        // 2. Active highlighted lineage path
        var activePath = 'M ' + xParent + ' ' + yTop + ' L ' + xParent + ' ' + yMid +
                         ' L ' + xActiveChild + ' ' + yMid + ' L ' + xActiveChild + ' ' + yBottom;

        var svgWidth = $subsubnav.outerWidth();
        $svg.attr('width', svgWidth).attr('viewBox', '0 0 ' + svgWidth + ' 22');

        var wfKey = $subsubnav.attr('data-workflow') || $('#secondary_subtab_bar').attr('data-workflow') || 'quantitative';
        var strokeColor = "#2563eb";
        var nodeColor = "#2563eb";
        if (wfKey === 'qc') {
          strokeColor = "#0f766e";
          nodeColor = "#0f766e";
        } else if (wfKey === 'structural') {
          strokeColor = "#d97706";
          nodeColor = "#d97706";
        } else if (wfKey === 'targeted') {
          strokeColor = "#7c3aed";
          nodeColor = "#7c3aed";
        } else if (wfKey === 'data' || wfKey === 'reference') {
          strokeColor = "#475569";
          nodeColor = "#64748b";
        }

        var html = '<g class="dendrogram-tree-group">' +
          '<path d="' + scaffoldPath + '" class="dendrogram-branch" stroke="#cbd5e1" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="' + activePath + '" class="dendrogram-branch active" stroke="' + strokeColor + '" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="' + xParent + '" cy="' + yTop + '" r="2.5" class="dendrogram-node" fill="' + nodeColor + '"/>' +
          '<circle cx="' + xParent + '" cy="' + yMid + '" r="2" class="dendrogram-node" fill="' + nodeColor + '"/>' +
          '<circle cx="' + xActiveChild + '" cy="' + yMid + '" r="2" class="dendrogram-node" fill="' + nodeColor + '"/>' +
          '<circle cx="' + xActiveChild + '" cy="' + yBottom + '" r="2.5" class="dendrogram-node" fill="' + nodeColor + '"/>' +
        '</g>';

        $svg.html(html);
      }
      window.updateDendrogramCanvas = updateDendrogramCanvas;

      function renderTertiarySubsubnavbar(activeSubtabTarget, activeSubsubTarget) {
        var $subsubnav = $('#tertiary_subsubtab_bar');
        if ($subsubnav.length === 0) return;

        var currentSubtabEntry = null;
        var parentWorkflow = null;
        for (var i = 0; i < NAV_STRUCTURE.length; i++) {
          var found = NAV_STRUCTURE[i].subtabs.find(function(s) { return s.target === activeSubtabTarget; });
          if (found) {
            currentSubtabEntry = found;
            parentWorkflow = NAV_STRUCTURE[i].hypertab;
            break;
          }
        }

        if (parentWorkflow) {
          var wfKey = "data";
          if (parentWorkflow.indexOf("Quality Control") !== -1) wfKey = "qc";
          else if (parentWorkflow.indexOf("Quantitative") !== -1) wfKey = "quantitative";
          else if (parentWorkflow.indexOf("Structural") !== -1) wfKey = "structural";
          else if (parentWorkflow.indexOf("Targeted") !== -1) wfKey = "targeted";
          else if (parentWorkflow.indexOf("Reference") !== -1) wfKey = "reference";
          $subsubnav.attr('data-workflow', wfKey);
          $('#secondary_subtab_bar').attr('data-workflow', wfKey);
        }

        if (!currentSubtabEntry || !currentSubtabEntry.subsubtabs || currentSubtabEntry.subsubtabs.length === 0) {
          $subsubnav.hide();
          $subsubnav.find('.dendrogram-canvas').empty();
          return;
        }

        $subsubnav.show();
        var currentSST = activeSubsubTarget || activeSubsubMap[activeSubtabTarget] || currentSubtabEntry.subsubtabs[0].target;
        activeSubsubMap[activeSubtabTarget] = currentSST;

        var pillsHtml = '';
        currentSubtabEntry.subsubtabs.forEach(function(sst) {
          var isActive = (sst.target === currentSST);
          pillsHtml += '<button type="button" class="subsubtab-pill ' + (isActive ? 'active' : '') + '" data-subtab="' + activeSubtabTarget + '" data-target="' + sst.target + '">' +
            '<i class="fas ' + sst.icon + '"></i>' +
            '<span>' + sst.label + '</span>' +
          '</button>';
        });

        $subsubnav.find('.subsub-parent-name').text(currentSubtabEntry.label);
        $subsubnav.find('.subsubnavbar-pills-list').html(pillsHtml);

        setTimeout(updateDendrogramCanvas, 50);
      }
      window.renderTertiarySubsubnavbar = renderTertiarySubsubnavbar;

      function renderSecondarySubnavbar(hypertabName, activeSubtabTarget) {
        var entry = NAV_STRUCTURE.find(function(n) {
          return n.hypertab === hypertabName || n.shortTitle === hypertabName;
        });
        if (!entry) return;

        var $subnav = $('#secondary_subtab_bar');
        if ($subnav.length === 0) return;

        var wfKey = "data";
        if (entry.hypertab.indexOf("Quality Control") !== -1) wfKey = "qc";
        else if (entry.hypertab.indexOf("Quantitative") !== -1) wfKey = "quantitative";
        else if (entry.hypertab.indexOf("Structural") !== -1) wfKey = "structural";
        else if (entry.hypertab.indexOf("Targeted") !== -1) wfKey = "targeted";
        else if (entry.hypertab.indexOf("Reference") !== -1) wfKey = "reference";
        $subnav.attr('data-workflow', wfKey);
        $('#tertiary_subsubtab_bar').attr('data-workflow', wfKey);

        var currentTarget = activeSubtabTarget || activeSubtabMap[entry.hypertab] || entry.subtabs[0].target;

        var pillsHtml = '';
        entry.subtabs.forEach(function(st) {
          var isActive = (st.target === currentTarget);
          pillsHtml += '<button type="button" class="subtab-pill ' + (isActive ? 'active' : '') + '" data-target="' + st.target + '">' +
            '<i class="fas ' + st.icon + '"></i>' +
            '<span>' + st.label + '</span>' +
          '</button>';
        });

        var indicatorHtml = '<i class="fas ' + entry.icon + '"></i> <span>' + entry.shortTitle + '</span>';
        $subnav.find('.subnavbar-category-indicator').html(indicatorHtml);
        $subnav.find('.subnavbar-pills-list').html(pillsHtml);

        renderTertiarySubsubnavbar(currentTarget);
      }

      // Quick Access pointToLog2FCFilter action
      window.pointToLog2FCFilter = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        if (e && e.target) {
          var btn = e.target.closest('.btn-quick-l2fc, .btn-quick-access');
          if (btn) {
            btn.classList.add('active');
            setTimeout(function() { btn.classList.remove('active'); }, 500);
          }
        }

        if (typeof window.activateDockTab === 'function') {
          window.activateDockTab('cohorts');
        }
        var dockEl = document.querySelector('.unified-sidebar-dock');
        if (dockEl && dockEl.classList.contains('collapsed')) {
          dockEl.classList.remove('collapsed');
        }

        var $panelCohorts = $('#dock_panel_cohorts');
        var $drawer = $panelCohorts.length ? $panelCohorts : $('#main_sidebar .sidebar-content');
        var $deItem = $('#dock_panel_cohorts .accordion-item').filter(function() {
          return $(this).text().indexOf('Differential Expression') !== -1;
        });
        if (!$deItem.length) {
          $deItem = $('#data_hub-main_accordion .accordion-item[data-value="3. Differential Expression"]');
        }
        if ($deItem && $deItem.length) {
          var btnEl = $deItem.find('.accordion-button')[0];
          var collapseEl = $deItem.find('.accordion-collapse')[0];
          if (btnEl && btnEl.classList.contains('collapsed')) {
            btnEl.click();
          } else if (collapseEl && window.bootstrap && window.bootstrap.Collapse) {
            try { window.bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show(); } catch (err) {}
          }
        }

        var $input = $('#data_hub-log2fcThreshold');
        if (!$input.length) {
          $input = $('input[id*="log2fcThreshold"]');
        }

        if ($input.length) {
          var inputEl = $input[0];
          var $formGroup = $input.closest('.form-group, .col-6, div');

          setTimeout(function() {
            if (typeof scrollDrawerToItem === 'function' && $formGroup.length) {
              scrollDrawerToItem($drawer, $formGroup);
            } else {
              inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            inputEl.focus();
            try { inputEl.select(); } catch(err) {}

            var $target = $formGroup.length ? $formGroup : $input;
            $target.addClass('highlight-focus-pulse highlight-radar');
            setTimeout(function() {
              $target.removeClass('highlight-focus-pulse highlight-radar');
            }, 2100);
          }, 150);
        }
      };

      // Point directly to both P-value and Log2FC cutoffs in Differential Expression menu
      window.pointToCutoffsMenu = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        if (e && e.target) {
          var btn = e.target.closest('.btn-point-de-menu, .btn-quick-access, button');
          if (btn) {
            btn.classList.add('active');
            setTimeout(function() { btn.classList.remove('active'); }, 500);
          }
        }

        if (typeof window.activateDockTab === 'function') {
          window.activateDockTab('cohorts');
        }
        var dockEl = document.querySelector('.unified-sidebar-dock');
        if (dockEl && dockEl.classList.contains('collapsed')) {
          dockEl.classList.remove('collapsed');
        }

        var $panelCohorts = $('#dock_panel_cohorts');
        var $drawer = $panelCohorts.length ? $panelCohorts : $('#main_sidebar .sidebar-content');
        var $deItem = $('#dock_panel_cohorts .accordion-item').filter(function() {
          return $(this).text().indexOf('Differential Expression') !== -1;
        });
        if (!$deItem.length) {
          $deItem = $('#data_hub-main_accordion .accordion-item[data-value="3. Differential Expression"]');
        }
        if ($deItem && $deItem.length) {
          var btnEl = $deItem.find('.accordion-button')[0];
          var collapseEl = $deItem.find('.accordion-collapse')[0];
          if (btnEl && btnEl.classList.contains('collapsed')) {
            btnEl.click();
          } else if (collapseEl && window.bootstrap && window.bootstrap.Collapse) {
            try { window.bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show(); } catch (err) {}
          }
        }

        var $l2fc = $('#data_hub-log2fcThreshold');
        if (!$l2fc.length) $l2fc = $('input[id*="log2fcThreshold"]');
        var $pval = $('#data_hub-pFilterThreshold');
        if (!$pval.length) $pval = $('input[id*="pFilterThreshold"]');

        var $cutoffsBlock = $l2fc.closest('.dock-group-block, .form-group, div');
        if (!$cutoffsBlock.length) $cutoffsBlock = $pval.closest('.dock-group-block, .form-group, div');

        setTimeout(function() {
          if (typeof scrollDrawerToItem === 'function' && $cutoffsBlock.length) {
            scrollDrawerToItem($drawer, $cutoffsBlock);
          } else if ($cutoffsBlock.length) {
            $cutoffsBlock[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          var $targets = $cutoffsBlock.length ? $cutoffsBlock : $l2fc.closest('.form-group, .col-6').add($pval.closest('.form-group, .col-6'));
          $targets.addClass('highlight-focus-pulse de-menu-highlight-pulse highlight-radar');
          setTimeout(function() {
            $targets.removeClass('highlight-focus-pulse de-menu-highlight-pulse highlight-radar');
          }, 2100);

          if ($l2fc.length) {
            $l2fc[0].focus();
            try { $l2fc[0].select(); } catch(errFocus) {}
          }
        }, 180);
      };

      // Sync inline cutoffs directly to data_hub sidebar inputs
      window.syncCutoffFromBanner = function(field, val) {
        var numVal = parseFloat(val);
        if (isNaN(numVal)) return;
        var inputId = (field === 'log2fc') ? 'data_hub-log2fcThreshold' : 'data_hub-pFilterThreshold';
        var $target = $('#' + inputId);
        if (!$target.length) {
          $target = (field === 'log2fc') ? $('input[id*="log2fcThreshold"]') : $('input[id*="pFilterThreshold"]');
        }
        if ($target.length) {
          $target.val(numVal);
          $target.trigger('change');
        }
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue(inputId, numVal, {priority: 'event'});
        }
      };

      window.applyInlineCutoffs = function(l2fcInputId, pvalInputId) {
        var l2fcEl = document.getElementById(l2fcInputId);
        var pvalEl = document.getElementById(pvalInputId);
        var l2fcVal = l2fcEl ? parseFloat(l2fcEl.value) : null;
        var pvalVal = pvalEl ? parseFloat(pvalEl.value) : null;

        if (l2fcVal !== null && !isNaN(l2fcVal)) {
          window.syncCutoffFromBanner('log2fc', l2fcVal);
        }
        if (pvalVal !== null && !isNaN(pvalVal)) {
          window.syncCutoffFromBanner('pval', pvalVal);
        }

        var $l2fc = $('#data_hub-log2fcThreshold, input[id*="log2fcThreshold"]');
        var $pval = $('#data_hub-pFilterThreshold, input[id*="pFilterThreshold"]');
        var $pulseEls = $l2fc.closest('.form-group, .col-6').add($pval.closest('.form-group, .col-6'));
        if (!$pulseEls.length) $pulseEls = $l2fc.add($pval);
        $pulseEls.addClass('highlight-focus-pulse highlight-radar');
        setTimeout(function() { $pulseEls.removeClass('highlight-focus-pulse highlight-radar'); }, 2100);
      };

      window.pointToElement = function(selector, dockTab, accordionTitle, e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        // 1. Tactile active state on the clicked quick access button
        if (e && e.target) {
          var btn = e.target.closest('.btn-quick-access');
          if (btn) {
            btn.classList.add('active');
            setTimeout(function() { btn.classList.remove('active'); }, 500);
          }
        }

        // 2. Ensure target dock tab is activated
        if (dockTab && typeof window.activateDockTab === 'function') {
          window.activateDockTab(dockTab);
        }

        // 3. Ensure sidebar dock is expanded (supports both bslib sidebar and custom dock)
        var $sidebar = $('#main_sidebar, aside.sidebar, .unified-sidebar-dock, #main_sidebar_container');
        if ($sidebar.hasClass('collapsed') || $('.bslib-sidebar-layout').hasClass('sidebar-collapsed')) {
          var $toggle = $('.collapse-toggle, button[data-bs-target="#main_sidebar"], [aria-controls="main_sidebar"]');
          if ($toggle.length) {
            $toggle.trigger('click');
          } else {
            $sidebar.removeClass('collapsed');
            $('.bslib-sidebar-layout').removeClass('sidebar-collapsed');
          }
        }

        // Helper to expand a Bootstrap collapse and all its ancestor collapses
        var expandCollapseAndAncestors = function(collapseEl) {
          if (!collapseEl) return;
          var $collapses = $(collapseEl).add($(collapseEl).parents('.accordion-collapse, .collapse'));
          $collapses.each(function() {
            var col = this;
            if (!col.classList.contains('show')) {
              var $item = $(col).closest('.accordion-item');
              var btn = $item.children('.accordion-header').find('.accordion-button')[0] ||
                        $item.find('.accordion-button')[0] ||
                        document.querySelector('button[data-bs-target="#' + col.id + '"]');
              if (btn && btn.classList.contains('collapsed')) {
                btn.click();
              } else if (window.bootstrap && window.bootstrap.Collapse) {
                try { window.bootstrap.Collapse.getOrCreateInstance(col, { toggle: false }).show(); } catch (err) {}
              } else {
                col.classList.add('show');
              }
            }
          });
        };

        // 4. Open accordion matching accordionTitle if specified
        if (accordionTitle) {
          var $panel = dockTab ? $('#dock_panel_' + dockTab) : $('.dock-panel.active, #main_sidebar');
          var $matchedButtons = $panel.find('.accordion-button').filter(function() {
            return $(this).text().trim().toLowerCase().indexOf(accordionTitle.toLowerCase()) !== -1;
          });
          if (!$matchedButtons.length) {
            $matchedButtons = $panel.find('.accordion-header').filter(function() {
              return $(this).text().trim().toLowerCase().indexOf(accordionTitle.toLowerCase()) !== -1;
            }).find('.accordion-button');
          }
          $matchedButtons.each(function() {
            var b = this;
            if (b.classList.contains('collapsed')) {
              b.click();
            }
            var pCol = $(b).closest('.accordion-collapse');
            if (pCol.length && pCol.parent().closest('.accordion-collapse').length) {
              expandCollapseAndAncestors(pCol.parent().closest('.accordion-collapse')[0]);
            }
          });
        }

        // 5. If targeting shape grouping, ensure useShapes is checked so conditionalPanel unhides!
        if (selector && selector.indexOf('shapeGrouping') !== -1) {
          var $useShapes = $('#qc_pca_tab-useShapes, [id$="-useShapes"], #useShapes');
          if ($useShapes.length && !$useShapes.prop('checked')) {
            $useShapes.trigger('click');
          }
        }

        // 6. Staged scroll, focus, and visual frame flash
        var scrollAndPulse = function() {
          var $el = $(selector);
          if (!$el.length) {
            var cleanId = selector.replace(/^[#.]/, '');
            $el = $('[id$="' + cleanId + '"], [name$="' + cleanId + '"]');
          }

          if ($el.length) {
            // Expand all ancestor collapses containing this element
            $el.parents('.accordion-collapse, .collapse').each(function() {
              expandCollapseAndAncestors(this);
            });

            // Special check for shapeGrouping unhiding
            if (selector && selector.indexOf('shapeGrouping') !== -1) {
              var $chk = $('#qc_pca_tab-useShapes, [id$="-useShapes"], #useShapes');
              if ($chk.length && !$chk.prop('checked')) {
                $chk.trigger('click');
              }
            }

            // Determine visible container for scrolling and flashing
            var $target = $el;
            if ($el.closest('.shiny-input-container').length) {
              $target = $el.closest('.shiny-input-container');
            } else if ($el.closest('.form-group').length) {
              $target = $el.closest('.form-group');
            } else if ($el.closest('.dock-group-block').length) {
              $target = $el.closest('.dock-group-block');
            }

            // Target the visible element for scrolling (solves hidden <select> under selectize)
            var scrollDom = null;
            if ($target.is(':visible') && $target[0]) {
              scrollDom = $target[0];
            } else if ($el.is(':visible') && $el[0]) {
              scrollDom = $el[0];
            } else {
              var $visParent = $target.parents(':visible');
              if ($visParent.length) scrollDom = $visParent[0];
            }

            if (scrollDom && typeof scrollDom.scrollIntoView === 'function') {
              try {
                scrollDom.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } catch (err) {}
            }

            if (typeof $el.focus === 'function' && $el.is(':visible')) {
              try { $el.focus({ preventScroll: true }); } catch (err) {}
            }

            // Visual frame pulsing
            if (typeof window.flashHarmoniousFrame === 'function') {
              window.flashHarmoniousFrame($target);
            } else {
              $target.removeClass('harmonious-frame-blink highlight-focus-pulse highlight-radar');
              if ($target[0]) void $target[0].offsetWidth;
              $target.addClass('harmonious-frame-blink highlight-focus-pulse highlight-radar');
              setTimeout(function() {
                $target.removeClass('harmonious-frame-blink highlight-focus-pulse highlight-radar');
              }, 2600);
            }
          }
        };

        // Multi-phase execution to guarantee visibility during and after Bootstrap transitions
        setTimeout(scrollAndPulse, 80);
        setTimeout(scrollAndPulse, 380);
        setTimeout(scrollAndPulse, 680);
      };

      window.setPropPosition = function(val, e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        if (e && e.target) {
          var btn = e.target.closest('.btn-quick-access');
          if (btn) {
            btn.classList.add('active');
            setTimeout(function() { btn.classList.remove('active'); }, 500);
          }
        }

        // Ensure subtab is on Stacked Proportions ('proportions_view')
        var $subtabPill = $('.prop-card-tabs [data-value="proportions_view"], .prop-card-tabs a:contains("Stacked Proportions"), .prop-card-tabs button:contains("Stacked Proportions")');
        if ($subtabPill.length) {
          $subtabPill.first().click();
        }
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('structural_tab-prop_subtab_view', 'proportions_view');
        }

        // Set the select input value and trigger change
        var $sel = $('#structural_tab-prop_position');
        var targetVal = val || 'side_by_side';
        if ($sel.length) {
          if ($sel.val() === targetVal) {
            targetVal = 'both'; // toggle if already set
          }
          $sel.val(targetVal).trigger('change');
          if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
            window.Shiny.setInputValue('structural_tab-prop_position', targetVal);
          }
        }

        // Focus and radar pulse in left dock
        window.pointToElement('#structural_tab-prop_position', 'plot_controls', '1. Proportion Settings', e);
      };

      window.switchPropSubtab = function(tabVal, e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        var isDiff = (tabVal === 'differential_view' || tabVal === 'diff_acyl_view' || tabVal === 'Differential Acyl Chain Expression');
        var viewVal = isDiff ? 'differential_view' : 'proportions_view';
        var subsubLabel = isDiff ? 'Differential Acyl Chain Expression' : 'Stacked Proportions';

        if (e && e.target) {
          var btn = e.target.closest('.btn-quick-access');
          if (btn) {
            btn.classList.add('active');
            setTimeout(function() { btn.classList.remove('active'); }, 500);
          }
        }

        // Update tertiary subsubtab bar pill if present
        if (typeof activeSubsubMap !== 'undefined') {
          activeSubsubMap['Main Class & Acyl Chain Proportions'] = subsubLabel;
        }
        $('#tertiary_subsubtab_bar .subsubtab-pill').each(function() {
          var t = $(this).attr('data-target');
          if (t === subsubLabel || t === viewVal) {
            $('#tertiary_subsubtab_bar .subsubtab-pill').removeClass('active');
            $(this).addClass('active');
          }
        });

        // Trigger underlying Bootstrap tab switch in card
        var $targetPill = $('.prop-card-tabs [data-value="' + viewVal + '"]');
        if (!$targetPill.length) {
          $targetPill = $('.prop-card-tabs button, .prop-card-tabs a').filter(function() {
            var txt = $(this).text().trim();
            return isDiff ? (txt.indexOf('Differential') !== -1) : (txt.indexOf('Stacked') !== -1);
          });
        }
        if ($targetPill.length) {
          if (window.bootstrap && window.bootstrap.Tab) {
            try {
              var bsTab = window.bootstrap.Tab.getOrCreateInstance($targetPill[0]);
              if (bsTab) bsTab.show();
            } catch(err) {}
          }
          $targetPill.first().click();
        }

        // Notify Shiny server
        if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
          window.Shiny.setInputValue('structural_tab-prop_subtab_view', viewVal);
        }

        // Sync Dock Controls and title
        if (isDiff) {
          $('#docked_active_plot_controls .prop-stacked-controls').hide();
          $('#docked_active_plot_controls .prop-diff-controls').show();
          $('#dock_active_module_title').text('Differential Acyl Chain Controls');
          $('#dock_active_module_icon').attr('class', 'fas fa-scale-balanced text-secondary');
        } else {
          $('#docked_active_plot_controls .prop-diff-controls').hide();
          $('#docked_active_plot_controls .prop-stacked-controls').show();
          $('#dock_active_module_title').text('Stacked Proportions Controls');
          $('#dock_active_module_icon').attr('class', 'fas fa-chart-bar text-secondary');
        }

        if (typeof applyDockCategoryTints === 'function') {
          setTimeout(applyDockCategoryTints, 30);
          setTimeout(applyDockCategoryTints, 150);
          setTimeout(applyDockCategoryTints, 300);
        }

        window.dispatchEvent(new Event('resize'));
        $(window).trigger('resize');
      };

      window.pointToAdvancedAesthetics = function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        var $activePane = $('.tab-pane.active');
        var $acc = $activePane.find('#fla_tab-fla_advanced_aesthetics_accordion, #heatmap_barchart_tab-heatmap_advanced_aesthetics_accordion, [id*="advanced_aesthetics_accordion"]');
        if (!$acc.length) {
          $acc = $('#fla_tab-fla_advanced_aesthetics_accordion, #heatmap_barchart_tab-heatmap_advanced_aesthetics_accordion');
        }
        if (!$acc.length) {
          $acc = $('[id$="fla_advanced_aesthetics_accordion"], [id$="heatmap_advanced_aesthetics_accordion"], [id*="advanced_aesthetics_accordion"]');
        }
        if (!$acc.length) {
          $acc = $activePane.find('.accordion').filter(function() {
            return $(this).text().indexOf('Advanced Aesthetics & Ordering') !== -1 || $(this).text().indexOf('Advanced Aesthetics') !== -1;
          });
        }
        if (!$acc.length) {
          $acc = $('.accordion').filter(function() {
            return $(this).text().indexOf('Advanced Aesthetics & Ordering') !== -1 || $(this).text().indexOf('Advanced Aesthetics') !== -1;
          });
        }

        if ($acc.length) {
          var accEl = $acc[0];
          var btn = $acc.find('.accordion-button')[0];
          if (btn && btn.classList.contains('collapsed')) {
            btn.click();
          } else {
            var collapseEl = $acc.find('.accordion-collapse')[0];
            if (collapseEl && window.bootstrap && window.bootstrap.Collapse) {
              try { window.bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show(); } catch(err) {}
            }
          }

          setTimeout(function() {
            accEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var scrollContainer = $acc.closest('.main, .tab-pane')[0];
            if (scrollContainer && scrollContainer.scrollTop !== undefined) {
              try {
                var targetY = accEl.offsetTop - (scrollContainer.clientHeight / 3);
                scrollContainer.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
              } catch(e) {}
            }
            $acc.addClass('highlight-focus-pulse highlight-radar');
            setTimeout(function() {
              $acc.removeClass('highlight-focus-pulse highlight-radar');
            }, 2100);
          }, 150);
        }
      };

      window.pointToBottomMenu = function(selector, title, e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

        var $activePane = $('.tab-pane.active');
        var $acc = $();
        if (selector) {
          $acc = $activePane.find(selector);
          if (!$acc.length) $acc = $(selector);
          if (!$acc.length) {
            var clean = selector.replace(/^[#.]/, '');
            $acc = $('[id$="' + clean + '"], [id*="' + clean + '"]');
          }
        }
        if (!$acc.length && title) {
          $acc = $activePane.find('.accordion').filter(function() {
            return $(this).text().toLowerCase().indexOf(title.toLowerCase()) !== -1;
          });
          if (!$acc.length) {
            $acc = $('.accordion').filter(function() {
              return $(this).text().toLowerCase().indexOf(title.toLowerCase()) !== -1;
            });
          }
        }

        if ($acc.length) {
          var accEl = $acc[0];
          var btn = $acc.find('.accordion-button')[0];
          if (btn && btn.classList.contains('collapsed')) {
            btn.click();
          } else {
            var collapseEl = $acc.find('.accordion-collapse')[0];
            if (collapseEl && window.bootstrap && window.bootstrap.Collapse) {
              try { window.bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show(); } catch(err) {}
            }
          }

          setTimeout(function() {
            accEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var scrollContainer = $acc.closest('.main, .tab-pane')[0];
            if (scrollContainer && scrollContainer.scrollTop !== undefined) {
              try {
                var targetY = accEl.offsetTop - (scrollContainer.clientHeight / 3);
                scrollContainer.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
              } catch(e) {}
            }
            $acc.addClass('highlight-focus-pulse highlight-radar');
            setTimeout(function() {
              $acc.removeClass('highlight-focus-pulse highlight-radar');
            }, 2100);
          }, 150);
        }
      };

      function initSecondaryHorizontalSubnavbar() {
        var $navbar = $('nav.navbar');
        if ($navbar.length === 0) return;

        if ($('#secondary_subtab_bar').length === 0) {
          var subnavHtml = '<div id="secondary_subtab_bar" class="secondary-horizontal-subnavbar">' +
            '<div class="subnavbar-container">' +
              '<div class="subnavbar-category-indicator">' +
                '<i class="fas fa-shield-halved"></i> <span>Quality Control</span>' +
              '</div>' +
              '<div class="subnavbar-pills-list"></div>' +
            '</div>' +
          '</div>';
          $navbar.after(subnavHtml);
        }

        if ($('#tertiary_subsubtab_bar').length === 0) {
          var subsubnavHtml = '<div id="tertiary_subsubtab_bar" class="tertiary-horizontal-subsubnavbar" style="display: none;">' +
            '<div class="subsubnavbar-container">' +
              '<svg class="dendrogram-canvas" preserveAspectRatio="none"></svg>' +
              '<div class="subsubnavbar-pills-wrapper">' +
                '<div class="subsubnavbar-category-label">' +
                  '<i class="fas fa-diagram-project text-primary"></i> <span class="subsub-parent-name">Heatmap</span>' +
                '</div>' +
                '<div class="subsubnavbar-pills-list"></div>' +
              '</div>' +
            '</div>' +
          '</div>';
          $('#secondary_subtab_bar').after(subsubnavHtml);
        }

        // Intercept clicks on primary hyper tab links in .navbar-nav
        $(document).on('click', '.navbar-nav > li.dropdown > a.dropdown-toggle, .navbar-nav > li > a.nav-link', function(e) {
          var $link = $(this);
          var linkText = $link.text().trim();
          var entry = NAV_STRUCTURE.find(function(n) {
            return linkText.indexOf(n.hypertab) !== -1 || linkText.indexOf(n.shortTitle) !== -1;
          });

          if (entry) {
            e.preventDefault();
            e.stopPropagation();

            // Set primary hyper tab as active in navbar
            $('.navbar-nav .nav-link').removeClass('active');
            $('.navbar-nav li.dropdown').removeClass('active');
            $link.addClass('active');
            $link.closest('li.dropdown').addClass('active');

            // Find desired target subtab
            var target = activeSubtabMap[entry.hypertab] || entry.subtabs[0].target;
            renderSecondarySubnavbar(entry.hypertab, target);

            // Trigger Shiny tab activation for target subtab
            var $targetLink = $('a[data-value="' + target + '"], a.dropdown-item[data-value="' + target + '"]');
            if ($targetLink.length) {
              if (window.bootstrap && window.bootstrap.Tab) {
                try {
                  var bsTab = window.bootstrap.Tab.getOrCreateInstance($targetLink[0]);
                  if (bsTab) bsTab.show();
                } catch(err) {}
              }
              $targetLink[0].click();
            }

            // Unified Dock: Dock active plot controls and switch dock to [Plot Controls]
            if (typeof window.dockActivePlotControls === 'function') {
              window.dockActivePlotControls(target);
            }
            if (typeof window.activateDockTab === 'function') {
              window.activateDockTab('plot_controls');
            }
          }
        });

        // Click on a subtab pill in the 2ndary horizontal line
        $(document).on('click', '#secondary_subtab_bar .subtab-pill', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var $pill = $(this);
          var target = $pill.attr('data-target');
          if (!target) return;

          $('#secondary_subtab_bar .subtab-pill').removeClass('active');
          $pill.addClass('active');

          // Record as active in map
          for (var i = 0; i < NAV_STRUCTURE.length; i++) {
            var st = NAV_STRUCTURE[i].subtabs.find(function(s) { return s.target === target; });
            if (st) {
              activeSubtabMap[NAV_STRUCTURE[i].hypertab] = target;
              break;
            }
          }

          renderTertiarySubsubnavbar(target);

          // Trigger click / tab show on underlying Shiny tab link
          var $targetLink = $('a[data-value="' + target + '"], a.dropdown-item[data-value="' + target + '"]');
          if ($targetLink.length) {
            if (window.bootstrap && window.bootstrap.Tab) {
              try {
                var bsTab = window.bootstrap.Tab.getOrCreateInstance($targetLink[0]);
                if (bsTab) bsTab.show();
              } catch(err) {}
            }
            $targetLink[0].click();
          }

          // Unified Dock: Dock active plot controls and switch dock to [Plot Controls]
          if (typeof window.dockActivePlotControls === 'function') {
            window.dockActivePlotControls(target);
          }
          if (typeof window.activateDockTab === 'function') {
            window.activateDockTab('plot_controls');
          }
        });

        // Click on a subsubtab pill in the 3rd horizontal line
        $(document).on('click', '#tertiary_subsubtab_bar .subsubtab-pill', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var $pill = $(this);
          var target = $pill.attr('data-target');
          var parentSubtab = $pill.attr('data-subtab');
          if (!target) return;

          $('#tertiary_subsubtab_bar .subsubtab-pill').removeClass('active');
          $pill.addClass('active');

          if (parentSubtab) {
            activeSubsubMap[parentSubtab] = target;
          }

          var lookupTarget = target;
          if (parentSubtab === 'Main Class & Acyl Chain Proportions') {
            lookupTarget = (target === 'Differential Acyl Chain Expression' || target === 'differential_view') ? 'differential_view' : 'proportions_view';
          }

          // Trigger underlying Bootstrap tab switch
          var $tabLink = $('[data-bs-toggle="tab"][data-value="' + lookupTarget + '"], [data-toggle="tab"][data-value="' + lookupTarget + '"], [data-bs-target][data-value="' + lookupTarget + '"], [data-bs-toggle="tab"][data-value="' + target + '"], [data-toggle="tab"][data-value="' + target + '"]');
          if (!$tabLink.length) {
            $('[data-bs-toggle="tab"], [data-toggle="tab"], button.nav-link, a.nav-link').each(function() {
              var t = $(this).text().trim();
              if (t === target || t === lookupTarget) {
                $tabLink = $(this);
                return false;
              }
            });
          }

          if ($tabLink.length) {
            if (window.bootstrap && window.bootstrap.Tab) {
              try {
                var bsTab = window.bootstrap.Tab.getOrCreateInstance($tabLink[0]);
                if (bsTab) bsTab.show();
              } catch(err) {}
            }
            $tabLink[0].click();
          }

          // Notify Shiny server if relevant
          if (parentSubtab === 'Heatmap' && window.Shiny && typeof window.Shiny.setInputValue === 'function') {
            window.Shiny.setInputValue('heatmap_barchart_tab-heatmap_tabs', target);
          } else if (parentSubtab === 'Quality Check' && window.Shiny && typeof window.Shiny.setInputValue === 'function') {
            window.Shiny.setInputValue('qc_pca_tab-main_tabs', target);
          } else if (parentSubtab === 'Composition' && window.Shiny && typeof window.Shiny.setInputValue === 'function') {
            window.Shiny.setInputValue('barchart-barchart_tabs', target);
          } else if (parentSubtab === 'Structural' && window.Shiny && typeof window.Shiny.setInputValue === 'function') {
            window.Shiny.setInputValue('structural_tab-structural_subtabs', target);
          } else if (parentSubtab === 'Main Class & Acyl Chain Proportions') {
            var propVal = (target === 'Differential Acyl Chain Expression' || target === 'differential_view') ? 'differential_view' : 'proportions_view';
            if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
              window.Shiny.setInputValue('structural_tab-prop_subtab_view', propVal);
            }
            if (propVal === 'differential_view') {
              $('#docked_active_plot_controls .prop-stacked-controls').hide();
              $('#docked_active_plot_controls .prop-diff-controls').show();
              $('#dock_active_module_title').text('Differential Acyl Chain Controls');
              $('#dock_active_module_icon').attr('class', 'fas fa-scale-balanced text-secondary');
            } else {
              $('#docked_active_plot_controls .prop-diff-controls').hide();
              $('#docked_active_plot_controls .prop-stacked-controls').show();
              $('#dock_active_module_title').text('Stacked Proportions Controls');
              $('#dock_active_module_icon').attr('class', 'fas fa-chart-bar text-secondary');
            }
            setTimeout(applyDockCategoryTints, 30);
            setTimeout(applyDockCategoryTints, 150);
            setTimeout(applyDockCategoryTints, 300);
          } else if (parentSubtab === 'Structural Grid' && window.Shiny && typeof window.Shiny.setInputValue === 'function') {
            window.Shiny.setInputValue('structural_grid_tab-grid_tabs', target);
          } else if (parentSubtab === 'Math Proof') {
            if (window.Shiny && typeof window.Shiny.setInputValue === 'function') {
              window.Shiny.setInputValue('math_proof_tab-stepper_tabs', target);
            }
          }

          updateDendrogramCanvas();
        });

        $(window).on('resize', function() {
          updateDendrogramCanvas();
        });

        // Sync when Shiny tab switches (e.g. from nav_select or direct click)
        $(document).on('shown.bs.tab', 'a[data-bs-toggle="tab"], button[data-bs-toggle="tab"]', function(e) {
          var target = $(e.target).attr('data-value') || $(e.target).text().trim();

          // Sync Proportions subviews if relevant
          if (target === 'differential_view' || target === 'Differential Acyl Chain Expression') {
            $('#docked_active_plot_controls .prop-stacked-controls').hide();
            $('#docked_active_plot_controls .prop-diff-controls').show();
            $('#dock_active_module_title').text('Differential Acyl Chain Controls');
            $('#dock_active_module_icon').attr('class', 'fas fa-scale-balanced text-secondary');
            if (typeof activeSubsubMap !== 'undefined') {
              activeSubsubMap['Main Class & Acyl Chain Proportions'] = 'Differential Acyl Chain Expression';
            }
            $('#tertiary_subsubtab_bar .subsubtab-pill').each(function() {
              var t = $(this).attr('data-target');
              if (t === 'Differential Acyl Chain Expression' || t === 'differential_view') {
                $('#tertiary_subsubtab_bar .subsubtab-pill').removeClass('active');
                $(this).addClass('active');
              }
            });
            setTimeout(applyDockCategoryTints, 30);
            return;
          } else if (target === 'proportions_view' || target === 'Stacked Proportions') {
            $('#docked_active_plot_controls .prop-diff-controls').hide();
            $('#docked_active_plot_controls .prop-stacked-controls').show();
            $('#dock_active_module_title').text('Stacked Proportions Controls');
            $('#dock_active_module_icon').attr('class', 'fas fa-chart-bar text-secondary');
            if (typeof activeSubsubMap !== 'undefined') {
              activeSubsubMap['Main Class & Acyl Chain Proportions'] = 'Stacked Proportions';
            }
            $('#tertiary_subsubtab_bar .subsubtab-pill').each(function() {
              var t = $(this).attr('data-target');
              if (t === 'Stacked Proportions' || t === 'proportions_view') {
                $('#tertiary_subsubtab_bar .subsubtab-pill').removeClass('active');
                $(this).addClass('active');
              }
            });
            setTimeout(applyDockCategoryTints, 30);
            return;
          }

          for (var i = 0; i < NAV_STRUCTURE.length; i++) {
            var entry = NAV_STRUCTURE[i];
            var match = entry.subtabs.find(function(s) { return s.target === target; });
            if (match) {
              activeSubtabMap[entry.hypertab] = target;

              // Highlight primary hyper tab
              $('.navbar-nav .nav-link').removeClass('active');
              $('.navbar-nav li.dropdown').removeClass('active');
              $('.navbar-nav a.dropdown-toggle').each(function() {
                var txt = $(this).text().trim();
                if (txt.indexOf(entry.hypertab) !== -1 || txt.indexOf(entry.shortTitle) !== -1) {
                  $(this).addClass('active');
                  $(this).closest('li.dropdown').addClass('active');
                }
              });

              renderSecondarySubnavbar(entry.hypertab, target);
              if (typeof window.dockActivePlotControls === 'function') {
                window.dockActivePlotControls(target);
              }
              break;
            }
          }

          // Also check if this matches an active sub-sub tab
          $('#tertiary_subsubtab_bar .subsubtab-pill').each(function() {
            if ($(this).attr('data-target') === target) {
              $('#tertiary_subsubtab_bar .subsubtab-pill').removeClass('active');
              $(this).addClass('active');
              updateDendrogramCanvas();
              return false;
            }
          });
        });

        // Initial render: determine active tab or default to Quality Control
        setTimeout(function() {
          var activeTab = null;
          $('.tab-pane.active').each(function() {
            var val = $(this).attr('data-value');
            if (val) {
              for (var i = 0; i < NAV_STRUCTURE.length; i++) {
                if (NAV_STRUCTURE[i].subtabs.some(function(s) { return s.target === val; })) {
                  activeTab = val;
                  return false;
                }
              }
            }
          });
          if (!activeTab) activeTab = 'Quality Check';

          for (var i = 0; i < NAV_STRUCTURE.length; i++) {
            var entry = NAV_STRUCTURE[i];
            var match = entry.subtabs.find(function(s) { return s.target === activeTab; });
            if (match) {
              renderSecondarySubnavbar(entry.hypertab, activeTab);
              $('.navbar-nav a.dropdown-toggle').each(function() {
                var txt = $(this).text().trim();
                if (txt.indexOf(entry.hypertab) !== -1 || txt.indexOf(entry.shortTitle) !== -1) {
                  $(this).addClass('active');
                  $(this).closest('li.dropdown').addClass('active');
                }
              });
              break;
            }
          }
        }, 150);
      }

      // ==============================================================================
      // UNIFIED DOCK CONTROLLER (PARADIGM 2: SINGLE CONSOLIDATED WORKSPACE DOCK)
      // ==============================================================================

      function activateDockTab(target) {
        if (!target) return;
        $('.dock-segment-btn').removeClass('active');
        $('.dock-segment-btn[data-dock-target="' + target + '"]').addClass('active');

        $('.dock-panel').removeClass('active');
        var $panel = $('#dock_panel_' + target);
        if ($panel.length) {
          $panel.addClass('active');
        }

        if (target === 'plot_controls') {
          dockActivePlotControls();
        }

        setTimeout(function() {
          window.dispatchEvent(new Event('resize'));
          $(window).trigger('resize');
        }, 60);
      }
      window.activateDockTab = activateDockTab;

      function dockActivePlotControls(targetTab) {
        var tabName = targetTab;
        if (!tabName) {
          var $activePill = $('#secondary_subtab_bar .subtab-pill.active');
          if ($activePill.length) {
            tabName = $activePill.attr('data-target');
          }
        }
        if (!tabName) {
          $('.tab-pane.active').each(function() {
            var val = $(this).attr('data-value');
            if (val) {
              tabName = val;
              return false;
            }
          });
        }
        if (!tabName) {
          tabName = 'Quality Check';
        }

        // Context header title and icon
        var iconClass = 'fa-sliders-h';
        var shortTitle = tabName;
        for (var i = 0; i < NAV_STRUCTURE.length; i++) {
          var sub = NAV_STRUCTURE[i].subtabs.find(function(s) { return s.target === tabName; });
          if (sub) {
            iconClass = sub.icon;
            shortTitle = sub.label;
            break;
          }
        }
        if (tabName === 'Main Class & Acyl Chain Proportions') {
          var activeSub = activeSubsubMap['Main Class & Acyl Chain Proportions'] || 'Stacked Proportions';
          if (activeSub === 'Differential Acyl Chain Expression' || activeSub === 'differential_view') {
            iconClass = 'fa-scale-balanced';
            shortTitle = 'Differential Acyl Chain';
          } else {
            iconClass = 'fa-chart-bar';
            shortTitle = 'Stacked Proportions';
          }
        }
        $('#dock_active_module_icon').attr('class', 'fas ' + iconClass + ' text-secondary');
        $('#dock_active_module_title').text(shortTitle + ' Controls');

        var $dockContainer = $('#docked_active_plot_controls');
        if ($dockContainer.length === 0) return;

        var $existingBlock = $dockContainer.find('.docked-module-block[data-docked-for="' + tabName + '"]');
        if ($existingBlock.length) {
          $dockContainer.find('.docked-module-block').removeClass('active').hide();
          $existingBlock.addClass('active').show();
          $dockContainer.find('.dock-empty-state').hide();
        } else {
          // Look for sidebar-content in the tab-pane
          var $pane = $('.tab-pane[data-value="' + tabName + '"]');
          var $secSidebar = $pane.find('.bslib-sidebar-layout > aside.sidebar, aside.sidebar');
          var $secContent = $secSidebar.find('.sidebar-content');

          if ($secContent.length && $secContent.children().length > 0) {
            $dockContainer.find('.docked-module-block').removeClass('active').hide();

            var block = document.createElement('div');
            block.className = 'docked-module-block active';
            block.setAttribute('data-docked-for', tabName);

            var contentEl = $secContent[0];
            while (contentEl.firstChild) {
              block.appendChild(contentEl.firstChild);
            }
            $dockContainer[0].appendChild(block);
            $dockContainer.find('.dock-empty-state').hide();
          } else {
            // No controls for this module
            $dockContainer.find('.docked-module-block').removeClass('active').hide();
            var $empty = $dockContainer.find('.dock-empty-state');
            $empty.show();
            $empty.find('p').text('No module-specific plot controls for ' + shortTitle + '.');
          }
        }

        if (tabName === 'Main Class & Acyl Chain Proportions') {
          var currentSub = activeSubsubMap['Main Class & Acyl Chain Proportions'] || 'Stacked Proportions';
          var isDiffMode = (currentSub === 'Differential Acyl Chain Expression' || currentSub === 'differential_view');
          if (isDiffMode) {
            $dockContainer.find('.prop-stacked-controls').hide();
            $dockContainer.find('.prop-diff-controls').show();
          } else {
            $dockContainer.find('.prop-diff-controls').hide();
            $dockContainer.find('.prop-stacked-controls').show();
          }
        }

        // Trigger resize so plotting frameworks recalibrate
        window.dispatchEvent(new Event('resize'));
        $(window).trigger('resize');

        // Apply domain-anchored category tints to newly docked accordions
        setTimeout(applyDockCategoryTints, 30);
        setTimeout(applyDockCategoryTints, 150);
        setTimeout(applyDockCategoryTints, 400);
      }
      window.dockActivePlotControls = dockActivePlotControls;

      function applyDockCategoryTints() {
        // Pass 1: Numbered menus & explicit top-level categories
        $('.accordion-item').each(function() {
          var $item = $(this);
          var $btn = $item.find('.accordion-button').first();
          if ($btn.length === 0) return;
          
          var rawTitle = ($btn.find('.accordion-title').length ? $btn.find('.accordion-title').text() : $btn.text()).trim();
          if (!rawTitle) rawTitle = $btn.text().trim();
          var title = rawTitle.toLowerCase();

          var category = null;
          var menuNum = null;

          // Priority 1: Strict numbered prefix match: /^0\./, /^1\./, /^2\./, /^3\./, etc.
          var numMatch = rawTitle.match(/^([0-9]+)\./);
          if (numMatch) {
            var n = parseInt(numMatch[1], 10);
            menuNum = n;
            if (n === 0) category = 'sample-cohort';
            else if (n === 1) category = 'data-processing';
            else if (n === 2) category = 'plot-settings';
            else if (n === 3) category = 'inspection-views';
            else if (n === 4) category = 'advanced-aesthetics';
            else if (n === 5) category = 'menu-5';
            else if (n === 6) category = 'menu-6';
            else if (n === 7) category = 'menu-7';
            else if (n === 8) category = 'menu-8';
            else category = 'advanced-aesthetics';
          } else if (title.indexOf('advanced aesthetics') !== -1 || $item.is('[id*="advanced_aesthetics_accordion"]')) {
            category = 'advanced-aesthetics';
            menuNum = 4;
          }

          if (category) {
            $item.attr('data-category', category).attr('data-menu', 'menu-' + menuNum);
            $btn.attr('data-category', category).attr('data-menu', 'menu-' + menuNum);
            $item.find('> .accordion-collapse > .accordion-body').attr('data-category', category).attr('data-menu', 'menu-' + menuNum);
          }
        });

        // Pass 2: Nested unnumbered accordion items inherit from parent accordion-item
        $('.accordion-item').each(function() {
          var $item = $(this);
          if ($item.attr('data-category')) return; // Already categorized

          // Look up parent accordion item
          var $parentItem = $item.parent().closest('.accordion-item');
          if ($parentItem.length > 0 && $parentItem.attr('data-category')) {
            var parentCat = $parentItem.attr('data-category');
            var parentMenu = $parentItem.attr('data-menu');
            $item.attr('data-category', parentCat).attr('data-menu', parentMenu);
            var $btn = $item.find('.accordion-button').first();
            $btn.attr('data-category', parentCat).attr('data-menu', parentMenu);
            $item.find('> .accordion-collapse > .accordion-body').attr('data-category', parentCat).attr('data-menu', parentMenu);
            return;
          }

          // Fallback for unnumbered top-level items if any
          var $btn = $item.find('.accordion-button').first();
          var title = $btn.text().trim().toLowerCase();
          var category = null;
          var menuNum = null;

          if (title.indexOf('sample') !== -1 || title.indexOf('cohort') !== -1 || title.indexOf('nomenclature') !== -1 ||
              $btn.find('i.fa-layer-group, i.fa-users, i.fa-id-card, i.fa-user-group, i.fa-font').length > 0) {
            category = 'sample-cohort';
            menuNum = 0;
          } else if (title.indexOf('processing') !== -1 || title.indexOf('contrast') !== -1 || title.indexOf('filter') !== -1 ||
                     $btn.find('i.fa-cogs, i.fa-gears, i.fa-filter, i.fa-scale-balanced, i.fa-calculator').length > 0) {
            category = 'data-processing';
            menuNum = 1;
          } else if (title.indexOf('plot') !== -1 || title.indexOf('visual') !== -1 || title.indexOf('styling') !== -1 ||
                     $btn.find('i.fa-sliders, i.fa-paint-brush, i.fa-paintbrush, i.fa-ruler-combined').length > 0) {
            category = 'plot-settings';
            menuNum = 2;
          } else if (title.indexOf('inspection') !== -1 || title.indexOf('violin') !== -1 ||
                     $btn.find('i.fa-chart-line, i.fa-eye').length > 0) {
            category = 'inspection-views';
            menuNum = 3;
          } else {
            category = 'advanced-aesthetics';
            menuNum = 4;
          }

          $item.attr('data-category', category).attr('data-menu', 'menu-' + menuNum);
          $btn.attr('data-category', category).attr('data-menu', 'menu-' + menuNum);
          $item.find('> .accordion-collapse > .accordion-body').attr('data-category', category).attr('data-menu', 'menu-' + menuNum);
        });

        // Pass 3: Cascade category attributes to all radio groups and checkboxes inside each accordion item
        $('[data-category]').each(function() {
          var cat = $(this).attr('data-category');
          var menu = $(this).attr('data-menu');
          $(this).find('.shiny-input-radiogroup, .shiny-options-group').attr('data-category', cat);
          $(this).find('.checkbox, .form-check').attr('data-category', cat);
          if (menu) {
            $(this).find('.shiny-input-radiogroup, .shiny-options-group').attr('data-menu', menu);
            $(this).find('.checkbox, .form-check').attr('data-menu', menu);
          }
        });
      }
      window.applyDockCategoryTints = applyDockCategoryTints;

      function updateDockSwitcherLayout() {
        var $switcher = $('.dock-segmented-switcher');
        if (!$switcher.length) return;

        var dockWidth = $switcher.outerWidth();
        // If squeezed below 380px or if any label overflows, stack as full-width horizontal bars
        if (dockWidth > 0 && dockWidth < 380) {
          $switcher.addClass('is-stacked');
        } else if (dockWidth >= 380) {
          var isOverflowing = false;
          $switcher.find('.dock-segment-btn').each(function() {
            var span = this.querySelector('span');
            if (span && span.scrollWidth > span.clientWidth + 1) {
              isOverflowing = true;
            }
          });
          if (isOverflowing) {
            $switcher.addClass('is-stacked');
          } else {
            $switcher.removeClass('is-stacked');
          }
        }
      }
      window.updateDockSwitcherLayout = updateDockSwitcherLayout;

      var dockResizeObserver = null;
      function setupDockResizeObserver() {
        if (!window.ResizeObserver || dockResizeObserver) return;
        var el = document.getElementById('main_sidebar_container') || document.querySelector('.dock-segmented-switcher');
        if (el) {
          dockResizeObserver = new ResizeObserver(function() {
            updateDockSwitcherLayout();
          });
          dockResizeObserver.observe(el);
        }
      }

      function initUnifiedDockController() {
        // 1. Segmented Mode Switcher click listener
        $(document).on('click', '.dock-segment-btn', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var target = $(this).attr('data-dock-target');
          activateDockTab(target);
          setTimeout(applyDockCategoryTints, 40);
        });

        $(document).on('shown.bs.collapse shown.bs.tab', function() {
          applyDockCategoryTints();
          updateDockSwitcherLayout();
        });

        $(document).on('shiny:value shiny:idle', function() {
          applyDockCategoryTints();
          updateDockSwitcherLayout();
          setupDockResizeObserver();
        });

        $(window).on('resize orientationchange', function() {
          updateDockSwitcherLayout();
        });

        setupDockResizeObserver();

        // 2. Initial docking of active plot controls (after DOM is fully hydrated)
        setTimeout(function() {
          var $activePill = $('#secondary_subtab_bar .subtab-pill.active');
          var currentTab = $activePill.length ? $activePill.attr('data-target') : 'Quality Check';
          dockActivePlotControls(currentTab);
          applyDockCategoryTints();
          updateDockSwitcherLayout();
          setupDockResizeObserver();
        }, 250);

        setTimeout(function() {
          var $activePill = $('#secondary_subtab_bar .subtab-pill.active');
          var currentTab = $activePill.length ? $activePill.attr('data-target') : 'Quality Check';
          dockActivePlotControls(currentTab);
          applyDockCategoryTints();
          updateDockSwitcherLayout();
          setupDockResizeObserver();
        }, 800);
      }

      $(function() {
        initSecondaryHorizontalSubnavbar();
        initUnifiedDockController();
      });



