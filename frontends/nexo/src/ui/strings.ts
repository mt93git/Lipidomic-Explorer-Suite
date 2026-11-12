/** All new shell copy. Checkpoint labels and the untouched canvas supply their own content. */
export const strings = {
  viewOnlyRole: 'View only — ask the owner for edit access', commentRole: 'You can comment', share: 'Share',
  // Share dialog and role changes (UX review 2, scene 4).
  shareWho: "Lab staff and this client's members can open this project. Roles decide what each person can change.",
  shareWhoLab: 'Lab staff can open this project. Roles decide what each person can change.',
  shareYou: '(you)', shareNotListed: 'Not listed? Add the person as a client member in Admin first.',
  copyLink: 'Copy link', linkCopied: 'Link copied', linkNotCopied: 'Could not copy the link: copy it from the address bar.', done: 'Done',
  fromAdmin: 'from Admin',
  // A lost API session (evicted or restarted) is reopened and the plots are put back.
  reconnecting: 'Reconnecting to the analysis…', reconnected: 'Analysis reconnected. Your plots were restored.',
  sessionLost: 'The analysis session was lost and could not be reopened. Reload the page to continue; your last save is kept.', reloadPage: 'Reload', saveFailedLost: 'Save failed · Session lost',
  // Ordered Team grouping controls.
  orderedHint: 'Drag items or use Alt+Arrow to reorder.', orderedAdd: 'Add grouping', orderedChoose: 'Choose a grouping…', orderedUp: 'Move up', orderedDown: 'Move down', orderedRemove: 'Remove', orderedPosition: 'Position', orderedOf: 'of',
  // Wave 2 library/canvas copy.
  suggestPrincipal: 'Principal components', suggestDistributions: 'Feature distributions', suggestHeatmap: 'Abundance heatmap', suggestedPlots: 'Suggested plots', openLibraryShortcut: 'Open library (L)',
  dragPlotHint: 'Drag a plot onto the canvas, or press Enter to add.', dropPlotHere: 'Drop to add plot', addingPlot: 'Adding…', failAddPlot: 'add the plot',
  plotFamilies: 'Plot families', clearSearch: 'Clear',
  minimapRecenter: 'Recenter canvas with minimap', libraryPlotsShortcut: 'Plot library (L)', libraryIllustrationsShortcut: 'Illustrations (Shift+L)',
  fitHelp: 'Fit all (Shift+1) · Fit selection (Shift+2)',
  // Wave 2 card chrome: these accessible names are shared with the journey suites.
  cardEdit: 'Edit', moreCardActions: 'More card actions', cardTitle: 'Card title',
  // Pilot F1: Team's session palette (the data hub's "Colors & palettes"; its section titles are Team's).
  paletteTitle: 'Colors & palettes', paletteClose: 'Close Colors & palettes', paletteChoose: 'Choose a palette', paletteFineTune: 'Fine-tune colors',
  paletteIntro: 'Group colours for the plots in this session that follow the session palette, as in Team. Choose a palette, then click a group\'s colour to make it your own. Plots with their own colour settings keep them.',
  paletteNoShapes: 'Team\'s palette editor has no shapes: group shapes keep each plot\'s own shape settings.', paletteLoading: 'Loading the session palette…',
  paletteUpdating: 'Applying the session colours…', paletteRedrawing: 'Redrawing the plots that follow the session palette…', paletteFailed: 'apply the session colours',
  paletteFollowsSession: 'Group colours and shapes follow the session palette.', paletteOpen: 'Session palette…', paletteOwnColours: 'This plot uses its own colours (Appearance tab).', notOnLayout: 'not on this layout', designSaved: 'Saved with this design by the author; confirm to enable differential plots.',
  analysisSettings: 'Analysis settings', analysisUpdating: 'Updating all plots…', analysisApplied: 'Analysis settings applied', analysisUndone: 'Analysis settings restored', analysisLoading: 'Loading settings…', analysisDiscard: 'Discard', analysisApply: 'Apply',
  roundedRectangle: 'rounded rectangle', pageGuides: 'Page guides', resetOrder: 'Reset order (tab order)', selectTabPlots: 'Select all in tab', conditionColors: 'Condition colours',
  nexoSolid:'Solid',nexoDotted:'Dotted',nexoDashed:'Dashed',nexoLongDash:'Long dash',nexoDashDot:'Dash dot',nexoLongDashDot:'Long dash dot',
  nexoSeries:'Series style', nexoLegendOrder:'Legend order', nexoReversed:'Reversed', nexoGrouped:'Grouped', nexoGroupedReversed:'Grouped, reversed', nexoDash:'Line dash', nexoReferences:'Reference lines & bands', nexoDataCoordinates:'Positions use data coordinates on the primary axes.', nexoReferenceLine:'Reference line', nexoBand:'Shaded band', nexoReference:'Reference', nexoXStart:'x start', nexoXEnd:'x end', nexoYStart:'y start', nexoYEnd:'y end', nexoColor:'Colour', nexoLineWidth:'Line width', nexoOpacity:'Opacity', nexoRemove:'Remove', nexoAddLine:'Add reference line', nexoAddBand:'Add shaded band', nexoArrows:'Arrow annotations', nexoAnnotation:'Annotation', nexoText:'Text', nexoXCoordinate:'x coordinate', nexoYCoordinate:'y coordinate', nexoArrowX:'Arrow x (px)', nexoArrowY:'Arrow y (px)', nexoFontSize:'Font size', nexoAddArrow:'Add arrow annotation',
  nexoBadge:'Nexo style', nexoTeamView:'Show as Team draws it', nexoAxis:'Axis range & scale', nexoTicks:'Ticks', nexoWeightsMargins:'Weights & margins', nexoAuto:'auto', nexoX:'Horizontal axis', nexoY:'Vertical axis', nexoScale:'Scale', nexoLinear:'Linear', nexoLog:'Log', nexoMin:'Minimum', nexoMax:'Maximum', nexoTickFormat:'Tick format', nexoTickSpacing:'Tick spacing', nexoTickCount:'Tick count', nexoBold:'Bold', nexoNormal:'Normal', nexoMargins:'margins', nexoTitle:'Title weight', nexoAxisTitles:'Axis title weight', nexoLegend:'Legend weight', nexoMargin:'Margin', nexoLeft:'left', nexoRight:'right', nexoTop:'top', nexoBottom:'bottom', nexoPadding:'padding', nexoReset:'Reset Nexo style',
  app: 'Lipidomic Explorer', yourBoard: 'your board', logo: 'Libreros Lab', project: 'Checkpoints', checkpointsTitle: 'Open or save a checkpoint', accountLabel: 'Account', data: 'Data', review: 'Review', canvas: 'Canvas',
  steps: 'Analysis steps', ready: 'Autosave ready', dirty: 'Unsaved changes · Autosave on',
  viewOnly: 'View only', viewOnlyDevice: 'View only on this device. Open Nexo on a computer to edit.',
  viewOnlyLink: 'View only link. Open Nexo without ?mode=view to edit.', dismissViewOnly: 'Dismiss view-only notice',
  saving: 'Saving…', saved: 'Saved ·', readonly: 'View-only access', plots: 'Plots', illustrations: 'Illustrations',
  text: 'Text & shapes', palettes: 'Palettes', palettesNeedPlot: 'Select a plot card to choose its colour palette.', select: 'Select (V)', move: 'Move (H)', inspector: 'Inspector (I)',
  showInspector: 'Show inspector', closeLibrary: 'Hide library', add: '+ Add plot', tidy: 'Tidy up', currentCheckpoint: 'Current', finishShort: 'Finish', arrangeSelected: 'Arrange selected cards', alignLeft: 'Align left edges', alignRight: 'Align right edges', alignTop: 'Align top edges', alignBottom: 'Align bottom edges', distributeX: 'Distribute horizontally', distributeY: 'Distribute vertically', undo: 'Undo', redo: 'Redo',
  undoTool: '↶ Undo', redoTool: '↷ Redo', draft: 'Draft', figure: 'Figure page →', export: 'Export figure ▾',
  pageSvg: 'Figure page · SVG', pagePdf: 'Figure page · PDF', pagePrint: 'Print figure page', more: '⋯', paste: 'Paste plot', fitShortcut: 'Fit all (Shift+1)', resetZoomShortcut: 'Zoom to 100% (Shift+0)', hundred: '100%', pasteEmpty: 'Copy a card’s plot settings first (card ⋯ menu).', failPaste: 'paste the plot', removeAll: 'Remove all',
  help: 'Canvas help', hint: 'Draft: edit live plots. Finish a plot to place it on the figure page.', figureHint: 'Figure page: arrange finished plots, add text and shapes. Go back to Draft to edit plots.',
  tabs: 'Canvas tabs', addTab: 'Add canvas tab', tabActions: 'Tab actions', allTabs: 'All tabs', allTabsIcon: '▾', rename: 'Rename…', duplicate: 'Duplicate tab',
  left: 'Move tab left', right: 'Move tab right', delete: 'Delete tab…', deleteTab: 'Delete tab', moveCards: 'Move the cards to',
  removeCards: 'Remove the cards too', cancel: 'Cancel', confirm: 'Confirm', close: '×', dismiss: 'Dismiss', plus: '+', minus: '−',
  zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit', tools: 'Canvas tools',
  computedGroups: 'Group colours & shapes', computedBqc: 'BQC samples', computedIndices: 'Indices to Plot', computedHint: 'Nexo only: Team\'s canvas shows its default for these.',
  timecourseDesigner: 'Time courses', timecourseEmpty: 'No cohorts yet. Add one below.', timecourseSource: 'Cohorts', timecourseHint: 'Each change runs Generate Analysis, as Team needs after a drag.',
  choose: 'Choose checkpoint', tryAgain: 'Try again', selectAll: 'All', selectDefault: 'Default', selectNone: 'None', rangeFrom: 'From', rangeTo: 'To', retrySave: 'Retry now', reopenSession: 'Reopen', reopenSessionLabel: 'Reopen the analysis session (your unsaved changes are kept)', closeAnalysisSettings: 'Close Analysis settings', autosave: 'Autosave', pickerFolder: 'Prepared in Team', pickerSaved: 'Saved checkpoints', pickerAutosaves: 'Autosaves', pickerFromTeam: 'From Team', pickerFromNexo: 'Saved in Nexo', panelFailed: 'This panel could not be shown. The canvas and your work are unaffected.', loading: 'Loading checkpoints…', opening: 'Opening checkpoint…', empty: 'No checkpoints yet. Upload a ZIP saved from Team.',
  unavailable: 'This action is not available yet.', local: 'Shell changes are local to this session.',
  helpArrange: 'Move and resize', helpArrangeText: 'Drag a card header to move it; drag its corner to resize. Select several cards to align them in Canvas tools. Use Fit to see every card.',
  helpFinish: 'Finish and export', helpFinishText: 'Finish captures a snapshot of the prepared result. Edit figure reconnects it to the current analysis. Use the Figure page to arrange and export finished plots together, or export a selected plot from its Export tab.',
  helpSave: 'Save your work', helpSaveText: 'Autosave keeps your layout, colours and finished snapshots in the current checkpoint. Save a named checkpoint to keep a separate version. Download ZIP keeps a copy you can open in Team or Nexo.',
  recordsNearLimit: 'Records near size limit', recordsNearLimitHelp: 'Nexo keeps saving this board, but its run history is near Team’s size limit, so Team may stop saving it after more runs there — Download ZIP keeps a copy.',
  plotChangedExport: 'Plot changed — export again.',
  studyDesign: 'Study design', enlargePlot: 'Enlarge plot', selectTouch: 'Select', moveTouch: 'Move', inspectorTouch: 'Inspector',
  // NEXO-P5: Team's PCA score analysis heading and note (R/results_dashboard.R rd_pca_score_ui).
  pcaScoreTitle: 'PCA score analysis', pcaScoreHelp: 'Tests whether the sample scores on one principal component differ between groups. The PCA itself is not changed.',
  pcaScorePlotButton: 'Plot on canvas', pcaScorePlotNote: 'Adds the box plot and the group table as a figure on the canvas.', failPcaScore: 'load the PCA score analysis', failPcaScorePlot: 'add the PCA score figure',
  analysisHelp: 'Choose the analysis, then review and confirm before computing. Display settings below update the plot immediately.', discardChanges: 'Discard changes',
  helpText: 'V selects, H moves the view, I toggles the inspector. Scroll to pan; pinch to zoom.',
  pca: 'PCA', violin: 'Violin', dist: 'Distribution', comp: 'Composition', heat: 'Heatmap',
  account: 'Account actions are available in Team.', libraryEmpty: 'This library is not available in the current canvas.',
  tabName: 'Tab name', remove: 'Remove', separator: '·', percent: '%', initialTab: 'Canvas 1', duplicateUnavailable: 'Some cards could not be duplicated.',
  exportIllustrationScope: 'Selected illustration', exportTitle: 'Export', exportPlotScope: 'Selected plot', exportPublicationScope: 'Publication figure', exportPublicationHelp: 'One of Team’s Export studio figures, drawn by R from the analysis, not from the canvas. To export what you arranged, use Figure page · SVG or PDF.', exportNeedsDesign: 'confirm the study design first', publicationExport: 'Publication export…',
  exportSelected: 'Export selected plot…', exportMore: 'More export options…', exportPng: 'Download PNG', exportSvg: 'Download SVG', exportPdf: 'Download PDF', exportCsv: 'Plot data (CSV)', moreDownloads: 'More downloads from this analysis',
  exportBundle: 'Download bundle', exportBusy: 'Preparing bundle…', exportClose: 'Close', exportSelectPlot: 'Select one plot on the canvas to export it.',
  exportHybrid: 'Hybrid engine (raster data, vector text)', exportSvgMissing: 'SVG needs the svglite package on the server.',
  exportSvgRaster: 'This figure is a raster image; SVG is not available.', exportCsvLocked: 'The R script always ships with its CSV.',
  canvasNotReady: 'The canvas is not ready yet.', validationFailed: 'The canvas could not be validated.', downloadCheckpoint: 'Download checkpoint',
  cardLimit: 'A canvas can have up to 40 cards.', unknownSource: 'This plot is not in the library.', moveToTab: 'Move to tab', copyToTab: 'Copy to tab',
  moveToTabMenu: 'Move to tab…', copyToTabMenu: 'Copy to tab…', saveCheckpoint: 'Save checkpoint…', downloadZip: 'Download ZIP', figurePage: 'Figure page',
  backToDraft: '← Draft', checkpoints: 'Checkpoints', newCheckpoint: 'New checkpoint name', saveCurrent: 'Save current analysis', uploadZip: 'Upload ZIP',
  savedCheckpoint: 'Saved checkpoint', open: 'Open', download: 'Download', deleteLabel: 'Delete', deleteCheckpoint: 'Delete checkpoint?',
  library: 'Library', plotLibrary: 'Plot library', illustrationLibrary: 'Scientific illustrations', closeLibraryPanel: 'Close library', libraryContent: 'Library content',
  searchPlots: 'Search plots', searchIllustrations: 'Search illustrations', loadingPlots: 'Loading plots…', confirmDesignFor: 'Confirm study design for', confirmDesignLink: 'Confirm study design…', needsTimePoints: 'needs two or more time points', notForPaired: 'not for a paired design', addLabel: 'Add',
  noPlots: 'No plots match.', noIllustrations: 'No illustrations match. Try a sample, cell or instrument.',
  inspectorLabel: 'Inspector', actionDuplicate: 'Duplicate', morePlotActions: 'More plot actions', backToOverview: 'Back to overview', actionCopyPlot: 'Copy settings', actionCopyToTab: 'Copy to tab…', actionMoveToTab: 'Move to tab…', actionEditIllustration: 'Edit illustration', closeInspector: 'Close inspector', selectToInspect: 'Select a plot or object to see its settings.', inspectorTabs: 'Inspector tabs',
  editFigure: 'Edit figure', finishedFigure: 'Finished figure.', finishPlot: 'Finish plot', figureDetails: 'Figure details', labelHeading: 'Label', tierHeading: 'Tier', upToDate: 'Up to date', updateFailed: 'Update failed', settingsUnavailable: 'Settings unavailable',
  failCsv: 'download the plot data', failDownload: 'download the file', failPng: 'download the PNG', failSvg: 'download the SVG', failPdf: 'download the PDF', failJson: 'copy the figure JSON', loadLiveFirst: 'Load a live plot first.',
  copyJson: 'Copy figure JSON', failSchema: 'load the plot settings', failUpdate: 'update the plot', failAction: 'run this action', moduleDialog: 'Details', failDuplicate: 'duplicate the selection',
  failZip: 'download the ZIP', failCopy: 'copy to the tab', failDuplicateTab: 'duplicate the tab', failPage: 'export the figure page',
  canvasEmpty: 'This canvas is empty. Add a plot from the library or drag an illustration here.', canvasEmptyViewOnly: 'This canvas is empty.', addPlot: 'Add plot', canvasArea: 'Canvas area', keyboardShortcuts: 'Keyboard shortcuts', shortcutsTitle: 'Keyboard shortcuts',
  sizeHeading: 'Size', sizeWidth: 'Width (px)', sizeHeight: 'Height (px)', sizeLock: 'Lock aspect ratio', sizePresets: 'Journal width',
  sizePositionHeading: 'Size & position', sizeUnits: 'Units', sizeWidthField: 'Width', sizeHeightField: 'Height', positionX: 'X', positionY: 'Y', sizeClamped: 'Team cards are 63–1058 mm wide (240–4000 px).',
  typographyHeading: 'Typography', typeFamily: 'Font family', typeBase: 'Base size', typeScale: 'Scale', typeTitle: 'Title', typeAxisTitles: 'Axis titles', typeTicks: 'Tick labels', typeLegend: 'Legend', matchFonts: 'Match fonts across tab', resetScale: 'Reset scale',
  styleBar: 'Style', copyStyle: 'Copy style', pasteStyle: 'Paste style', applyToTab: 'Apply to tab…', applyConfirm: 'Apply', copiedStyle: 'Style copied', pastedStyle: 'Style pasted', pastedSize: 'Size pasted (image card: size and background only)', appliedStyle: 'Style applied to the tab',
  copyStyleKeys: 'Copy style (Ctrl/⌘ + Alt + C)', copyStyleOff: 'Fonts and colours are part of the image R draws: nothing to copy but size.', pasteStyleKeys: 'Paste style (Ctrl/⌘ + Alt + V)', pasteStyleEmpty: 'Copy a style first (Ctrl/⌘ + Alt + C)', applyKeys: 'Apply style to all plots of the tab (Ctrl/⌘ + Alt + Shift + V)', applyNoOthers: 'This tab has no other plots.'
} as const;
/** Shortcut rows: keys, action. */
export const shortcuts = [['L', 'Show or hide the plot library'], ['Shift + L', 'Show or hide illustrations'], ['/', 'Open the library and focus search'], ['Shift + 2', 'Fit the selection'], ['M', 'Pin or unpin the minimap'], ['Space + drag, or Move (H) then drag', 'Pan the canvas'], ['Pinch, or − / + in the zoom bar', 'Zoom'], ['Fit (zoom bar), or Shift + 1', 'Fit the canvas to its content'], ['100% (zoom bar), or Shift + 0', 'Zoom to 100%'], ['Ctrl/⌘ + C, then Ctrl/⌘ + V', 'Copy a card’s plot settings, paste them as a new card'], ['Ctrl/⌘ + Alt + C, then Ctrl/⌘ + Alt + V', 'Copy a card’s style, paste it on the selection'], ['Ctrl/⌘ + Alt + Shift + V', 'Apply the style to the whole tab'],
    ['V, then click', 'Select'], ['Shift + click, or drag a box', 'Select several'], ['Arrow keys (Alt for 1 px steps)', 'Move the selection'],
    ['Shift + arrow keys', 'Resize the selection'], ['F2, or Enter on a card title', 'Rename the card'], ['Delete', 'Delete the selection'], ['Ctrl/⌘ + D', 'Duplicate the selection'],
    ['Ctrl/⌘ + Z, Ctrl/⌘ + Shift + Z', 'Undo, redo'], ['Esc', 'Clear search, or close the menu, inspector, library, then selection'], ['I', 'Show or hide the inspector'], ['?', 'Show this list']] as const;
