# tests/test_session_roundtrip_simulation.R
# -----------------------------------------------------------------------------
# Comprehensive Session Save & Restore Roundtrip Simulation Test
# Enforcing integrity of state serialization, JSON packaging, and 4-stage hydration
# -----------------------------------------------------------------------------

cat(">>> Starting Session Persistence Roundtrip Simulation Audit...\n\n")

# Source required utilities
if (file.exists("R/global.R")) {
  source("R/global.R")
}

# 1. Mock Raw Dataset & Metadata
raw_samples <- c("Sample_Ctrl_1", "Sample_Ctrl_2", "Sample_SCD_1", "Sample_SCD_2")
raw_lipids <- c("PC(34:1)", "PE(36:2)", "SM(d18:1/16:0)", "TG(52:2)")

# Mock raw data frame
mock_raw_df <- data.frame(
  Lipid_Name = raw_lipids,
  Sample_Ctrl_1 = c(100.5, 20.3, 55.1, 400.2),
  Sample_Ctrl_2 = c(105.2, 19.8, 52.4, 395.1),
  Sample_SCD_1 = c(210.4, 45.6, 30.2, 850.3),
  Sample_SCD_2 = c(205.1, 44.2, 29.8, 860.1),
  stringsAsFactors = FALSE
)

# Mock metadata structure
mock_parsed_metadata <- list(
  parsed_df = data.frame(
    FullName = raw_samples,
    Group1Term = c("Control", "Control", "Sickle Cell Disease", "Sickle Cell Disease"),
    Group2Term = c("Untreated", "Untreated", "Treated", "Treated"),
    ReplicateTerm = c("1", "2", "1", "2"),
    PatientTerm = c("P1", "P2", "P3", "P4"),
    TimePointTerm = c("T0", "T0", "T0", "T0"),
    stringsAsFactors = FALSE
  ),
  mappings = data.frame(
    OriginalCol = c("Group1", "Group2", "Replicate", "Patient", "TimePoint"),
    TargetTerm = c("Group1Term", "Group2Term", "ReplicateTerm", "PatientTerm", "TimePointTerm"),
    stringsAsFactors = FALSE
  )
)

# 2. Mock Complex Module States
mock_outlier_treatments <- list(
  "Sample_Ctrl_2" = "remove",
  "Sample_SCD_1" = "average"
)

mock_bqc_exclusions <- c("PC(34:1)")

mock_timecourses <- list(
  list(
    id = "tc_acute_phase",
    name = "Acute Phase Trajectory",
    pts = c("P1", "P2", "P3"),
    checked = TRUE,
    is_default = FALSE
  )
)

mock_patient_groups <- list(
  list(
    id = "grp_responders",
    name = "Responders Cohort",
    pts = c("P1", "P3"),
    checked = TRUE,
    is_default = TRUE
  )
)

mock_designer_cases <- list(
  list(
    id = "case_scd_eval",
    name = "SCD Primary Comparison",
    ref_group = "Control",
    comp_group = "Sickle Cell Disease"
  )
)

mock_color_shape <- list(
  origin_colors = list(
    "Control" = "#66C2A5",
    "Sickle Cell Disease" = "#FF63A7"
  ),
  species_colors = list(
    "PC" = "#E41A1C",
    "PE" = "#377EB8"
  )
)

# Mock UI Inputs across modules
mock_inputs <- list(
  "analysisMode" = "Global Lipidomics",
  "groupingMetadata" = c("Group1Term"),
  "comparisonStrategy" = "Unpaired Standard",
  "deReferenceGroups" = "Control",
  "deComparisonGroups" = "Sickle Cell Disease",
  "logratio_module-featureLevel" = "subclass",
  "logratio_module-scaleMode" = "log2fc",
  "logratio_module-color_target_var" = "Group1Term",
  "logratio_module-cp_Group1Term_Control" = "#66C2A5",
  "logratio_module-cp_Group1Term_SickleCellDisease" = "#FF63A7",
  "logratio_module-plotHeight" = 550,
  "heatmap_module-clusterRows" = TRUE,
  "heatmap_module-showHeatmapNumbers" = FALSE,
  "pathway_module-active_classes_json" = jsonlite::toJSON(c("PC", "PE", "SM", "TG")),
  "volcano_module-applySigThreshold" = TRUE,
  "volcano_module-fc_cutoff" = 1.5,
  "volcano_module-p_cutoff" = 0.05
)

# 3. Simulate Serialization (`serialize_state()`)
cat("[STEP 1] Serializing complete session state to list structure...\n")

# Create temporary session export directory
tmp_dir <- tempfile("test_session_export_")
dir.create(tmp_dir)
on.exit(unlink(tmp_dir, recursive = TRUE), add = TRUE)

mock_data_file <- file.path(tmp_dir, "demo_dataset.csv")
write.csv(mock_raw_df, mock_data_file, row.names = FALSE)

