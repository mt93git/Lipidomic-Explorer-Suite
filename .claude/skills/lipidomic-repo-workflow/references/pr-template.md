# Pull request template

Proposed version of `.github/pull_request_template.md`. It keeps the verification checklist of the current template and adds the questions from the working agreement. Until the repo template is updated, paste the extra sections into each PR description.

```markdown
## What changes
<!-- One or two sentences. One topic per PR. -->

## Kind of change
- [ ] Normal (interface, text, speed, fixes, tests): 1 approval
- [ ] Touches the shared core (R/modules, R/global.R, R/server.R, R/core): 1 approval + Classic parity
- [ ] Changes a scientific result (defaults, statistics, sample exclusion): 2 approvals + before/after check
- [ ] Changes the project's rules (.github/workflows/, DESCRIPTION, CITATION.cff, LICENSE, the agent skill): 2 approvals

## How it was tested
<!-- Commands run, results, and what you checked by hand. -->

## Effect on Classic
- [ ] None: Classic output is identical to the reference
- [ ] Changes, explained here:

## Before / after (scientific changes only)
<!-- The same input, with the result before and after this PR. -->

## Checklist
- [ ] CI is green
- [ ] No real data, credentials or environment values in the diff
- [ ] No test disabled or deleted to get green
- [ ] Branched from the latest integration
- [ ] The automated AST syntax audit passes (`Rscript -e "parse('...')"` on modified files)
- [ ] Session roundtrip persistence has been validated (Export/Import of a test session works)
- [ ] The change matches the WYSIWYG plot layouts sizing protocol (if applicable)
```