/** Sentences with a value inside. */
export const phrases = {
  shareTitle: (project: string) => `Share ${project}`,
  roleNow: (role: string) => `Your role on this project is now ${role}.`,
  noPlotMatches: (query: string) => `No plot matches “${query}”.`,
  restoringPlot: (label: string) => `Restoring ${label}…`,
  restorePlotFailed: (label: string) => `Couldn’t bring back ${label}.`,
  cardSize: (width: number, height: number) => `${Math.round(width)} × ${Math.round(height)}`,
  cancelAdd: (label: string) => `Cancel adding ${label}`,
  addShape: (shape: string) => `Add ${shape}`,
  chooseConditionColor: (condition: string) => `Choose color for ${condition}`,
  deleteNamed: (name: string) => `Delete “${name}”?`, addedCount: (count: number) => `Added · ${count} on canvas`, selectedCount: (count: number) => `${count} selected`,
  showOnCanvas: (label: string) => `Show ${label} on the canvas`,
  selectedOf: (n: number, total: number) => `${n} of ${total}`,
  paletteApplied: (redrew: number, of: number, later: number) => `Session colours applied: ${redrew} of ${of} plots redrew${later ? ` (${later} not drawn yet)` : ''}. Plots with their own colour settings keep them.`,
  groupColour: (group: string) => `Colour for ${group}`, hardToTellApart: (a: string, b: string) => `${a} and ${b} are hard to tell apart. Choose a colour further from the other group's.`, groupShape: (group: string) => `Shape for ${group}`, bqcSelected: (n: number, total: number) => `${n} of ${total} samples selected`,
  // A schema bound may be null (the API sends Team's numericInput without a max as "max": null).
  numberBounds: (min?: number | null, max?: number | null) => min != null && max != null ? `Enter a number from ${min} to ${max}.` : min != null ? `Enter a number of at least ${min}.` : max != null ? `Enter a number of at most ${max}.` : 'Enter a number.',
  tabHolds: (n: number) => n === 0 ? 'This tab is empty.' : `This tab holds ${n} ${n === 1 ? 'card' : 'cards'}.`,
  applyStyleSummary: (source: string, tab: string, full: number, sizeOnly: number, skipped: number) => `Apply the style of ${source} to ${tab || 'this tab'}: ${full} Plotly ${full === 1 ? 'plot gets' : 'plots get'} the full style, ${sizeOnly} image ${sizeOnly === 1 ? 'card gets' : 'cards get'} size only${skipped ? `, ${skipped} finished ${skipped === 1 ? 'plot is' : 'plots are'} skipped` : ''}. One undo step.`,
  tabRenamed: (name: string) => `Tab renamed to ${name}`,
  movedToTab: (name: string, count: number) => count === 1 ? `Moved to ${name}` : `${count} cards moved to ${name}`,
  currentTab: (name: string) => `${name} (current)`,
  downloaded: (name: string) => `Downloaded ${name}`,
  savedAs: (name: string) => `Saved checkpoint ${name}. You are now working on it; the previous checkpoint stays as it was.`,
  finishedOf: (done: number, total: number) => `${done} of ${total} plots finished`,
  leftOutByLayout: (labels: string[]) => labels.length === 1 ? `1 finished plot is not on this layout: ${labels[0]}. Free shows it.` : `${labels.length} finished plots are not on this layout: ${labels.join(', ')}. Free shows them.`,
  hiddenByLayout: (n: number) => n === 1 ? '1 text or shape hidden by this layout. Free shows it.' : `${n} texts and shapes hidden by this layout. Free shows them.`,
  finishNamed: (label: string) => `Finish ${label}`,
  draftPending: (n: number) => `Draft · ${n} to finish`,
  selectAtLeast: (n: number) => `Select ${n} or more cards (Shift-click, or drag a frame on the canvas)`,
  autosaveFailed: (reason: string) => `Autosave failed: ${reason}. Nexo keeps retrying; Download ZIP keeps a copy of your work.`,
  tabDuplicated: (name: string) => `Duplicated tab ${name}`,
  tabDeleted: (name: string, n: number, target?: string) => n === 0 || !target ? `Deleted tab ${name}${n ? ` and its ${n} ${n === 1 ? 'card' : 'cards'}` : ''}` : `Deleted tab ${name}; ${n} ${n === 1 ? 'card' : 'cards'} moved to ${target}`
};
/** Row 16 tooltips: an icon-only control's tooltip is its accessible name, then the printed key when it has one (never on touch-only pointers). */
export const keys = { plots: 'L', illustrations: 'Shift + L', select: 'V', move: 'H', inspector: 'I', duplicate: 'Ctrl/⌘ + D', zoomIn: '+', zoomOut: '−', closeInspector: 'Esc' } as const;
export const tip = (name: string, key?: string) => key ? `${name} · ${key}` : name;
export type SaveStatus = 'ready' | 'dirty' | 'saving' | 'saved' | 'readonly';
export function saveLabel(status: SaveStatus, time = new Date().toTimeString().slice(0, 5)): string {
  return status === 'saved' ? `${strings.saved} ${time}` : strings[status];
}

