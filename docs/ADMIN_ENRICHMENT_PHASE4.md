# Admin Section - Phase 4: Data Quality & Review Workflow

This document describes the implementation plan for Phase 4 (Admin Stage 4) of the Dead on Film admin section, which adds a review workflow for enrichment results before they go live.

## Overview

Phase 4 adds data quality controls through a staging and review workflow:
- **Staging Mode**: Enrichment runs write to staging tables instead of production
- **Confidence Filtering**: Admin can filter results by confidence scores
- **Manual Review**: Admin reviews each enrichment before approving
- **Manual Overrides**: Admin can edit enrichment data before committing
- **Batch Operations**: Approve/reject multiple enrichments at once

## Goals from Phase 3 Planning

From `ADMIN_ENRICHMENT_PHASE3.md`:
> ### Planned for Stage 4 (Data Quality)
> - Review enrichment results before committing
> - Confidence score filtering
> - Manual overrides

## Architecture

### Database Schema

**Migration**: `1769049364534_add-enrichment-review-workflow.js`

#### New Tables

**`actor_enrichment_staging`**
- Stores basic death info before committing to `actors` table
- Links to `enrichment_run_actors` for traceability
- Fields: deathday, cause_of_death, age_at_death, years_lost, etc.
- Status: `pending`, `approved`, `rejected`, `edited`

**`actor_death_circumstances_staging`**
- Stores detailed death circumstances before committing
- Links to `actor_enrichment_staging`
- Mirrors structure of `actor_death_circumstances` production table
- Includes all confidence scores, career context, related celebrities, etc.

**`enrichment_review_decisions`**
- Audit trail of admin decisions
- Decision: `approved`, `rejected`, `manually_edited`
- Stores original vs edited values for manual edits
- Tracks admin user, timestamp, rejection reason

#### New Columns on Existing Tables

**`enrichment_runs`**
- `review_status`: Status of review process
  - `not_applicable`: For runs before review workflow
  - `pending_review`: New run awaiting review
  - `in_review`: Admin actively reviewing
  - `approved`: All enrichments reviewed and approved
  - `rejected`: Run rejected (bad data, etc.)
  - `committed`: Approved data committed to production
- `reviewed_by`: Admin username/email
- `reviewed_at`: Timestamp of review completion
- `review_notes`: Admin notes

#### Views

**`enrichment_pending_review`**
- Joins staging tables with run metadata
- Shows all pending enrichments with confidence scores
- Used by review UI for filtering and display

### Backend Components

#### 1. Database Writer Module
**File**: `server/src/lib/enrichment-db-writer.ts`

Abstracts database writes to support both production and staging:
- `writeToProduction()` - Current behavior, writes to actors/actor_death_circumstances
- `writeToStaging()` - New behavior, writes to staging tables

#### 2. Enrichment Script Updates
**File**: `server/scripts/enrich-death-details.ts`

New CLI option:
- `--staging` - Write to staging tables for review

When `--staging` is enabled:
1. Run enrichment as usual (fetch from sources, process data)
2. Write results to staging tables instead of production tables
3. Record enrichment_run_actor metadata as usual
4. Set enrichment run `review_status='pending_review'`
5. Skip cache invalidation (data not live yet)

**Implementation Status**: Foundation in place, needs wiring in main enrichment loop

#### 3. Review API Endpoints
**File**: `server/src/routes/admin/enrichment.ts` (extend existing file)

**GET `/admin/api/enrichment/pending-review`**
- List all enrichments pending review
- Query params:
  - `page`, `pageSize` - Pagination
  - `minConfidence` - Filter by overall confidence threshold
  - `causeConfidence` - Filter by cause confidence: `high`, `medium`, `low`
  - `runId` - Filter to specific run
- Returns: Array of pending enrichments with actor info, confidence scores, source, cost

