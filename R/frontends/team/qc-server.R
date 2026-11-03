# Evaluated in the shared QC module scope; no second preparation or PCA engine.
    # Guided QC uses the same treatment state as the advanced outlier manager.
    guided_selected <- reactiveVal(NULL)
    guided_proposal <- reactiveVal(NULL)
    observeEvent(shared_data$dataset_revision(), {
      guided_selected(NULL)
      guided_proposal(NULL)
      guided_decisions(guided_decisions()[0, , drop=FALSE])
    }, ignoreInit=TRUE)
    guided_applied_ready <- reactive({
      state <- shared_data$preparation_state()
      is.list(state) && isTRUE(state$data_available) && !is.null(state$applied) &&
        !is.null(shared_data$data_processed())
    })
    guided_scores <- reactive({
      validate(need(guided_applied_ready(), "Prepare data to see the sample quality plot."))
      result <- shared_data$pca_results()
      validate(need(!is.null(result), "Prepare data to see the sample quality plot."))
      scores <- result$replicate_score_df
      validate(need(!is.null(scores) && all(c("FullName", "PC1", "PC2") %in% names(scores)),
                    "PCA needs at least two usable components. Review the preparation and samples."))
      matrix <- shared_data$data_processed(); raw <- shared_data$rawData()$data
      scores <- scores[is.finite(scores$PC1) & is.finite(scores$PC2) & scores$FullName %in% names(matrix)[-1] & scores$FullName %in% names(raw)[-1] & !scores$FullName %in% shared_data$synthetic_sample_ids(), , drop=FALSE]
      validate(need(nrow(scores)>0, "No sample scores are available for this preparation."))
      scores
    })
    output$guided_qc_status <- renderUI({
      if (!guided_applied_ready()) return(p("Prepare data to view the sample quality plot."))
      if (isTRUE(shared_data$preparation_dirty())) return(p(class="guide-pending", "Changes are pending. This plot shows the previous prepared run; update prepared data to apply them."))
      tagList(p("PCA summarizes variation in the prepared data. Click a point to inspect it; investigate technical and biological context before excluding a sample."),
              if (isTRUE(shared_data$pca_results()$fallback_used)) p(class="guide-pending", "The selected lipid scope could not support PCA; this plot uses the full prepared matrix."))
    })
    output$guided_qc_plot <- plotly::renderPlotly({
      # A restored session requires a fresh explicit preparation. Return a real
      # empty plot so Plotly removes points from the preceding dataset.
      if (!guided_applied_ready()) return(plotly::plot_ly(
        x = numeric(), y = numeric(), type = "scatter", mode = "markers"))
      scores <- guided_scores()
      scores$Hover <- vapply(scores$FullName, rd_sample_hover, character(1), meta=shared_data$all_metadata())
      plotly::plot_ly(scores, x=~PC1, y=~PC2, customdata=~FullName, text=~Hover,
        source=session$ns("guided_qc_points"), type="scatter", mode="markers",
        marker=list(size=11, color="#176b73"), hovertemplate="%{text}<br>PC1 %{x:.2f}<br>PC2 %{y:.2f}<extra></extra>") |>
        plotly::layout(xaxis=list(title="PC1"), yaxis=list(title="PC2"), hoverlabel=list(bgcolor="#ffffff", bordercolor="#d6e0e2", font=list(color="#253b47")), margin=list(l=55,r=15,t=15,b=55)) |>
        plotly::event_register("plotly_click") |>
        plotly::config(displaylogo=FALSE, responsive=TRUE)
    })
    observeEvent(lipidomic_plotly_event("plotly_click", source=session$ns("guided_qc_points")), {
      click <- lipidomic_plotly_event("plotly_click", source=session$ns("guided_qc_points"))
      id <- as.character(click$customdata)[1]
      matrix <- shared_data$data_processed()
      raw <- shared_data$rawData()$data
      if (length(id) && !is.na(id) && id %in% guided_scores()$FullName && id %in% names(matrix)[-1] && id %in% names(raw)[-1]) guided_selected(id)
    })
    output$guided_qc_selection <- renderUI({
      id <- guided_selected(); if (is.null(id)) return(p("Select a sample point to review it."))
      div(class="guide-next-task", strong("Selected sample: ", id), rd_sample_card(id,shared_data$all_metadata()),
          p("A point's position alone does not prove it is an outlier. Record the evidence for your decision."),
          textAreaInput(session$ns("guided_qc_reason"), "Reason for exclusion", placeholder="For example, documented instrument failure"),
          actionButton(session$ns("guided_qc_propose"), "Review exclusion", class="btn-outline-danger"))
    })
    observeEvent(input$guided_qc_propose, {
      id <- guided_selected(); reason <- trimws(input$guided_qc_reason %||% "")
      req(id)
      if (!nzchar(reason)) { showNotification("Enter a reason before reviewing the exclusion.",type="warning"); return() }
      if (isTRUE(shared_data$preparation_dirty()) || !id %in% guided_scores()$FullName) {
        showNotification("Update prepared data and select the sample again before excluding it.",type="warning"); return()
      }
      matrix <- shared_data$data_processed()
      raw <- shared_data$rawData()$data
      if (!id %in% names(matrix)[-1] || !id %in% names(raw)[-1]) { showNotification("Only original sample measurements can be excluded here.",type="warning"); return() }
      guided_proposal(list(sample=id, reason=reason, matrix=matrix, revision=shared_data$dataset_revision()))
      metadata <- shared_data$all_metadata(); row <- metadata[metadata$FullName == id, , drop=FALSE]
      group_fields <- intersect(c("Group1","Group2","TimePoint"),names(metadata))
      peers <- if (nrow(row)==1L && length(group_fields)) Reduce(`&`, lapply(group_fields, function(k) as.character(metadata[[k]]) == as.character(row[[k]][1]))) else rep(TRUE,nrow(metadata))
      remaining <- sum(metadata$FullName[peers] %in% setdiff(names(matrix)[-1],id),na.rm=TRUE)
      showModal(modalDialog(title="Confirm sample exclusion", p(strong("Sample: ",id)), p(strong("Reason: ",reason)),
        p(sprintf("%d other prepared sample(s) remain in this metadata group.",remaining)),
        if(remaining < 2L) p(class="guide-pending", "Fewer than two samples would remain in this group; group comparisons may not be supported."),
        p("This schedules removal for the next preparation. The source data is preserved; the current results remain the previous run until you update prepared data."),
        footer=tagList(actionButton(session$ns("guided_qc_cancel"),"Cancel"), actionButton(session$ns("guided_qc_confirm"),"Confirm exclusion",class="btn-danger"))))
    })
    observeEvent(input$guided_qc_cancel, { guided_proposal(NULL); removeModal() })
    observeEvent(input$guided_qc_confirm, {
      proposal <- guided_proposal()
      valid <- qc_proposal_valid(proposal, shared_data$data_processed(), shared_data$dataset_revision(),
                                 shared_data$preparation_dirty(), guided_scores())
      if (!valid) { guided_proposal(NULL); removeModal(); showNotification("The prepared data changed. Select the sample and review the exclusion again.",type="warning"); return() }
      id <- proposal$sample; reason <- proposal$reason
      guided_proposal(NULL)
      treats <- outlierTreatments(); treats[[id]] <- "remove"; outlierTreatments(treats); tempOutlierTreatments(treats)
      guided_decisions(rbind(guided_decisions(), data.frame(time=format(Sys.time(),tz="UTC",usetz=TRUE),sample=id,action="Exclude",reason=reason,pca_settings=paste(capture.output(str(shared_data$pca_settings())),collapse=" "))))
      outlierChangesTrigger(isolate(outlierChangesTrigger())+1L); guided_selected(NULL); removeModal()
      showNotification("Exclusion scheduled. Update prepared data to apply it.",type="warning",duration=10)
    })
    output$guided_qc_decisions <- renderUI({
      decisions <- guided_decisions(); if (!nrow(decisions)) return(NULL)
      treats <- outlierTreatments(); active <- unique(decisions$sample[vapply(decisions$sample, function(id) identical(treats[[id]], "remove"), logical(1))])
      div(p("Sample decisions are saved in the session ZIP. Download them with your methods record."),
          lapply(active, function(id) div(strong(id), if (id %in% names(shared_data$data_processed())[-1]) " scheduled for exclusion " else " excluded in the applied run ",
            actionButton(session$ns(paste0("guided_undo_",match(id,unique(decisions$sample)))), "Undo", `data-sample`=id,
              onclick=sprintf("Shiny.setInputValue('%s', %s, {priority:'event'})",session$ns("guided_qc_undo"),jsonlite::toJSON(id,auto_unbox=TRUE))))))
    })
    observeEvent(input$guided_qc_undo, {
      id <- as.character(input$guided_qc_undo); treats <- outlierTreatments()
      if (!identical(treats[[id]],"remove")) return()
      treats[[id]] <- "keep"; outlierTreatments(treats); tempOutlierTreatments(treats)
      guided_decisions(rbind(guided_decisions(),data.frame(time=format(Sys.time(),tz="UTC",usetz=TRUE),sample=id,action="Undo exclusion",reason="User restored sample",pca_settings="Not applicable")))
      outlierChangesTrigger(isolate(outlierChangesTrigger())+1L)
      showNotification("Sample restored for the next preparation. Update prepared data to apply it.",type="message",duration=10)
    })
    output$guided_qc_select_ui <- renderUI({
      scores <- guided_scores()
      selectInput(session$ns("guided_qc_sample"), "Choose a sample (keyboard accessible)",
                  choices=c("Select a sample"="", stats::setNames(scores$FullName,scores$FullName)), selected="", selectize=FALSE)
    })
    observeEvent(input$guided_qc_sample, {
      id <- input$guided_qc_sample
      if (!is.null(id) && nzchar(id) && id %in% guided_scores()$FullName) guided_selected(id)
    }, ignoreInit=TRUE)
    output$guided_qc_plot_csv <- downloadHandler(filename=function() paste0("quality-pca-",Sys.Date(),".csv"), content=function(file) {
      scores <- guided_scores(); metadata <- shared_data$all_metadata();
      idx <- match(scores$FullName,metadata$FullName)
      write_spreadsheet_csv(cbind(scores,metadata[idx,setdiff(names(metadata),names(scores)),drop=FALSE]),file,row.names=FALSE,na="")
    })
    for (fmt in c("png","svg","pdf")) local({
      format <- fmt
      output[[paste0("guided_qc_plot_",format)]] <- downloadHandler(filename=function() paste0("quality-pca-",Sys.Date(),".",format),content=function(file) {
        d <- guided_scores()
        if (format=="png") grDevices::png(file,width=1200,height=900,res=150)
        else if (format=="svg") grDevices::svg(file,width=8,height=6)
        else grDevices::pdf(file,width=8,height=6)
        on.exit(grDevices::dev.off())
        graphics::plot(d$PC1,d$PC2,xlab="PC1",ylab="PC2",pch=19,col="#176b73",main="Sample quality PCA")
      })
    })
    output$guided_qc_download <- downloadHandler(filename=function() paste0("sample-quality-decisions-",Sys.Date(),".csv"),
      content=function(file) write_spreadsheet_csv(guided_decisions(),file,row.names=FALSE,na=""))

    observeEvent(shared_data$restored_outlier_treatments(), {
      if (!is.null(shared_data$restored_qc_decisions())) return()
      treats <- shared_data$restored_outlier_treatments()
      ids <- names(treats)[vapply(treats,function(x) identical(x,"remove"),logical(1))]
      if (length(ids)) guided_decisions(data.frame(time="Not recorded",sample=ids,action="Exclude",reason="Not recorded",pca_settings="Not recorded",stringsAsFactors=FALSE))
    }, ignoreInit=TRUE)
    observeEvent(shared_data$restored_qc_decisions(), {
      saved <- shared_data$restored_qc_decisions()
      if (!is.null(saved)) {
        parsed <- tryCatch(as.data.frame(saved, stringsAsFactors=FALSE),error=function(e) NULL)
        if (!is.null(parsed) && all(c("time","sample","action","reason") %in% names(parsed))) {
          if (!"pca_settings" %in% names(parsed)) parsed$pca_settings <- "Not recorded"
          guided_decisions(parsed[,c("time","sample","action","reason","pca_settings"),drop=FALSE])
        }
      } else {
        treats <- shared_data$restored_outlier_treatments()
        ids <- names(treats)[vapply(treats,function(x) identical(x,"remove"),logical(1))]
        if (length(ids)) guided_decisions(data.frame(time="Not recorded", sample=ids, action="Exclude", reason="Not recorded", pca_settings="Not recorded", stringsAsFactors=FALSE))
      }
    }, ignoreNULL=FALSE, ignoreInit=TRUE)