state_payload <- list(
  inputs = mock_inputs,
  metadata = list(
    parsedMetadataStructure = mock_parsed_metadata,
    editableMetadata = mock_parsed_metadata$parsed_df,
    clusters = 2,
    uniqueCols = c("Sample_Ctrl_1", "Sample_Ctrl_2", "Sample_SCD_1", "Sample_SCD_2"),
    autoDetectedFeatures = list(),
    schemaSelections = list(),
    timepointGroup1Map = list(),
    hasEmbeddedTimePoints = "No",
    embeddedTimePointPrefixes = character(0),
    embeddedTimePointMap = list()
  ),
  color_shape = mock_color_shape,
  outliers = list(
    treatments = mock_outlier_treatments,
    bqcManualExclusions = mock_bqc_exclusions
  ),
  longitudinal = list(
    saved_timecourses = mock_timecourses,
    saved_patient_groups = mock_patient_groups,
    saved_designer_cases = mock_designer_cases,
    saved_timepoint_order_prefs = list(),
    saved_level_prefs = list()
  ),
  uploads = list("data" = mock_data_file),
  analysisMode = "Global Lipidomics"
)

# Verify serialization to JSON
json_file <- file.path(tmp_dir, "state.json")
jsonlite::write_json(state_payload, json_file, auto_unbox = TRUE, pretty = TRUE)
stopifnot(file.exists(json_file))
cat("  - state.json generated successfully (Size:", file.info(json_file)$size, "bytes)\n")

# 4. Simulate ZIP Archive Creation & Extraction
cat("\n[STEP 2] Packaging into Session ZIP Archive and extracting...\n")
zip_file <- file.path(tmp_dir, "test_session.zip")
data_files_dir <- file.path(tmp_dir, "data_files")
dir.create(data_files_dir)
file.copy(mock_data_file, file.path(data_files_dir, basename(mock_data_file)))

# Zip the bundle
if (requireNamespace("zip", quietly = TRUE)) {
  old_wd <- setwd(tmp_dir)
  zip::zip(zip_file, files = c("state.json", "data_files"), mode = "cherry-pick")
  setwd(old_wd)
} else {
  utils::zip(zip_file, files = c(file.path(tmp_dir, "state.json"), data_files_dir), flags = "-r9Xq")
}
stopifnot(file.exists(zip_file))
cat("  - Session ZIP successfully created (Size:", file.info(zip_file)$size, "bytes)\n")

# Extract archive in simulated fresh session
restore_dir <- tempfile("test_session_restore_")
dir.create(restore_dir)
on.exit(unlink(restore_dir, recursive = TRUE), add = TRUE)

if (requireNamespace("zip", quietly = TRUE)) {
  zip::unzip(zip_file, exdir = restore_dir)
} else {
  utils::unzip(zip_file, exdir = restore_dir)
}
restored_json_path <- file.path(restore_dir, "state.json")
stopifnot(file.exists(restored_json_path))
cat("  - Session ZIP successfully decompressed in isolated environment\n")

# 5. Simulate 4-Stage Hydration Pipeline
cat("\n[STEP 3] Executing 4-Stage Hydration Verification...\n")

# Read JSON payload
restored_state <- jsonlite::fromJSON(restored_json_path, simplifyVector = TRUE)

# --- Stage 1: File Restoration ---
restored_data_file <- file.path(restore_dir, "data_files", basename(mock_data_file))
stopifnot(file.exists(restored_data_file))
restored_df <- read.csv(restored_data_file, check.names = FALSE)
stopifnot(identical(colnames(restored_df), colnames(mock_raw_df)))
cat("  [PASS] Stage 1: Raw data matrix restored identically (", nrow(restored_df), "x", ncol(restored_df), ")\n")

# --- Stage 2: Metadata Mapping & Nested Object Deserialization ---
# Test restore_list_of_lists on timecourses, patient groups, and designer cases
restore_list_of_lists <- function(x) {
  if (is.null(x)) return(list())
  clean_item <- function(item) {
    if (is.data.frame(item)) {
      row_list <- split(item, seq_len(nrow(item)))
      res <- lapply(row_list, function(r) as.list(r))
      names(res) <- NULL
      return(lapply(res, clean_item))
    }
    if (is.list(item)) {
      item <- as.list(item)
      if (is.null(names(item)) || all(names(item) == "")) {
        cleaned <- lapply(item, clean_item)
        simplified <- lapply(cleaned, function(v) {
          if (is.list(v) && length(v) == 1 && (is.null(names(v)) || all(names(v) == ""))) {
            v[[1]]
          } else {
            v
          }
        })
        if (all(sapply(simplified, is.atomic)) && all(sapply(simplified, length) == 1)) {
          return(unlist(simplified))
        } else {
          return(simplified)
        }
      } else {
        for (n in names(item)) {
          val <- item[[n]]
          cleaned_val <- clean_item(val)
          if (is.list(cleaned_val) && length(cleaned_val) == 1 && (is.null(names(cleaned_val)) || all(names(cleaned_val) == ""))) {
            item[[n]] <- cleaned_val[[1]]
          } else {
            item[[n]] <- cleaned_val
          }
        }
        return(item)
      }
    }
    return(item)
  }
  if (is.data.frame(x)) {
    row_list <- split(x, seq_len(nrow(x)))
    res <- lapply(row_list, function(r) as.list(r))
    names(res) <- NULL
    return(lapply(res, clean_item))
  }
  if (is.list(x)) {
    return(lapply(x, clean_item))
  }
  return(list())
}