**GET `/admin/api/enrichment/review/:enrichmentRunActorId`**
- Get detailed data for a single enrichment
- Returns: Full staging data, actor info, production data (if exists), confidence breakdown

**POST `/admin/api/enrichment/review/:enrichmentRunActorId/approve`**
- Approve a single enrichment
- Body: `{ adminUser: string, notes?: string }`
- Creates decision record
- Does NOT commit yet (see commit endpoint)

**POST `/admin/api/enrichment/review/:enrichmentRunActorId/reject`**
- Reject a single enrichment
- Body: `{ adminUser: string, reason: string, details?: string }`
- Creates decision record
- Marks staging record as rejected

**POST `/admin/api/enrichment/review/:enrichmentRunActorId/edit`**
- Manually edit enrichment before approval
- Body: `{ adminUser: string, edits: object, notes?: string }`
- Updates staging tables with edited values
- Creates decision record with original/edited diff
- Marks as `manually_edited`

**POST `/admin/api/enrichment/runs/:id/commit`**
- Commit all approved enrichments for a run
- Copies data from staging to production tables
- Invalidates actor caches
- Updates enrichment run `review_status='committed'`
- Records `committed_at` timestamp on decisions
- **Transaction**: All or nothing - rolls back on any error

**POST `/admin/api/enrichment/runs/:id/approve-all`**
- Bulk approve all pending enrichments in a run
- Filters to only enrichments meeting minimum confidence
- Body: `{ adminUser: string, minConfidence?: number, notes?: string }`

#### 4. Database Queries
**File**: `server/src/lib/db/admin-enrichment-queries.ts` (extend existing file)

New queries:
- `getPendingEnrichments(filters)` - List with confidence filtering
- `getEnrichmentDetail(enrichmentRunActorId)` - Full detail for review
- `approveEnrichment(enrichmentRunActorId, adminUser, notes)`
- `rejectEnrichment(enrichmentRunActorId, adminUser, reason, details)`
- `editEnrichment(enrichmentRunActorId, adminUser, edits, notes)`
- `commitEnrichmentRun(runId)` - Transaction to copy staging → production

### Frontend Components

#### 1. Review List Page
**File**: `src/pages/admin/EnrichmentReviewPage.tsx`

Features:
- Table of pending enrichments (actor name, deathday, cause, confidence scores)
- Confidence badge styling (high=green, medium=yellow, low=red, disputed=gray)
- Filters:
  - Minimum overall confidence slider
  - Cause confidence dropdown
  - Run ID selector
- Pagination
- Bulk actions: Approve all, Reject selected
- Per-row actions: Review, Quick approve, Quick reject
- Total pending count

#### 2. Review Detail Modal/Page
**File**: `src/components/admin/EnrichmentReviewModal.tsx`

Features:
- Side-by-side comparison: Staging data vs Current production data
- Confidence score breakdown (cause, details, birthday, deathday, circumstances)
- Full enrichment data display (circumstances, career context, sources, etc.)
- Edit mode: Inline editing of fields
- Actions: Approve, Reject (with reason), Save edits
- Audit trail: Show if previously edited, by whom, when

#### 3. Commit Confirmation Modal
**File**: `src/components/admin/CommitEnrichmentsModal.tsx`

Features:
- Summary: X approved enrichments ready to commit
- Warning: "This will make data live and invalidate caches"
- List of actors that will be updated
- Confirmation checkbox + button
- Progress indicator during commit
- Success/error handling

#### 4. React Query Hooks
**File**: `src/hooks/admin/useEnrichmentReview.ts`

Hooks:
- `usePendingEnrichments(filters)` - List with polling
- `useEnrichmentDetail(id)` - Single enrichment detail
- `useApproveEnrichment()` - Mutation
- `useRejectEnrichment()` - Mutation
- `useEditEnrichment()` - Mutation
- `useCommitEnrichmentRun()` - Mutation
- `useApproveAllEnrichments()` - Mutation

