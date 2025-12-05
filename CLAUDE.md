# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Dead on Film** - A website to look up movies and see which actors have passed away. Shows mortality statistics, death
dates, and causes of death (via Wikidata).

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL 16
- **Reverse Proxy**: Nginx (local dev via Docker Compose)
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Deployment**: Google Kubernetes Engine (GKE)
- **Caching**: In-memory + PostgreSQL for persistent storage
- **Data Sources**: TMDB API, Wikidata SPARQL, Claude API (optional)

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── pages/              # Route pages
│   ├── hooks/              # Custom hooks
│   ├── services/           # API client
│   ├── types/              # TypeScript types
│   └── utils/              # Utility functions
├── server/                 # Express.js backend
│   └── src/
│       ├── index.ts        # Server entry point
│       ├── lib/            # Shared utilities (cache, tmdb, wikidata)
│       └── routes/         # API route handlers
├── k8s/                    # Kubernetes manifests
│   ├── namespace.yaml
│   ├── secret.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── nginx-configmap.yaml  # Optional nginx config for k8s
├── docker-compose.yml      # Local development with Docker
├── nginx.conf              # Nginx reverse proxy config
├── Dockerfile              # Multi-stage Docker build
└── public/                 # Static assets
```

## Build Commands

```bash
# Install all dependencies
npm install
cd server && npm install

# Development (run frontend and backend together)
npm run dev:all

# Or run separately:
npm run dev          # Frontend on :5173
npm run dev:server   # Backend on :8080

# Production build
npm run build:all

# Type checking
npm run type-check           # Frontend
cd server && npm run type-check  # Backend

# Linting
npm run lint                 # Frontend
cd server && npm run lint    # Backend

# Formatting
npm run format               # Frontend - auto-fix
npm run format:check         # Frontend - check only
cd server && npm run format  # Backend - auto-fix

# Testing
npm test                     # Frontend unit tests

# Docker (standalone)
npm run docker:build
npm run docker:run

# Docker Compose (recommended for local development)
docker compose up -d        # Start all services (nginx, app, postgres)
docker compose down         # Stop all services
docker compose logs -f      # View logs
docker compose logs app     # View app logs only
```

## Local Development with Docker Compose

The recommended way to run locally is with Docker Compose, which starts:
- **nginx** - Reverse proxy on port 8000
- **app** - Frontend (port 3000) + Backend (port 8080)
- **db** - PostgreSQL on port 5437

Access the app at **http://localhost:8000**

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

## API Endpoints

- `GET /api/search?q={query}` - Search movies
- `GET /api/movie/{id}` - Get movie with deceased cast
- `GET /api/on-this-day` - Deaths on current date
- `GET /health` - Health check for Kubernetes

## Environment Variables

Create a `.env` file in the `server/` directory:

```
TMDB_API_TOKEN=your_token_here
PORT=8080
DATABASE_URL=postgresql://deadonfilm:deadonfilm@localhost:5437/deadonfilm
ANTHROPIC_API_KEY=your_anthropic_key  # Optional - improves cause of death accuracy
```

## GKE Deployment

### Prerequisites

- Google Cloud SDK (`gcloud`)
- `kubectl` configured for your cluster
- Docker
- GKE Autopilot cluster created
- Artifact Registry repository created

### Quick Deploy (Recommended)

Use the automated deployment script:

```bash
GCP_PROJECT_ID=your-project-id ./scripts/deploy.sh
```

This will:
1. Configure Docker authentication for Artifact Registry
2. Build and push the Docker image
3. Get GKE credentials
4. Apply all Kubernetes manifests
5. Wait for rollout to complete

### Manual Deploy Steps

1. **Set environment variables**:
   ```bash
   export PROJECT_ID=your-gcp-project-id
   export REGION=us-central1
   ```

2. **Configure Docker for Artifact Registry**:
   ```bash
   gcloud auth configure-docker ${REGION}-docker.pkg.dev
   ```

3. **Build and push Docker image**:
   ```bash
   docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/deadonfilm-repo/dead-on-film:latest .
   docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/deadonfilm-repo/dead-on-film:latest
   ```

4. **Get GKE credentials**:
   ```bash
   gcloud container clusters get-credentials deadonfilm-cluster --region ${REGION}
   ```

5. **Create namespace and secrets**:
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl create secret generic dead-on-film-secrets \
     --namespace=dead-on-film \
     --from-literal=TMDB_API_TOKEN=your_tmdb_token \
     --from-literal=ANTHROPIC_API_KEY=your_anthropic_key
   ```

6. **Update deployment.yaml** with your PROJECT_ID, then deploy:
   ```bash
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   kubectl apply -f k8s/ingress.yaml
   ```

