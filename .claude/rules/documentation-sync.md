---
globs: ["CLAUDE.md", ".claude/rules/*.md", ".github/copilot-instructions.md"]
---
# Documentation Sync

When modifying instruction files, **update the others to match**:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Primary Claude Code instructions |
| `.claude/rules/*.md` | Topic-specific rules |
| `.github/copilot-instructions.md` | GitHub Copilot instructions |

Sync: critical constraints, database schema, testing requirements, mortality rules, code quality standards.
