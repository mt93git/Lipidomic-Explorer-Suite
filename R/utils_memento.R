# R/utils_memento.R
# Enterprise-Grade Memory-Safe Reactive Memento Pattern Architecture
# RFC 6902 JSON Patch Delta Serialization & Atomic State Caretaker
# Based on Deep Research: DR_26_09_12_J13_05 & Thematic Ledger 03

library(R6)

#' Format parameter value for human-readable display in timeline & diffs
format_param_display <- function(val) {
  if (is.null(val)) return("NULL")
  if (is.logical(val)) return(if (val) "TRUE" else "FALSE")
  if (is.numeric(val)) {
    if (length(val) == 1) return(as.character(round(val, 4)))
    if (length(val) <= 3) return(paste(round(val, 4), collapse = ", "))
    return(paste0("[", length(val), " values: ", paste(round(val[1:2], 4), collapse = ", "), "...]"))
  }
  if (is.character(val)) {
    if (length(val) == 1) return(val)
    if (length(val) <= 4) return(paste(val, collapse = ", "))
    return(paste0("[", length(val), " items: ", paste(val[1:3], collapse = ", "), "...]"))
  }
  if (is.list(val)) {
    return(paste0("[list of ", length(val), " elements]"))
  }
  return(as.character(val))
}

#' Friendly names dictionary for parameter IDs
PARAM_LABELS <- list(
  "pFilterThreshold" = "P-value Cutoff (<)",
  "pValueType" = "P-value Correction Type",
  "log2fcThreshold" = "Log2 Fold Change Threshold (|Log2FC| >=)",
  "deComparisonMode" = "Differential Analysis Mode",
  "deDirectInterface" = "Contrast Interface",
  "deEnablePaired" = "Paired / Repeated Measures Blocking",
  "deMethod" = "Differential Abundance Method",
  "imputationMethod" = "Missing Value Imputation",
  "normalizationMethod" = "Sample Normalization Method",
  "scaleMethod" = "Abundance Scaling Method",
  "bqcFilterToggle" = "BQC Precision Filter Toggle",
  "covCutoff" = "BQC CoV Filter Cutoff (%)",
  "outlierThreshold" = "Outlier Detection Threshold",
  "colorEditMode" = "Color Customization Mode",
  "colorPalette" = "Active Color Palette",
  "selectedSaturationFeatures" = "Saturation Filter (SFA/MUFA/PUFA)",
  "selectedLengthFeatures" = "Chain Length Filter (SCFA-VLCFA)",
  "activateGranularFiltering" = "Granular Chain Filtering Toggle",
  "granularOrderMode" = "Chain Order Logic",
  "useCombo1" = "Chain Filter Combo 1",
  "useCombo2" = "Chain Filter Combo 2",
  "n6_substrates" = "n-6 Pathway Substrates",
  "n3_substrates" = "n-3 Pathway Substrates",
  "substrate_match_positions" = "Substrate Positional Matching"
)

#' Get human-friendly label for an input ID
get_param_friendly_label <- function(param_id) {
  clean_id <- sub("^[a-zA-Z0-9_]+-", "", param_id) # remove module namespace prefix
  if (clean_id %in% names(PARAM_LABELS)) {
    return(PARAM_LABELS[[clean_id]])
  }
  # Convert camelCase to Title Words
  s <- gsub("([A-Z])", " \\\\1", clean_id)
  s <- gsub("_", " ", s)
  return(tools::toTitleCase(trimws(s)))
}