7. **Reserve static IP** (for ingress with custom domain):
   ```bash
   gcloud compute addresses create dead-on-film-ip --global
   ```

### Useful Commands

```bash
# Check pod status
kubectl get pods -n dead-on-film

# View logs
kubectl logs -f deployment/dead-on-film -n dead-on-film

# Scale replicas
kubectl scale deployment dead-on-film --replicas=3 -n dead-on-film

# Update image
kubectl set image deployment/dead-on-film \
  dead-on-film=gcr.io/$PROJECT_ID/dead-on-film:v2 \
  -n dead-on-film
```

## URL Structure

Movie URLs use: `/movie/{slug}-{year}-{tmdbId}`
Example: `/movie/breakfast-at-tiffanys-1961-14629`

## Caching Strategy

In-memory cache with TTL (resets on container restart):

- Search results: 24 hours
- Movie credits: 7 days
- Person details (alive): 24 hours
- Person details (deceased): 30 days
- Wikidata data: 90 days

## Development Standards

### DRY Principle (Don't Repeat Yourself)

- **Avoid code duplication**: If the same logic appears more than once, extract it into a function or variable
- **Consolidate conditional branches**: When multiple if/else branches have identical code, restructure to have a single fallback
- **Extract common patterns**: Look for repeated patterns across files and consider shared utilities
- **Refactor when you see duplication**: Don't leave duplicated code "for later" - fix it immediately

**Example - Before (bad):**

```typescript
if (condition1) {
  // unique logic for condition1
} else {
  position = {lat: a + (b - a) * progress, lng: c + (d - c) * progress};
}
if (condition2) {
  // unique logic for condition2
} else {
  position = {lat: a + (b - a) * progress, lng: c + (d - c) * progress};  // DUPLICATE!
}
```

**Example - After (good):**

```typescript
const result = condition1 ? getCondition1Result() : condition2 ? getCondition2Result() : null;
if (result) {
  position = result;
} else {
  // Single fallback
  position = {lat: a + (b - a) * progress, lng: c + (d - c) * progress};
}
```

### Code Quality & Linting

**Frontend (Prettier)**:

- Configuration: Uses project defaults
- Formats: TypeScript, TSX, JavaScript, JSX, JSON, CSS, Markdown
- Check formatting: `npm run format:check` (in `src/`)
- Auto-fix: `npm run format` (in `src/`)
- CI/CD enforcement: Fails build if code not formatted

**Frontend (ESLint)**:

- Configuration: `eslint.config.js`
- TypeScript-specific checks via `@typescript-eslint` plugin
- Enforced rules:
    - `@typescript-eslint/no-unused-vars`: Catches unused variables and imports (error)
    - Exception: Variables/parameters prefixed with `_` are allowed
    - `no-console`: Warns on console.log (allow console.warn, console.error)
- Per-file exceptions:
    - Test files (`*.spec.ts`, `*.test.ts`): Allow unused vars, explicit any
- Manual check: `npm run lint` (in `src/`)
- CI/CD enforcement: Fails build on errors

**Frontend (TypeScript)**:

- Configuration: `tsconfig.app.json`, `tsconfig.node.json`
- Strict mode enabled: `strict: true`
- Additional checks:
    - `noUnusedLocals: true` (catches unused variables)
    - `noUnusedParameters: true` (catches unused function params)
    - `noFallthroughCasesInSwitch: true`
- Type check: `npm run type-check` (in `src/`)
- CI/CD enforcement: `tsc -b --noEmit` must pass

**Backend (ESLint + Prettier + TypeScript)**:

- Same standards as frontend
- Configuration: `server/eslint.config.js`, `server/.prettierrc`
- Check: `cd server && npm run lint && npm run format:check && npm run type-check`
- Auto-fix: `cd server && npm run format`

**Best Practices**:

- Run formatters before committing: `npm run format` (frontend) and `cd server && npm run format` (backend)
- Fix linting errors immediately: Don't accumulate technical debt
- Remove imports when removing code
- Test files can be more lenient, but production code must be strict

### Testing

- Write unit tests for new functionality
- Maintain test coverage for critical paths
- Frontend unit tests: `npm test` or `npm run test:watch` (for watch mode)
- Test files go in `src/` alongside the code they test, named `*.test.ts` or `*.spec.tsx`

**CRITICAL: Tests must test production code, not helper functions**

- Tests MUST import and test the actual production code
- If a test file doesn't import the module being tested, that's a bug
- Helper functions in test files should ONLY create fixtures/test data
- NEVER reimplement business logic in test files - test the real code
- Ask before writing: "Am I testing actual code, or a copy of it?"

**Bad example (DO NOT DO THIS):**

