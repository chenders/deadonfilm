---
globs: ["CLAUDE.md", ".claude/rules/*.md", ".github/copilot-instructions.md", ".github/docs/copilot-reference.md"]
---
# Documentation Sync

When modifying any instruction file, **update the others to match**.

## Files to Keep in Sync

| File | Purpose | Audience |
|------|---------|----------|
| `CLAUDE.md` | Project overview, commands, architecture | Claude Code |
| `.claude/rules/*.md` | Topic-specific detailed rules | Claude Code |
| `.github/copilot-instructions.md` | Focused code review rules (~100 lines) | GitHub Copilot |
| `.github/docs/copilot-reference.md` | Extended reference (architecture, enrichment, etc.) | Developers |

## What to Sync

Copilot instructions (focused review rules) and the extended reference doc draw from CLAUDE.md and `.claude/rules/*.md`. When updating any of these, ensure consistency across all files for:

- Project overview, tech stack, architecture
- Development commands
- Database schema and join rules
- Testing requirements and conventions
- Mortality formulas and thresholds
- Death enrichment source priority order
- Security best practices
- Code quality standards
- Git workflow and commit conventions
- JavaScript/CommonJS file list