#' Generic server-side input updater supporting all Shiny widget types
update_input_generic_memento <- function(sess, id, val) {
  if (is.null(val)) return()
  tryCatch({
    if (grepl("_json$", id)) {
      val_str <- if (is.list(val) || (is.character(val) && length(val) > 1)) {
        jsonlite::toJSON(val, auto_unbox = TRUE)
      } else if (is.character(val) && length(val) == 1) {
        val
      } else {
        as.character(val)
      }
      shiny::updateTextInput(sess, id, value = val_str)
    } else if (is.logical(val) && length(val) == 1) {
      shiny::updateCheckboxInput(sess, id, value = val)
    } else if (is.numeric(val)) {
      if (length(val) == 2) {
        shiny::updateSliderInput(sess, id, value = val)
      } else {
        shiny::updateNumericInput(sess, id, value = val)
        shiny::updateSliderInput(sess, id, value = val)
      }
    } else if (is.character(val)) {
      shiny::updateCheckboxGroupInput(sess, id, selected = val)
      shiny::updateSelectInput(sess, id, selected = val)
      if (length(val) <= 1) {
        val_scalar <- if (length(val) == 1) val else ""
        shiny::updateTextInput(sess, id, value = val_scalar)
        shiny::updateRadioButtons(sess, id, selected = val_scalar)
        if (length(val) == 1 && grepl("^#", val) && (nchar(val) == 7 || nchar(val) == 9)) {
          if (requireNamespace("colourpicker", quietly = TRUE)) {
            colourpicker::updateColourInput(sess, id, value = val)
          }
        }
      }
    } else if (is.list(val)) {
      val_unlisted <- unlist(val)
      shiny::updateCheckboxGroupInput(sess, id, selected = val_unlisted)
      shiny::updateSelectInput(sess, id, selected = val_unlisted)
    }
  }, error = function(e) {
    # Non-fatal if specific input is not in DOM
  })
}

#' Restore parameter dictionary on server with freezeReactiveValue to avoid cascading loops
restore_inputs_on_server <- function(sess, param_dict) {
  if (is.null(param_dict) || length(param_dict) == 0) return(0)
  
  # Step 1: Freeze reactive values to prevent premature trigger storm
  for (id in names(param_dict)) {
    tryCatch(shiny::freezeReactiveValue(sess$input, id), error = function(e) NULL)
  }
  
  # Step 2: Apply updates across widgets
  count <- 0
  for (id in names(param_dict)) {
    update_input_generic_memento(sess, id, param_dict[[id]])
    count <- count + 1
  }
  
  return(count)
}