### User Workflows

#### Workflow 1: Standard Review Process

1. Admin starts enrichment with `--staging` flag from UI
2. Enrichment runs, writes to staging tables
3. Admin navigates to "Review Enrichments" page
4. Filters to high-confidence results: `minConfidence >= 0.8`
5. Clicks "Approve All" for high-confidence batch
6. Reviews medium/low confidence individually:
   - Opens detail modal for each
   - Checks sources, compares to current data
   - Approves, rejects, or edits as needed
7. Once all reviewed, clicks "Commit Approved"
8. Data goes live, caches invalidated

#### Workflow 2: Manual Edit Before Approval

1. Admin reviews enrichment for actor "John Doe"
2. Sees Claude suggested cause of death: "Heart attack"
3. Checks sources, finds more specific info
4. Clicks "Edit" button
5. Updates cause to "Myocardial infarction"
6. Adds note: "More specific diagnosis from medical examiner report"
7. Saves edit
8. Approves edited enrichment
9. Later commits with rest of batch

#### Workflow 3: Reject Low Quality

1. Admin reviews enrichment with `low` confidence
2. Sees vague circumstances: "Died in Los Angeles"
3. No death date, conflicting sources
4. Clicks "Reject"
5. Selects reason: "Low confidence, no death info"
6. Adds details: "Need better sources before accepting"
7. Rejection recorded, staging data marked rejected
8. Actor not included in commit

## Implementation Checklist

### Database Layer
- [x] Create migration with staging tables
- [x] Add review workflow tables
- [x] Add `enrichment_pending_review` view
- [ ] Write database query functions
- [ ] Add transaction support for commit operation

### Backend API
- [x] Create `enrichment-db-writer.ts` abstraction
- [ ] Wire staging mode into enrichment script
- [ ] Add review endpoints to enrichment router
- [ ] Implement confidence filtering logic
- [ ] Add admin action logging for all review operations
- [ ] Write tests for all endpoints

### Frontend
- [ ] Create `EnrichmentReviewPage` with list
- [ ] Add confidence filtering UI
- [ ] Create `EnrichmentReviewModal` for detail view
- [ ] Implement inline editing
- [ ] Add `CommitEnrichmentsModal` with confirmation
- [ ] Create React Query hooks
- [ ] Wire up to admin navigation
- [ ] Write component tests

### Testing
- [ ] Unit tests for db writer functions
- [ ] Unit tests for review queries
- [ ] Integration tests for review endpoints
- [ ] Frontend component tests
- [ ] E2E test for full review workflow

### Documentation
- [x] Create Phase 4 plan document
- [ ] Update API documentation
- [ ] Add review workflow guide for admins
- [ ] Update CLAUDE.md with staging mode usage

## Security Considerations

1. **Admin Authentication**: All review endpoints require admin auth
2. **Audit Trail**: All decisions logged with admin user, timestamp
3. **Transaction Safety**: Commit is atomic (all or nothing)
4. **SQL Injection**: All queries use parameterized statements
5. **Input Validation**: Validate confidence scores, edit fields
6. **Rate Limiting**: Consider for bulk operations

## Future Enhancements

- **Collaborative Review**: Multiple admins can review same run
- **Review Assignment**: Assign enrichments to specific admins
- **Auto-approval**: Automatically approve high confidence (>0.95) enrichments
- **Review Stats**: Track admin review patterns (approve rate, avg time)
- **Diff Highlighting**: Visual diff for edited fields
- **Comment Threads**: Allow discussion on uncertain enrichments
- **Scheduled Commits**: Batch commit approved enrichments nightly

## Related Documentation

- [Phase 3 (Interactive Controls)](ADMIN_ENRICHMENT_PHASE3.md)
- [Admin Master Plan](~/.claude/plans/graceful-sauteeing-mist.md)
- [CLAUDE.md](../CLAUDE.md) - Project guidelines
