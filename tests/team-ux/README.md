# Team UX shell checks

Headless checks for the Team workspace shell. They need a running Team server
(`LIPIDOMIC_INTERFACE=team LIPIDOMIC_TEAM_WORKSPACE=1 LIPIDOMIC_PROJECT_LIBRARY=1`)
whose project library serves the synthetic CI fixture, for example a local stub
library on 127.0.0.1. Never point them at production.

```sh
TEAM_URL=http://127.0.0.1:43262/ TEAM_EMAIL=… TEAM_PASSWORD=… node tests/team-ux/test_shell_geometry.cjs
```

`test_shell_geometry.cjs` asserts at 1280×800, 1440×900 and 1920×1080 that the
top bar, icon rail, library, floating toolbar, minimap, inspector column and the
companion character never overlap, and that the companion's launcher opens its
panel and its canvas action adds a plot.
