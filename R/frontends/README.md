# Frontend selection

Set `LIPIDOMIC_INTERFACE=classic` (default) or `LIPIDOMIC_INTERFACE=team` before starting `app.R`. `guided` is a migration alias for `team`. The selected shell is fixed for the R process; restart to switch. Each shell uses the same `R/modules` scientific backend and one `shared_data_server` instance per Shiny session.

The Team companion uses reviewed local guidance by default. To explicitly enable its optional OpenAI provider, set `LIPIDOMIC_COMPANION_AI=1` and provide `OPENAI_API_KEY` through the launch environment, or point `LIPIDOMIC_COMPANION_ENV` to an external environment file containing the key. `COMPANION_AI_MODEL` can override the provider model. Do not place credentials in this repository.

Classic static assets remain under `www/`. The Team shell uses `www/team/`, including its CSS, JavaScript, vendor PDF libraries, logos, and 3D model/media.

Process logs retain fixed ingestion stages, statuses, and a small set of numerical counts. Browser UI tracing records only event categories; set `LIPIDOMIC_UI_TRACE_DEBUG=1` to add the selected file count for upload events. Neither setting logs study filenames, sample labels, paths, or entered text.

The Team 3D cell view receives the full applied matrix through a presentation adapter. Targeted lipid mode can narrow other plots but does not narrow this reference view or change the preparation audit it displays.

The Team "Existing data on this computer" picker is disabled unless `LIPIDOMIC_LOCAL_WORKBOOK_DIR` names an existing directory. It lists only `.xlsx` files directly in that resolved directory and revalidates each selected path before opening it. Symlinks resolving outside that directory are excluded. The saved Run comparison panel is likewise optional and needs its separate study CSV and images; a clean install includes neither lab study data nor a configured workbook directory.

Runtime launches do not install dependencies by default. Run `00_ENVIRONMENT_SETUP.R` explicitly during environment preparation. For an intentional interactive setup only, `LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL=1` restores the legacy bootstrap behavior; do not enable it for a reproducible service deployment. Missing optional visNetwork retains its existing warning/fallback.
