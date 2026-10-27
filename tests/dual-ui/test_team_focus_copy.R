# Navigation links only focus controls; they must not promise to execute them.
source_text <- paste(readLines('R/guided_workflow.R',warn=FALSE),collapse='\n')
js_text <- paste(readLines('www/team/js/guided.js',warn=FALSE),collapse='\n')
hub_text <- paste(readLines('R/modules/1_shared_data_module.R',warn=FALSE),collapse='\n')
stopifnot(!grepl("guide_focus_link\\('Update prepared data'",source_text),
          !grepl("guide_focus_link\\('Prepare data to continue'",source_text))
focus_calls <- regmatches(source_text,gregexpr("guide_focus_link\\('[^']+','data_hub-runAnalysis'\\)",source_text,perl=TRUE))[[1]]
stopifnot(length(focus_calls)==2L,
          any(grepl("guide_focus_link('Go to Prepare data button'",focus_calls,fixed=TRUE)),
          any(grepl("guide_focus_link('Go to Update prepared data button'",focus_calls,fixed=TRUE)),
          grepl("send('guide_focus_request',this.dataset.guideFocus)",js_text,fixed=TRUE),
          !grepl("send('data_hub-runAnalysis'",js_text,fixed=TRUE))
stopifnot(grepl('if (preparation_policy == "team") " Update prepared data" else " Re-run Pipeline"',hub_text,fixed=TRUE),
          grepl('if (preparation_policy == "team") " Prepare data" else " Run Analysis"',hub_text,fixed=TRUE),
          grepl('Click Update prepared data to apply the decision',source_text,fixed=TRUE),
          grepl('then click Update prepared data in the preparation controls',source_text,fixed=TRUE))
cat('PASS: Team focus links and live run button use matching preparation labels\n')
