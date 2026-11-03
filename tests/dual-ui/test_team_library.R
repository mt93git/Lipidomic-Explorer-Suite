# Ported from production tests/dual-ui/test_team_library.R.
# Persistence boundary regression: no credentials in exported/restored UI state.
# In this layout the Team credential filter is the "persistent_inputs" hook.
source('R/hooks.R')
invisible(lapply(sort(list.files('R/frontends/team/hooks', pattern='[.]R$', full.names=TRUE)), source))
eval(parse('R/modules/1_shared_data_module.R')[[1]])
x <- session_persistent_inputs(list(team_library_password='secret',team_library_email='email',team_library_checkpoint='id',imputationSeed=42,normalization='median'))
stopifnot(identical(names(x),c('imputationSeed','normalization')), identical(x$imputationSeed,42))
source('R/frontends/team/project_library.R')
Sys.setenv(LIPIDOMIC_PROJECT_LIBRARY='0');stopifnot(!team_library_enabled())
Sys.setenv(LIPIDOMIC_PROJECT_LIBRARY='1');stopifnot(team_library_enabled())
files <- c('R/frontends/team/project_library.R', list.files('R/frontends/team/storage', pattern='[.]R$', full.names=TRUE))
text <- paste(unlist(lapply(files, readLines)),collapse='\n')
library_text <- paste(readLines('R/frontends/team/project_library.R'),collapse='\n')
stopifnot(!grepl('SERVICE_KEY|JWT_SECRET|service_role',text),grepl('session\\$reload',library_text),grepl('Checkpoint integrity check failed',text))
# Tokens stay in the session: no global assignment of account state.
stopifnot(!grepl('<<-\\s*(account|token|access)', library_text, perl=TRUE))
cat('PASS: library defaults off, credentials excluded, user-token-only adapter and session clearing present\n')
