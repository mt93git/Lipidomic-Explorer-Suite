# Frontend boundary

Block A installs Classic and the shared scientific backend. Run app.R normally, or set LIPIDOMIC_INTERFACE=classic. Block B adds the optional Team shell; selecting LIPIDOMIC_INTERFACE=team without Block B fails before loading packages with an actionable message.

R/server.R creates one shared_data_server and one set of analytical modules. Both shells consume these modules. No Team assets, companion, model files or Team UI are included in Block A. Team-only extensions are sourced only for the selected frontend after Block B is installed.

For custom servers set LIPIDOMIC_HOSTED=1. Disable runtime installation explicitly with LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL=1; provision dependencies before launching. No credentials, private workbooks, deployment configuration or database state are included.
