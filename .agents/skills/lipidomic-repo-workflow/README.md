# lipidomic-repo-workflow skill

A skill in the open Agent Skills format: a folder with a `SKILL.md` (YAML `name` and `description`, then Markdown instructions) plus reference files. Claude Code, Codex and Antigravity all read this format.

## Install

Copy the `lipidomic-repo-workflow/` folder to one of these places.

| Tool | Inside the repo (shared with the team) | Only on your machine |
| --- | --- | --- |
| Claude Code | `.claude/skills/lipidomic-repo-workflow/` | `~/.claude/skills/lipidomic-repo-workflow/` |
| Codex | `.agents/skills/lipidomic-repo-workflow/` | `~/.agents/skills/lipidomic-repo-workflow/` |
| Antigravity | `.agents/skills/lipidomic-repo-workflow/` | `~/.gemini/config/skills/lipidomic-repo-workflow/` (Antigravity CLI: `~/.gemini/antigravity-cli/skills/`) |

Recommended: commit it once to `.agents/skills/` in the repo (read by Codex and Antigravity), and add a copy or a symlink at `.claude/skills/` for Claude Code. Then all three of you get the same rules automatically.

Paths checked on 2026-11-06 against the Codex and Antigravity docs; they may change.

## Contents
- `SKILL.md`: branches, the life of a change, the three kinds of change, the eight rules, rules for AI agents, releases.
- `references/pr-template.md`: the PR template.
- `references/release-checklist.md`: the weekly release checklist for the person on duty.
