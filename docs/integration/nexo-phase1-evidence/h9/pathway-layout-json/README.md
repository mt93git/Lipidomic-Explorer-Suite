# Pathway layout JSON download and upload (chart audit b11 F3)

Team's pathway module (`R/modules/13_pathway_module.R:171-173`) offers, in "Options & Configuration",
"Download Layout JSON" (`download_config`) and "Upload Layout JSON (.json):" (`upload_config`, a fileInput).
Nexo now offers both on pathwayPlot and pathwayVisNetwork.

## What the user can do

- Export tab, "More downloads from this analysis": **Download Layout JSON** saves `pathway_layout_config.json`,
  written by the module's own downloadHandler.
- Data tab: **Upload Layout JSON (.json):** sends the file to Team's module; the card redraws with the layout.
  A file that does not parse shows Team's own message ("Error loading layout JSON: ..."); a non-.json file shows
  "Upload a .json file."; over 256 KiB, "The file is larger than 256 KiB.". Undo reverts the upload in one step.

## Rule (generic)

`R/frontends/api/export.R` `api_config_id`: in a module's static UI, a download link or file input whose id ends in
`config` is a configuration control of every card of that module. Today it picks up `pathway_tab` `download_config`
(listed by `api_card_downloads`, Team's label) and `upload_config` (in the card schema as `uploads`, Team's label and
`accept`). No other module has such ids.

## Where it is stored

- The upload goes `POST /api/v1/sessions/<id>/cards/<instanceId>/uploads/upload_config` with `{name, content}`.
  The API checks `.json`, at most 256 KiB, parses the text with `jsonlite::parse_json` (never `fromJSON`, which would
  read a string naming a file or URL) and makes the field access Team's observer makes first (400 with Team's message
  "Error loading layout JSON: ..." otherwise), writes a temp file and sets
  the module's input to Shiny's fileInput data.frame (name, size, type, datapath). Team's own observer writes the
  layout to its `active_classes_json`, `custom_nodes_json`, `added_edges_json`, `removed_edges_json`,
  `position_overrides_json` inputs. Those are in the card's `allowedInputs`, so the layout is saved **in the instance
  inputs** (normal instance path; `plot_instances.R` untouched).
- Nexo's member keeps the uploaded file: `nexo-canvas-v1.json` `nodes[<id>].inputs.upload_config = {name, content}`.
  It goes with a duplicate and is saved/reopened with the checkpoint; it is not re-sent on reopen (the instance inputs
  already hold the layout, and a re-send would overwrite later edits).
- A Nexo checkpoint still opens in Team: Team ignores Nexo's member and reads the `*_json` instance inputs, so Team
  shows the uploaded layout.

## Tests

- `tests/dual-ui/test_api_pathway_layout_json.R`: **unrun here** (no R on this machine); for the coordinator on the
  RTX. Both pathway cards: downloads list `download_config` with Team's label and the file parses; an edited layout
  (PC moved to [123, -45], Team's own [x, y] format) is accepted, settles, round-trips through the download and the
  render changes (plotly x = 123; visNetwork x = 123 * 55); non-JSON (Team's message), a file path given as content,
  a JSON scalar (Team's message), `.csv`, oversized and a non-file input id are refused with 400 and leave the layout.
- `frontends/nexo/src/state/layoutUpload.test.ts` (vitest).
- `tests/dual-ui/test_nexo_pathway_layout_json.cjs` (mock, Chromium and WebKit, 1440x900): download link present
  and the file parses; upload of an edited fixture redraws the card ("layout: 1 moved node" in the mock render) and
  the member keeps the file; a bad file and a .csv show the messages and leave the card up to date (no error badge);
  one undo reverts the upload (layout inputs sent back, file gone from the member), redo restores it; a duplicate keeps
  layout and file. The mock catalog seeds the five `*_json` inputs on the pathway cards as Team's module does.

Screenshots: `chromium-1440-export-download.png`, `chromium-1440-upload-redrawn.png`, `chromium-1440-bad-file.png`.
Outputs: `red.txt`, `green.txt`.
