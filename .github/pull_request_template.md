## Description
Please include a summary of the changes and the related issue.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Verification Checklist
Before submitting this pull request, please verify that:
- [ ] The automated AST syntax audit passes (`Rscript -e "parse('...')"` on modified files).
- [ ] Session roundtrip persistence has been validated (Export/Import of a test session works).
- [ ] The change matches the WYSIWYG plot layouts sizing protocol (if applicable).