/** Targeted lipid cohort (Team's Single Lipid Analysis Mode). */
export const cohortStrings = {
  title: 'Targeted lipids', intro: 'Single Lipid Analysis Mode: every plot uses only the selected lipids. Clear to use the full dataset again.',
  search: 'Search lipids', selectAll: 'Select all', clear: 'Clear', invert: 'Invert', apply: 'Apply', cancel: 'Cancel', close: 'Close',
  loading: 'Loading lipids…', updating: 'Updating all plots…', none: 'No lipid matches the search.', viewOnly: 'View only: the cohort cannot be changed on this device.',
  clearCohort: 'Clear targeted lipids', cleared: 'Targeted lipids cleared: plots use the full dataset', failClear: 'clear the targeted lipids',
  chip: (n: number) => `Targeted: ${n} ${n === 1 ? 'lipid' : 'lipids'}`,
  count: (n: number, total: number) => `${n} of ${total} selected`,
  classLabel: (c: string) => `Select class ${c}`,
  classCount: (n: number, total: number) => `${n}/${total}`,
  applied: (n: number) => n ? `Targeted lipids applied: ${n} ${n === 1 ? 'lipid' : 'lipids'}` : 'Targeted lipids cleared: plots use the full dataset',
};

// Pro customization wave 2 part A (F10 heat presets, F12 legend presets, F6 saved styles, F7 colour-blind check).
export const proStrings = {
  heatPresets: 'Heat scale presets', heatSequential: 'Sequential', heatDiverging: 'Diverging', heatReverse: 'Reverse',
  heatSymmetric: 'Symmetric around 0', heatSymmetricOff: 'Only diverging scales can be centred on 0.',
  heatNote: 'Three stops approximate each scale. Values and limits stay unchanged.',
  legendPresets: 'Legend presets', legendNone: 'This plot has no legend: no series has a name to list, so a position would show nothing useful.',
  stylePresets: 'Saved styles', stylePresetName: 'Style name', stylePresetSave: 'Save current style', stylePresetIncludeSize: 'Include size',
  stylePresetEmpty: 'No saved styles yet. Save the current style to reuse it on other plots.',
  stylePresetNote: 'Stored in this browser only. Export to share or keep a copy.',
  stylePresetApply: 'Apply', stylePresetApplyTab: 'Apply to tab', stylePresetRename: 'Rename', stylePresetDelete: 'Delete',
  stylePresetExport: 'Export JSON', stylePresetImport: 'Import JSON', stylePresetImported: (n: number) => `Imported ${n} ${n === 1 ? 'style' : 'styles'}`,
  stylePresetImportFailed: 'This file holds no Nexo styles.', stylePresetSaved: (name: string) => `Saved ${name}`, stylePresetApplied: (name: string) => `Applied ${name}`,
  stylePresetAppliedTab: (name: string, n: number) => `Applied ${name} to ${n} ${n === 1 ? 'plot' : 'plots'}. One undo step.`,
  stylePresetNone: 'None applied',
  colourBlind: 'Colour-blind check', colourBlindNote: 'Simulation (Machado 2009), preview only: nothing is saved or exported.',
  colourBlindOk: 'deltaE ok', colourBlindAllOk: 'All series pairs stay apart (deltaE ≥ 15) under every simulation.',
  colourBlindClose: (a: string, b: string, sim: string, d: number) => `${a} and ${b} are close under ${sim} (deltaE ${d.toFixed(1)}). Try a palette from Colour palette or a symbol per series.`,
  colourBlindImage: 'Preview works on this image; its colours cannot be read for the report.',
  colourBlindFew: 'Fewer than two series colours to compare.'
};

