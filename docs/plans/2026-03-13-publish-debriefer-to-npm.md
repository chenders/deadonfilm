# Phase G: Publish Debriefer to npm

**Date**: 2026-03-13
**Status**: Not started
**Depends on**: Phase E (done — debriefer integration verified in production)

## Goal

Publish `debriefer` and `debriefer-sources` to npm at 1.0.0, then update deadonfilm to consume published packages instead of `file:` path dependencies. This eliminates the debriefer clone steps in CI/deploy, the custom `Dockerfile.test`, and the pinned SHA management.

## Scope

- **Publish**: `debriefer` (core) and `debriefer-sources` only
- **Not publishing**: `debriefer-cli`, `debriefer-server`, `debriefer-mcp` (no consumers yet)
- **Version**: 1.0.0 (production-proven via deadonfilm)

---

## Part 1: Debriefer Repo

**Repo**: `/Users/chris/Source/debriefer` (github.com/chenders/debriefer)

### 1.1 npm Account Setup
- Run `npm login` to authenticate
- Verify with `npm whoami`

### 1.2 Add Package Metadata
Add to both `packages/core/package.json` and `packages/sources/package.json`:
- `description` — one-line summary
- `license` — "MIT" (LICENSE file already exists)
- `repository` — `{ "type": "git", "url": "https://github.com/chenders/debriefer.git", "directory": "packages/core" }`
- `homepage` — GitHub README link
- `bugs` — `{ "url": "https://github.com/chenders/debriefer/issues" }`
- `author` — "Chris Henderson"
- `keywords` — relevant terms for npm search

### 1.3 Bump Versions to 1.0.0
- Update `version` in both package.json files
- Update root `package.json` version to 1.0.0

### 1.4 Build and Publish
```bash
cd /Users/chris/Source/debriefer
npx turbo build
cd packages/core && npm publish
cd ../sources && npm publish
```

### 1.5 Tag Release
```bash
git add -A && git commit -m "Publish debriefer 1.0.0 and debriefer-sources 1.0.0"
git tag v1.0.0
git push && git push --tags
```

---

## Part 2: Deadonfilm Repo

**Repo**: `/Users/chris/Source/deadonfilm`

### 2.1 Update Dependencies
In `server/package.json`, replace:
```json
"debriefer": "file:../../debriefer/packages/core",
"debriefer-sources": "file:../../debriefer/packages/sources",
```
With:
```json
"debriefer": "^1.0.0",
"debriefer-sources": "^1.0.0",
```

Run `cd server && npm install` to update the lockfile.

### 2.2 Update Dockerfile
Remove the debriefer COPY lines:
- **Backend-builder stage**: Remove `COPY debriefer/ /debriefer/`
- **Production stage**: Remove `COPY --from=backend-builder /debriefer/ /debriefer/`

### 2.3 Delete Dockerfile.test
Now identical to `Dockerfile` (minus New Relic, which can be handled by the `deploy-test.yml` CMD override if needed). Delete it entirely.

### 2.4 Update deploy.yml
Remove:
- `Setup Node.js` step
- `Clone and build debriefer` step

### 2.5 Update deploy-test.yml
Remove:
- `Setup Node.js` step
- `Clone and build debriefer` step
- Change `file: Dockerfile.test` to use standard `Dockerfile`
- If test env needs no New Relic, override CMD in `docker-compose.test.yml` instead

### 2.6 Update ci.yml
Remove debriefer clone steps from:
- `backend-build` job
- `backend-test` job

### 2.7 Verify
- [ ] `cd server && npm test` passes locally
- [ ] CI passes on PR
- [ ] Test environment deploys successfully
- [ ] Production deploys successfully

---

## What Gets Eliminated

| File/Section | Lines Removed |
|-------------|---------------|
| `Dockerfile.test` | 106 lines (entire file) |
| `Dockerfile` debriefer COPY | ~10 lines |
| `deploy.yml` debriefer clone | ~15 lines |
| `deploy-test.yml` debriefer clone | ~15 lines |
| `ci.yml` debriefer clone (x2 jobs) | ~30 lines |
| Pinned SHA management | 3 files no longer need sync |

**Total**: ~175 lines removed, significant CI/deploy simplification.

---

## Rollback Plan

If published packages have issues:
1. Revert `server/package.json` to `file:` deps
2. Restore Dockerfile/workflow debriefer steps from git history
3. Published npm packages can be unpublished within 72 hours if needed