#' MementoCaretaker: R6 class managing state history and time travel
MementoCaretaker <- R6Class(
  classname = "MementoCaretaker",
  public = list(
    history = list(),
    current_idx = 0,
    max_depth = 30,
    baseline_state = NULL,
    is_restoring = FALSE,
    
    #' Constructor
    initialize = function(max_depth = 30) {
      self$max_depth <- max_depth
      self$history <- list()
      self$current_idx <- 0
      self$baseline_state <- NULL
      self$is_restoring <- FALSE
    },
    
    #' Compute RFC 6902 compliant JSON patch between old and new state dictionaries
    compute_patch = function(old_dict, new_dict) {
      patch <- list()
      all_new_keys <- names(new_dict)
      all_old_keys <- names(old_dict)
      
      # Check additions and replacements
      for (k in all_new_keys) {
        new_v <- new_dict[[k]]
        if (!k %in% all_old_keys) {
          patch[[length(patch) + 1]] <- list(
            op = "add",
            path = paste0("/", k),
            value = new_v
          )
        } else {
          old_v <- old_dict[[k]]
          if (!identical(old_v, new_v)) {
            patch[[length(patch) + 1]] <- list(
              op = "replace",
              path = paste0("/", k),
              value = new_v
            )
          }
        }
      }
      
      # Check removals
      for (k in all_old_keys) {
        if (!k %in% all_new_keys) {
          patch[[length(patch) + 1]] <- list(
            op = "remove",
            path = paste0("/", k)
          )
        }
      }
      
      return(patch)
    },
    
    #' Apply RFC 6902 patch to base state dictionary
    apply_patch = function(base_dict, patch_list) {
      res <- base_dict
      for (item in patch_list) {
        k <- sub("^/", "", item$path)
        if (item$op == "add" || item$op == "replace") {
          res[[k]] <- item$value
        } else if (item$op == "remove") {
          res[[k]] <- NULL
        }
      }
      return(res)
    },
    
    #' Capture baseline state (Step 0)
    capture_baseline = function(param_list, label = "Baseline (Initial Load)") {
      self$baseline_state <- param_list
      memento <- list(
        id = "memento_step_1_baseline",
        step_num = 1,
        timestamp = format(Sys.time(), "%Y-%m-%d %H:%M:%S"),
        action_label = label,
        module = "System",
        delta_patch = list(),
        params = param_list
      )
      self$history <- list(memento)
      self$current_idx <- 1
      return(memento)
    },
    
    #' Record a new exploratory parameter state change
    record_step = function(label, current_params, module = "Exploration") {
      # Prevent recording while an undo/redo restoration is in flight
      if (self$is_restoring) return(NULL)
      
      # If no baseline captured yet, capture baseline first
      if (self$current_idx == 0 || is.null(self$baseline_state)) {
        return(self$capture_baseline(current_params, label))
      }
      
      # Get current state
      prev_params <- self$history[[self$current_idx]]$params
      patch <- self$compute_patch(prev_params, current_params)
      
      # If nothing changed, do not create redundant memento
      if (length(patch) == 0) {
        return(NULL)
      }
      
      # If user branched from a historical step, prune redo branch
      if (self$current_idx < length(self$history)) {
        self$history <- self$history[1:self$current_idx]
      }
      
      # Generate meaningful label if default
      if (missing(label) || is.null(label) || label == "Exploration") {
        # Autogenerate label from modified keys
        changed_keys <- sapply(patch, function(p) sub("^/", "", p$path))
        friendly_names <- sapply(changed_keys, get_param_friendly_label)
        if (length(friendly_names) == 1) {
          label <- paste("Adjusted", friendly_names[1])
        } else {
          label <- paste("Modified", length(friendly_names), "parameters (", paste(head(friendly_names, 2), collapse = ", "), "...)")
        }
      }
      
      step_num <- length(self$history) + 1
      memento <- list(
        id = paste0("memento_step_", step_num, "_", as.integer(as.numeric(Sys.time()) %% 10000)),
        step_num = step_num,
        timestamp = format(Sys.time(), "%Y-%m-%d %H:%M:%S"),
        action_label = label,
        module = module,
        delta_patch = patch,
        params = current_params
      )
      
      self$history[[length(self$history) + 1]] <- memento
      
      # Enforce sliding window max_depth while preserving step 1 (baseline)
      if (length(self$history) > self$max_depth) {
        # Drop oldest exploratory step (index 2), keep index 1 (baseline)
        self$history <- c(self$history[1], self$history[3:length(self$history)])
        # Renumber steps
        for (i in seq_along(self$history)) {
          self$history[[i]]$step_num <- i
        }
      }
      
      self$current_idx <- length(self$history)
      return(memento)
    },
    
    #' Check if Undo is available
    can_undo = function() {
      return(self$current_idx > 1)
    },
    
    #' Check if Redo is available
    can_redo = function() {
      return(self$current_idx < length(self$history))
    },
    
    #' Step backward in history (Undo)
    undo = function() {
      if (!self$can_undo()) return(NULL)
      self$current_idx <- self$current_idx - 1
      return(self$history[[self$current_idx]]$params)
    },
    
    #' Step forward in history (Redo)
    redo = function() {
      if (!self$can_redo()) return(NULL)
      self$current_idx <- self$current_idx + 1
      return(self$history[[self$current_idx]]$params)
    },
    
    #' Jump directly to an arbitrary step index
    jump_to_step = function(step_idx) {
      if (step_idx < 1 || step_idx > length(self$history)) return(NULL)
      self$current_idx <- step_idx
      return(self$history[[self$current_idx]]$params)
    },
    
    #' Get active memento
    get_current_memento = function() {
      if (self$current_idx == 0 || length(self$history) == 0) return(NULL)
      return(self$history[[self$current_idx]])
    },
    
    #' Get timeline metadata for UI rendering
    get_timeline = function() {
      if (length(self$history) == 0) return(data.frame())
      
      data.frame(
        step_num = sapply(self$history, function(m) m$step_num),
        id = sapply(self$history, function(m) m$id),
        timestamp = sapply(self$history, function(m) m$timestamp),
        action_label = sapply(self$history, function(m) m$action_label),
        module = sapply(self$history, function(m) m$module),
        changes_count = sapply(self$history, function(m) length(m$delta_patch)),
        is_current = seq_along(self$history) == self$current_idx,
        is_baseline = seq_along(self$history) == 1,
        stringsAsFactors = FALSE
      )
    },
    
    #' Compute diff between current state and baseline
    get_diff_with_baseline = function() {
      if (self$current_idx == 0 || is.null(self$baseline_state)) return(data.frame())
      
      curr_params <- self$history[[self$current_idx]]$params
      base_params <- self$baseline_state
      
      all_keys <- unique(c(names(curr_params), names(base_params)))
      diffs <- list()
      
      for (k in all_keys) {
        v_base <- base_params[[k]]
        v_curr <- curr_params[[k]]
        
        if (!identical(v_base, v_curr)) {
          diffs[[length(diffs) + 1]] <- list(
            param_id = k,
            friendly_label = get_param_friendly_label(k),
            baseline_val = format_param_display(v_base),
            current_val = format_param_display(v_curr),
            status = if (is.null(v_base)) "Added" else if (is.null(v_curr)) "Removed" else "Modified"
          )
        }
      }
      
      if (length(diffs) == 0) return(data.frame())
      
      do.call(rbind.data.frame, c(diffs, stringsAsFactors = FALSE))
    },
    
    #' Export history stack to compact JSON string
    export_history_json = function() {
      export_list <- list(
        version = "1.0",
        format = "RFC-6902-Shiny-Memento",
        max_depth = self$max_depth,
        current_idx = self$current_idx,
        baseline_timestamp = if (!is.null(self$baseline_state)) self$history[[1]]$timestamp else NULL,
        history = lapply(self$history, function(m) {
          list(
            id = m$id,
            step_num = m$step_num,
            timestamp = m$timestamp,
            action_label = m$action_label,
            module = m$module,
            delta_patch = m$delta_patch
          )
        })
      )
      jsonlite::toJSON(export_list, auto_unbox = TRUE, pretty = TRUE)
    },
    
    #' Import history stack from JSON
    import_history_json = function(json_str, initial_baseline_params = NULL) {
      parsed <- jsonlite::fromJSON(json_str, simplifyVector = FALSE)
      if (is.null(parsed$history) || length(parsed$history) == 0) return(FALSE)
      
      self$max_depth <- if (!is.null(parsed$max_depth)) parsed$max_depth else 30
      self$history <- list()
      
      # Reconstruct state sequential chain
      running_state <- if (!is.null(initial_baseline_params)) initial_baseline_params else list()
      
      for (i in seq_along(parsed$history)) {
        raw_m <- parsed$history[[i]]
        if (i == 1 && length(running_state) == 0 && length(raw_m$delta_patch) > 0) {
          # Construct baseline from patch if needed
          running_state <- self$apply_patch(list(), raw_m$delta_patch)
        } else if (length(raw_m$delta_patch) > 0) {
          running_state <- self$apply_patch(running_state, raw_m$delta_patch)
        }
        
        memento <- list(
          id = raw_m$id,
          step_num = raw_m$step_num,
          timestamp = raw_m$timestamp,
          action_label = raw_m$action_label,
          module = raw_m$module,
          delta_patch = raw_m$delta_patch,
          params = running_state
        )
        self$history[[length(self$history) + 1]] <- memento
      }
      
      self$baseline_state <- self$history[[1]]$params
      self$current_idx <- if (!is.null(parsed$current_idx)) min(parsed$current_idx, length(self$history)) else length(self$history)
      return(TRUE)
    }
  )
)
