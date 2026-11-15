# Second-level render cache on disk, keyed by content (speed proposal, option 2). The
# in-memory cache is per session and epoch; this one survives a reopen, an API restart or
# a second user of the same checkpoint. A key holds everything that feeds a card's plot:
# the code commit, the checkpoint's sha256, the card's source and the inputs set on it
# explicitly (saved or changed; the rest are Team's deterministic defaults for that
# checkpoint), the shared analysis settings changed in this session, the targeted cohort,
# the study design, the size and the format. Values are Team's own output, stored outside
# the checkpoint. ggrepel labels are placed with seed = NA, as in Team, so a stored PNG may
# place labels differently from a fresh render: no byte-identity is claimed.
# LIPIDOMIC_API_RENDER_DISK_CACHE=0 turns it off.
api_render_disk_state <- new.env(parent = emptyenv())

api_render_disk_dir <- function() {
  if (identical(Sys.getenv("LIPIDOMIC_API_RENDER_DISK_CACHE", "1"), "0") || is.na(api_commit)) return(NULL)
  base <- Sys.getenv("LIPIDOMIC_API_RENDER_CACHE_DIR", "")
  if (!nzchar(base)) {
    root <- Sys.getenv("LIPIDOMIC_STORAGE_DIR", Sys.getenv("LIPIDOMIC_API_CHECKPOINT_DIR"))
    if (!nzchar(root)) return(NULL)
    base <- file.path(root, "render-cache")
  }
  dir <- file.path(base, substr(api_commit, 1L, 12L))
  if (!identical(api_render_disk_state$dir, dir)) {
    dir.create(dir, recursive = TRUE, showWarnings = FALSE)
    # Entries of other code commits can never hit again: drop them (Posit: clear on update).
    old <- setdiff(list.dirs(base, recursive = FALSE, full.names = TRUE), dir)
    unlink(old[grepl("^[0-9a-f]{12}$", basename(old))], recursive = TRUE)
    api_render_disk_state$dir <- dir; api_render_disk_state$puts <- 0L
  }
  if (dir.exists(dir)) dir else NULL
}
api_render_disk_limit <- function() as.numeric(Sys.getenv("LIPIDOMIC_API_RENDER_DISK_MB", "1024")) * 2^20

api_sorted <- function(x) {
  if (!is.list(x)) return(x)
  if (!is.null(names(x))) x <- x[order(names(x))]
  lapply(x, api_sorted)
}
# What feeds a card's plot, known without creating the card. NULL: not cacheable on disk.
api_card_descriptor <- function(s, instanceId) {
  if (!is.character(instanceId) || length(instanceId) != 1L) return(NULL)
  if (!is.null(s$acted) && isTRUE(s$acted[[instanceId]])) return(NULL)
  # A card whose module buttons Nexo replays on restore (cards.R api_card_member_actions): not keyed by inputs alone.
  if (length(api_card_member_actions(s, instanceId))) return(NULL)
  if (exists(instanceId, envir = s$cards, inherits = FALSE)) {
    card <- s$cards[[instanceId]]
    explicit <- if (!is.null(s$explicit)) s$explicit[[instanceId]] else NULL
    if (is.null(explicit)) return(NULL)
    return(list(source = card$source, render = card$render, fixed = isTRUE(card$fixed), explicit = explicit))
  }
  saved <- api_card_saved(s, instanceId)
  if (is.null(saved)) return(NULL)
  entry <- tryCatch(api_catalog_entry(saved$source), error = function(e) NULL)
  if (is.null(entry)) return(NULL)
  list(source = saved$source, render = entry$render, fixed = isTRUE(saved$fixed),
    explicit = api_saved_inputs_accepted(saved$source, saved$inputs))
}
api_render_disk_key <- function(s, descriptor, width, height, format) {
  if (is.null(descriptor) || identical(descriptor$render, "html") || is.null(s$sha256)) return(NULL)
  cohort <- api_read(s, if (isTRUE(s$shared$targeted_mode_active())) sort(as.character(s$shared$targeted_lipids_list())) else character())
  design <- api_design_state(s)
  content <- list(v = 1L, commit = api_commit, checkpoint = s$sha256, source = descriptor$source,
    fixed = descriptor$fixed, explicit = api_sorted(descriptor$explicit), analysis = api_sorted(s$analysis_explicit %||% list()),
    cohort = I(cohort), design = api_sorted(design), width = width, height = height, format = format,
    # Pilot F1: the session palette (palette.R) colours every group-coloured card.
    palette = api_palette_key(s))
  digest::digest(api_canonical_json(content), algo = "sha256", serialize = FALSE)
}
api_render_disk_get <- function(key) {
  dir <- api_render_disk_dir()
  if (is.null(key) || is.null(dir)) return(NULL)
  path <- file.path(dir, paste0(key, ".rds"))
  if (!file.exists(path)) return(NULL)
  value <- tryCatch(readRDS(path), error = function(e) { unlink(path); NULL })
  if (!is.null(value)) Sys.setFileTime(path, Sys.time())
  value
}
api_render_disk_put <- function(key, value) {
  dir <- api_render_disk_dir()
  if (is.null(key) || is.null(dir)) return(invisible(FALSE))
  path <- file.path(dir, paste0(key, ".rds")); tmp <- paste0(path, ".", Sys.getpid(), ".tmp")
  ok <- tryCatch({ saveRDS(value, tmp); file.rename(tmp, path) }, error = function(e) FALSE)
  if (!isTRUE(ok)) { unlink(tmp); return(invisible(FALSE)) }
  api_render_disk_state$puts <- (api_render_disk_state$puts %||% 0L) + 1L
  if (api_render_disk_state$puts %% 20L == 1L) api_render_disk_prune(dir)
  invisible(TRUE)
}
# Least recently used first (reads touch the file time), down to 90 % of the limit.
api_render_disk_prune <- function(dir, limit = api_render_disk_limit()) {
  info <- file.info(list.files(dir, pattern = "\\.rds$", full.names = TRUE))
  total <- sum(info$size, na.rm = TRUE)
  if (total <= limit) return(invisible(0L))
  info <- info[order(info$mtime), , drop = FALSE]
  drop <- which(cumsum(info$size) >= total - 0.9 * limit)[1L]
  unlink(rownames(info)[seq_len(drop)])
  invisible(drop)
}