```typescript
// BAD: Reimplementing the hook logic in the test file
function calculateAmbulanceState(...) { /* reimplementation */
}

it("should work", () => {
  const result = calculateAmbulanceState(...);  // Testing the reimplementation!
  expect(result).toBe(...);
});
```

**Good example:**

```typescript
// GOOD: Import and test the actual hook
import {useSimulationPlayer} from "./useSimulationPlayer";

it("should work", () => {
  const {result} = renderHook(() => useSimulationPlayer(...));
  expect(result.current.ambulances.get("AMB001")?.status).toBe("idle");
});
```

**CRITICAL: Frontend tests MUST use `data-testid` or `id` attributes for element selection**

All frontend tests (unit tests and E2E tests) MUST use stable selectors:

- ✅ `data-testid` attributes (preferred): `[data-testid="submit-button"]`
- ✅ `id` attributes: `#submit-button`
- ✅ Semantic roles: `getByRole("button", { name: "Submit" })`
- ✅ Text content for labels: `getByText("Submit")`
- ❌ **NEVER use CSS/Tailwind classes**: `.bg-red-500`, `.flex-1`, `.cursor-pointer`

**Why this matters:**

- CSS classes are for styling, not element identification
- Tailwind classes change frequently during UI refinement
- Class-based selectors make tests brittle and hard to maintain
- `data-testid` attributes explicitly mark elements for testing

**Example - Adding test IDs to components:**

```tsx
// Component
<button
  className="px-4 py-2 bg-primary-600 hover:bg-primary-500"
  data-testid="load-simulation-button"
>
  Load Simulation
</button>

// Test
const button = page.locator('[data-testid="load-simulation-button"]');
await button.click();
```

**Exception:** Checking computed styles (e.g., dark mode tests) may verify style properties via `getComputedStyle()`,
but element selection must still use `data-testid`.

### Code Organization

- Keep business logic separate from UI/presentation
- Use clear, descriptive variable and function names
- Avoid deep nesting; prefer early returns

### Dependencies

- Pin major versions for stability
- Keep dependencies minimal and justified

## Git Practices

- Write clear, descriptive commit messages
- Keep commits focused on single logical changes
- Don't commit IDE-specific files (already configured in .gitignore)

### CI/CD Monitoring

**IMPORTANT**: After every push, actively monitor GitHub Actions workflows for failures.

**Workflow**:

1. After pushing changes, immediately run `gh run list --branch <branch-name> --limit 5` to check workflow status
2. Start a background monitoring process that periodically checks for workflow failures
3. If any workflow fails:
    - Immediately inform the user about the failure
    - Retrieve the failure details with `gh run view <run-id> --log-failed`
    - If a todo list exists, add an item to fix the CI/CD failure
    - If no todo list exists, immediately begin investigating and fixing the issue
4. Continue monitoring until all workflows complete successfully

**Commands**:

- List recent runs: `gh run list --branch <branch> --limit 5`
- View run details: `gh run view <run-id>`
- View failure logs: `gh run view <run-id> --log-failed`
- Watch run progress: `gh run watch <run-id>`

**Best Practice**: Be proactive about CI/CD monitoring - don't wait for the user to report failures

### GitHub CLI (gh) Usage

**IMPORTANT**: Always use `gh api` directly instead of high-level `gh` commands for modifying PRs/issues.

The `gh pr edit` and similar commands can fail silently due to deprecated GitHub features (e.g., Projects Classic). Use the API directly for reliable operations:

```bash
# Update PR description - USE THIS
gh api repos/OWNER/REPO/pulls/PR_NUMBER -X PATCH -f body="New description"

# DON'T use: gh pr edit PR_NUMBER --body "New description"

# Update PR title
gh api repos/OWNER/REPO/pulls/PR_NUMBER -X PATCH -f title="New title"

# Add labels
gh api repos/OWNER/REPO/issues/PR_NUMBER/labels -X POST -f labels[]="bug"

# Create PR comment
gh api repos/OWNER/REPO/issues/PR_NUMBER/comments -X POST -f body="Comment text"
```

**Read operations** can still use high-level commands:

```bash
gh pr view 25 --json title,body
gh pr list --state open
gh issue list
```

## Notes

- Use `nvm` to manage Node.js versions, ensure using Node 22.x
- Whenever you add a new feature, add tests for it
- After completing a feature request, please list the next steps automatically after committing to git
- Before commits, please make sure documents and tests are up to date

**Pre-Commit Checklist**:

1. Run formatters: `npm run format` and `cd server && npm run format`
2. Run linters: `npm run lint` and `cd server && npm run lint`
3. **IMPORTANT - Run type checks**: `npm run type-check` and `cd server && npm run type-check`
4. Run tests: `npm test` (frontend)
5. Update documentation if necessary
6. Update or add new tests if appropriate