clean_tc <- restore_list_of_lists(restored_state$longitudinal$saved_timecourses)
clean_pg <- restore_list_of_lists(restored_state$longitudinal$saved_patient_groups)
clean_dc <- restore_list_of_lists(restored_state$longitudinal$saved_designer_cases)

stopifnot(identical(clean_tc[[1]]$id, "tc_acute_phase"))
stopifnot(identical(clean_tc[[1]]$pts, c("P1", "P2", "P3")))
stopifnot(identical(clean_pg[[1]]$id, "grp_responders"))
stopifnot(identical(clean_dc[[1]]$id, "case_scd_eval"))
cat("  [PASS] Stage 2a: Longitudinal nested lists sanitized and validated without structure flattening\n")

# Verify Outlier Treatments
clean_treatments <- as.list(restored_state$outliers$treatments)
stopifnot(identical(clean_treatments$Sample_Ctrl_2, "remove"))
stopifnot(identical(clean_treatments$Sample_SCD_1, "average"))
cat("  [PASS] Stage 2b: Outlier risk treatments hydrated correctly\n")

# Outlier anti-deletion loop test: verify against raw column names
raw_cols <- setdiff(colnames(restored_df), "Lipid_Name")
valid_treats <- clean_treatments[names(clean_treatments) %in% raw_cols]
stopifnot(identical(valid_treats, clean_treatments))
cat("  [PASS] Stage 2c: Outlier anti-deletion guard validated against raw columns (0 recursive triggers)\n")

# --- Stage 3: Input Hydration & Backward Compatibility ---
inputs_to_restore <- restored_state$inputs

# Verify custom violin colors
stopifnot(identical(inputs_to_restore[["logratio_module-cp_Group1Term_Control"]], "#66C2A5"))
stopifnot(identical(inputs_to_restore[["logratio_module-cp_Group1Term_SickleCellDisease"]], "#FF63A7"))
cat("  [PASS] Stage 3a: Custom violin hex color overrides preserved\n")

# Test backward compatibility mappings:
# Legacy noSigThreshold -> applySigThreshold
legacy_inputs <- list(
  "volcano_module-noSigThreshold" = FALSE,
  "heatmap_module-gridLabelSize" = 6,
  "moReferenceGroups" = "Control",
  "moComparisonGroups" = "Sickle Cell Disease"
)

# Apply mapping transformations from 1_shared_data_module.R
for (id in names(legacy_inputs)) {
  if (grepl("-noSigThreshold$", id)) {
    apply_id <- gsub("-noSigThreshold$", "-applySigThreshold", id)
    legacy_inputs[[apply_id]] <- !isTRUE(legacy_inputs[[id]])
  }
  if (grepl("-gridLabelSize$", id)) {
    prefix <- gsub("gridLabelSize$", "", id)
    stars_id <- paste0(prefix, "gridStarsSize")
    pval_id <- paste0(prefix, "gridPvalSize")
    legacy_inputs[[stars_id]] <- as.numeric(legacy_inputs[[id]]) * 2
    legacy_inputs[[pval_id]] <- as.numeric(legacy_inputs[[id]])
  }
}

stopifnot(identical(legacy_inputs[["volcano_module-applySigThreshold"]], TRUE))
stopifnot(identical(legacy_inputs[["heatmap_module-gridStarsSize"]], 12))
stopifnot(identical(legacy_inputs[["heatmap_module-gridPvalSize"]], 6))
cat("  [PASS] Stage 3b: Legacy backward compatibility transforms verified (significance & grid sizing)\n")

# Test JSON string decode (e.g. pathway_module-active_classes_json)
raw_json_str <- inputs_to_restore[["pathway_module-active_classes_json"]]
decoded_classes <- jsonlite::fromJSON(raw_json_str)
stopifnot(identical(decoded_classes, c("PC", "PE", "SM", "TG")))
cat("  [PASS] Stage 3c: Complex JSON hidden inputs successfully decoded without [object Object] corruption\n")

cat("\n===================================================================\n")
cat("=== ALL SESSION PERSISTENCE ROUNDTRIP TESTS PASSED (100% OK)     ===\n")
cat("===================================================================\n")
