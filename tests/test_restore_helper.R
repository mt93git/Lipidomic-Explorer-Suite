# test_restore_helper.R

# Original implementation
restore_list_of_lists_orig <- function(x) {
  if (is.null(x)) return(list())
  
  clean_item <- function(item) {
    if (is.list(item)) {
      item <- as.list(item)
      for (n in names(item)) {
        val <- item[[n]]
        if (is.list(val)) {
          if (length(val) == 1 && (is.null(names(val)) || all(names(val) == ""))) {
            item[[n]] <- clean_item(val[[1]])
          } else if (length(val) > 1 && (is.null(names(val)) || all(names(val) == ""))) {
            simplified <- lapply(val, function(v) {
              if (is.list(v) && length(v) == 1 && (is.null(names(v)) || all(names(v) == ""))) {
                clean_item(v[[1]])
              } else {
                clean_item(v)
              }
            })
            if (all(sapply(simplified, is.atomic)) && all(sapply(simplified, length) == 1)) {
              item[[n]] <- unlist(simplified)
            } else {
              item[[n]] <- simplified
            }
          } else {
            item[[n]] <- clean_item(val)
          }
        }
      }
    }
    item
  }

  if (is.data.frame(x)) {
    row_list <- split(x, seq_len(nrow(x)))
    res <- lapply(row_list, clean_item)
    names(res) <- NULL
    return(res)
  }
  if (is.list(x)) {
    res <- lapply(x, clean_item)
    names(res) <- NULL
    return(res)
  }
  return(list())
}

# Proposed new implementation
restore_list_of_lists_new <- function(x) {
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
        # Unnamed list
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
        # Named list
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

# Test cases
# 1. Unnamed list of named lists (representing json read of array of objects)
test_list <- list(
  list(id = "group1", name = "Group 1", pts = list(c("P1", "P2")), checked = list(TRUE), is_default = list(FALSE)),
  list(id = "group2", name = "Group 2", pts = list(c("P3")), checked = list(FALSE), is_default = list(TRUE))
)

cat("--- Test Case 1 (List of lists) ---\n")
res_orig <- restore_list_of_lists_orig(test_list)
res_new <- restore_list_of_lists_new(test_list)

cat("Original structure:\n")
print(str(res_orig))
cat("\nNew structure:\n")
print(str(res_new))

# 2. Data frame representation (when simplifyVector = TRUE converts it)
test_df <- data.frame(
  id = c("group1", "group2"),
  name = c("Group 1", "Group 2"),
  checked = c(TRUE, FALSE),
  is_default = c(FALSE, TRUE),
  stringsAsFactors = FALSE
)
test_df$pts <- list(c("P1", "P2"), c("P3"))

cat("\n--- Test Case 2 (Data frame with list-column) ---\n")
res_df_orig <- restore_list_of_lists_orig(test_df)
res_df_new <- restore_list_of_lists_new(test_df)

cat("Original structure (DF):\n")
print(str(res_df_orig))
cat("\nNew structure (DF):\n")
print(str(res_df_new))

# Verification assertions
stopifnot(identical(res_new[[1]]$pts, c("P1", "P2")))
stopifnot(identical(res_new[[1]]$checked, TRUE))
stopifnot(identical(res_df_new[[1]]$pts, c("P1", "P2")))
stopifnot(identical(res_df_new[[1]]$checked, TRUE))
cat("\n=== ALL HELPER TESTS PASSED ===\n")
