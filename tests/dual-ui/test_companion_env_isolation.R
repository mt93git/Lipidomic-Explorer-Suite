source('R/frontends/team/companion_ai_provider.R')
vars <- c('OPENAI_API_KEY','COMPANION_AI_MODEL','LIPIDOMIC_COMPANION_AI','LIPIDOMIC_INTERFACE','LIPIDOMIC_HOSTED','BLOCK_B_FAKE_FLAG')
old <- Sys.getenv(vars,unset=NA_character_)
local({
 on.exit({Sys.unsetenv(vars);present<-!is.na(old);if(any(present))do.call(Sys.setenv,as.list(old[present]))})
 Sys.setenv(LIPIDOMIC_INTERFACE='team',LIPIDOMIC_HOSTED='1')
 Sys.unsetenv('BLOCK_B_FAKE_FLAG')
 f <- tempfile();on.exit(unlink(f),add=TRUE)
 writeLines(c('OPENAI_API_KEY=synthetic-test-key','COMPANION_AI_MODEL=synthetic-model',
  'LIPIDOMIC_COMPANION_AI=0','LIPIDOMIC_INTERFACE=classic','LIPIDOMIC_HOSTED=0','BLOCK_B_FAKE_FLAG=unexpected'),f)
 companion_read_env(f)
 stopifnot(Sys.getenv('OPENAI_API_KEY')=='synthetic-test-key',Sys.getenv('COMPANION_AI_MODEL')=='synthetic-model',
  Sys.getenv('LIPIDOMIC_INTERFACE')=='team',Sys.getenv('LIPIDOMIC_HOSTED')=='1',Sys.getenv('BLOCK_B_FAKE_FLAG',unset='')=='')
})
cat('PASS companion env loads only allowlisted AI settings; runtime selection and hosting remain fixed\n')