/** Opening a released Admin dataset (?dataset=<uuid>): the Prepare dataset dialog and what each answer means. */
export const datasetStrings = {
  title: 'Prepare dataset', opening: 'Opening dataset…', preparing: 'Preparing with Team…',
  intro: 'Choose the samples and the preparation settings Team will apply. Team’s defaults are prefilled; the result opens as a new canvas you can save as a checkpoint.',
  samples: 'Samples', settings: 'Preparation settings', open: 'Open dataset',
  noSamples: 'Select at least one sample.',
  cancelled: 'The dataset was not opened. Prepare it again, or choose a checkpoint.', prepareAgain: 'Prepare dataset…',
  notFound: 'This dataset is not available to Nexo: it is not released, or it was withdrawn or superseded. Ask the lab for the current release.',
  integrityFailed: 'The dataset file does not match its signed record, so Nexo did not open it. Ask the lab to check the release.',
  unavailable: 'Nexo cannot reach the lab’s dataset store right now. Try again in a moment, or open a checkpoint.',
  signedOut: 'Nexo opens lab datasets with your Admin account, and you are not signed in to Admin. Sign in, and Nexo opens this dataset again.',
  signedOutCheckpoints: 'Nexo keeps checkpoints with your Admin account, and you are not signed in to Admin. Sign in, then come back to this page.',
  signIn: 'Sign in to Admin',
  selectedCount: (n: number, total: number) => `${n} of ${total} samples selected`,
  summary: (lipids: number, samples: number) => `${lipids} ${lipids === 1 ? 'lipid' : 'lipids'} · ${samples} ${samples === 1 ? 'sample' : 'samples'}`,
  projectTitle: (orderCode: string, version: number) => `${orderCode} · v${version}`
};
// Searchable Data-tab choice controls.
export const pickerStrings = {
  filter: 'Filter', noMatches: 'No matches.',
  filterLabel: (label: string) => `Filter ${label}`,
  classLabel: (label: string) => `Select class ${label}`,
};
export const exportStrings = {
  transparent: 'Transparent background (PNG, SVG)',
  transparentFinished: 'A finished figure keeps its snapshot background.',
  preview: 'Preview export at 300 DPI…', previewTitle: 'Export preview', previewLoading: 'Rendering at export size…',
  previewLoupe: 'Loupe at 1:1 (move with the pointer or arrow keys)', previewClose: 'Close',
  previewSize: (w: number, h: number, dpi: number, widthMm: number, heightMm: number) => `${w} × ${h} px · ${widthMm} × ${heightMm} mm at ${dpi} DPI`,
  previewFile: (size: string) => `PNG about ${size}`,
  previewCapped: (w: number, h: number) => `The API renders at most 4000 px per side: this plot is drawn at ${w} × ${h} px and scaled up to the export size.`,
};
