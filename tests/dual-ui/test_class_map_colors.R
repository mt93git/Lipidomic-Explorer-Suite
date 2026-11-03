# Default class colours (production f257eeb): every lipid class has its own default colour,
# and the copy of CLASS_MAP_COLORS in R/global.R stays identical to R/utils_colors.R.
source("R/utils_colors.R")
stopifnot(!anyDuplicated(toupper(CLASS_MAP_COLORS)), !anyDuplicated(toupper(HYPERCLASS_MAP_COLORS)),
          CLASS_MAP_COLORS[["SP_SM"]] == "#9C755F", CLASS_MAP_COLORS[["SP_Cer"]] == "#EDC948",
          CLASS_MAP_COLORS[["GP_PA"]] == "#C09E00", CLASS_MAP_COLORS[["GP_PE_E"]] == "#744D35")
global_defs <- Filter(function(e) is.call(e) && identical(e[[1]], as.name("<-")) && identical(e[[2]], as.name("CLASS_MAP_COLORS")),
                      as.list(parse("R/global.R", keep.source = FALSE)))
stopifnot(length(global_defs) == 1L, identical(eval(global_defs[[1]][[3]], baseenv()), CLASS_MAP_COLORS))
cat("PASS: default class colours are unique and identical in R/global.R and R/utils_colors.R\n")
