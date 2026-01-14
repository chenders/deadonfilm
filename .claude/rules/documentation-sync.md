---
globs: ["CLAUDE.md", ".claude/rules/*.md", ".github/copilot-instructions.md"]
---
# Documentation Synchronization

## Keep Instructions Aligned

When modifying any of these files, **update the others to match**:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Primary instructions for Claude Code |
| `.claude/rules/*.md` | Detailed rules by topic |
| `.github/copilot-instructions.md` | GitHub Copilot instructions |

## Synchronization Rules

1. **CLAUDE.md changes** → Update `copilot-instructions.md`
2. **Rules file changes** → Update `copilot-instructions.md` if the rule is relevant to Copilot
3. **Critical rules** must be identical across all files

## What to Sync

- Critical constraints (SQL injection, test requirements, ID verification)
- Database schema notes (nullable fields, foreign key relationships)
- Testing requirements and conventions
- Mortality calculation rules
- Code quality standards
