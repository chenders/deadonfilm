---
globs: ["CLAUDE.md", ".claude/rules/*.md", ".github/copilot-instructions.md", ".github/docs/copilot-reference.md", "README.md", "docs/*.md", "src/pages/AboutPage.tsx", "src/pages/FAQPage.tsx", "src/pages/DataSourcesPage.tsx", "src/pages/MethodologyPage.tsx"]
---
# Documentation Sync

When modifying code, features, architecture, or any instruction file, **update all affected documentation**.

## Public Documentation (README + docs/)

The `README.md` links to these docs — **keep them accurate when making changes**:

| File | Content | Update When |
|------|---------|-------------|
| `README.md` | Project overview, features, architecture diagram, getting started | New features, source counts, architecture changes |
| `docs/biography-system.md` | Biography generation + enrichment pipeline | New bio sources, pipeline changes, editorial policy |
| `docs/death-research-pipeline.md` | Death enrichment source inventory + pipeline | New death sources, source removal, pipeline changes |
| `docs/architecture.md` | Deployment, env vars, infrastructure | Infrastructure changes, new services, env var changes |
| `docs/api.md` | API endpoint documentation | New routes, changed request/response shapes |

**Specific things to check in README.md:**
- Source counts (e.g., "19+ sources", "80+ sources") — update when adding/removing sources
- Feature descriptions — update when adding new discovery pages or capabilities
- Architecture diagram — update when adding new services or external APIs
- "The Numbers" table — update periodically (actor count, coverage percentages)

## User-Facing Static Pages

These pages describe how the site works to end users. **Keep them accurate when changing features, source counts, or pipeline architecture:**

| File | Content | Update When |
|------|---------|-------------|
| `src/pages/DataSourcesPage.tsx` | Debriefer engine, source phases, death & bio pipeline | Adding/removing sources, pipeline architecture changes |
| `src/pages/AboutPage.tsx` | Site overview, how it works | New features, data source changes |
| `src/pages/FAQPage.tsx` | FAQ answers (structured data for SEO) | Enrichment pipeline changes, methodology changes |
| `src/pages/MethodologyPage.tsx` | Actuarial formulas, obscure filtering rules | Mortality calculation changes, threshold changes |

**Specific things to check:**
- Source counts (e.g., "60+ sources", "37 sources") — update when adding/removing sources
- Pipeline descriptions — update when orchestration or synthesis changes (e.g., debriefer updates)
- FAQ answers reference enrichment pipeline — keep consistent with DataSourcesPage
- AboutPage "How It Works" section — keep consistent with DataSourcesPage

## Instruction Files (Claude + Copilot)

| File | Purpose | Audience |
|------|---------|----------|
| `CLAUDE.md` | Project overview, commands, architecture | Claude Code |
| `.claude/rules/*.md` | Topic-specific detailed rules | Claude Code |
| `.github/copilot-instructions.md` | Focused code review rules (~100 lines) | GitHub Copilot |
| `.github/docs/copilot-reference.md` | Extended reference (architecture, enrichment, etc.) | Developers |

When updating any instruction file, ensure consistency across all files for:

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
