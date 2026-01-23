# Dead on Film Admin Section

The admin section provides a web-based interface for managing enrichment runs, monitoring system health, and reviewing data quality before it goes live.

## Features

### 1. Dashboard (`/admin/dashboard`)

System overview and quick statistics:

- **System Health**: Real-time status for database and Redis cache
- **Actor Statistics**: Total actors, deceased actors, enrichment coverage
- **Enrichment Runs**: Total runs (all time) and recent runs (last 7 days)
- **Cost Overview**: Total API costs and last 30 days spending

### 2. Enrichment Runs (`/admin/enrichment/runs`)

View and manage enrichment run history:

- **Paginated Table**: View all enrichment runs with key metrics
  - Run ID, start time, duration
  - Actors processed and enriched
  - Fill rate, total cost
  - Status badges (Running, Completed, Error, Cost Limit, Interrupted)
- **Filters**: Filter runs by date range, exit reason, cost
- **Run Details**: Click any run ID to view detailed information

### 3. Enrichment Run Details (`/admin/enrichment/runs/:id`)

Detailed view of a single enrichment run:

#### Real-Time Progress (for running enrichments)
- Live progress bar with percentage
- Current actor being processed
- Actors processed count
- Elapsed time and estimated time remaining
- Running cost total
- **Stop Run**: Ability to stop a running enrichment

#### Summary Statistics
- Actors processed and enriched
- Fill rate (percentage with death info)
- Total cost and average cost per actor
- Duration and average time per actor

#### Configuration & Metadata
- Exit reason (completed, cost_limit, error, interrupted)
- Error count
- Links followed and pages fetched
- Script name and version
- Hostname (for distributed runs)

#### Source Performance
Per-source breakdown showing:
- Number of attempts and successes
- Success rate percentage
- Total cost and average cost per attempt

#### Per-Actor Results Table
- Actor names with enrichment status
- Winning data source for each actor
- Cost per actor
- Processing time

### 4. Start New Enrichment Run (`/admin/enrichment/start`)

Web interface for starting enrichment runs with full configuration:

#### Actor Selection
- **Number of actors** (1-1000)
- **Minimum popularity** (0-100) - Only process actors above threshold
- **Recent deaths only** - Checkbox to limit to deaths in last 2 years

#### Cost Limits
- **Max total cost** (USD) - Stop run when limit reached
- **Max cost per actor** (USD, optional) - Skip expensive actors

#### Quality Settings
- **Confidence threshold** (0.0-1.0) - Minimum confidence to accept results

#### CLI Reference
Shows equivalent CLI command for the current configuration, useful for:
- Automating runs via cron
- Running from server terminal
- Documentation reference

### 5. Review Workflow (Stage 4)

**Status**: Foundation complete, review UI in development

Review enrichment results before committing to production:

- **Staging Mode**: Enrichment runs write to staging tables
- **Confidence Filtering**: Filter results by confidence scores
- **Manual Review**: Review each enrichment before approving
- **Manual Overrides**: Edit enrichment data before committing
- **Batch Operations**: Approve/reject multiple enrichments at once
- **Audit Trail**: All review decisions logged with admin user and timestamp

## Security

### Authentication

The admin section uses a two-layer security model:

1. **Password Authentication**: Bcrypt-hashed password stored as environment variable
2. **Session Tokens**: JWT tokens with 7-day expiry stored in HTTP-only cookies

### Password Setup

#### Step 1: Generate Password Hash

Use Node.js to generate a bcrypt hash of your password:

```bash
# Generate hash (10 rounds)
node -e "console.log(require('bcrypt').hashSync('your-secure-password', 10))"
```

This outputs a hash like:
```
$2b$10$EXAMPLE_HASH_DO_NOT_USE_THIS_IN_PRODUCTION_REPLACE_WITH_YOUR_OWN
```

#### Step 2: Set Environment Variable

Add the hash to your `.env` file (production) or `.env.production` (server):

```bash
# Admin password hash (bcrypt, 10 rounds)
ADMIN_PASSWORD_HASH=$2b$10$YOUR_ACTUAL_BCRYPT_HASH_HERE
```

**IMPORTANT**: Never commit the actual password, only the hash. The hash cannot be reversed to recover the original password.

#### Step 3: Generate JWT Secret

Generate a random secret for signing session tokens:

```bash
# Generate 64-character hex string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:

```bash
# JWT secret for admin session tokens (random string, 64+ characters)
JWT_SECRET=your_64_character_hex_string_from_crypto_randomBytes_here
```

### Session Management

- **Token Expiry**: 7 days from login
- **Storage**: HTTP-only cookie (not accessible to JavaScript)
- **Validation**: Every admin API request validates the JWT token
- **Logout**: Deletes the session cookie

### Password Best Practices

1. **Use a strong password**: 16+ characters, mix of upper/lower/numbers/symbols
2. **Unique password**: Don't reuse passwords from other services
3. **Change periodically**: Regenerate hash and update environment variable
4. **Secure storage**: Keep `.env` files out of version control
5. **Server access**: Limit who has access to the production `.env` file

### Audit Logging

All admin actions are logged to two places:

1. **Database**: `admin_audit_log` table
   - Action type
   - Resource affected (type and ID)
   - Admin user information
   - IP address and user agent
   - Timestamp

2. **New Relic**: Custom `AdminAction` events
   - Action metadata
   - Resource details
   - Performance tracking

Logged actions include:
- Login attempts (success/failure)
- Starting enrichment runs
- Stopping enrichment runs
- Reviewing/approving/rejecting enrichments
- Manual edits to enrichment data

## Setup Instructions

### Prerequisites

- Dead on Film application running with PostgreSQL
- Node.js installed (for hash generation)
- Access to `.env` file on the server

### Initial Setup

1. **Generate password hash**:
   ```bash
   node -e "console.log(require('bcrypt').hashSync('your-secure-password', 10))"
   ```

2. **Generate JWT secret**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Update environment variables**:
   ```bash
   # Add to /opt/deadonfilm/.env (or local .env for development)
   ADMIN_PASSWORD_HASH=<hash from step 1>
   JWT_SECRET=<secret from step 2>
   ```

4. **Restart the application**:
   ```bash
   cd /opt/deadonfilm
   docker compose restart
   ```

5. **Test login**:
   - Navigate to `https://deadonfilm.com/admin/login`
   - Enter your password
   - Should redirect to dashboard

### Changing the Password

1. Generate new hash with new password
2. Update `ADMIN_PASSWORD_HASH` in `.env`
3. Restart application
4. All existing sessions will remain valid until they expire (7 days)
5. To force re-login, also change `JWT_SECRET` (invalidates all sessions)

## Usage Guide

### First Time Login

1. Navigate to `/admin/login`
2. Enter your password
3. Redirected to dashboard on success
4. Session lasts 7 days

### Starting an Enrichment Run

**Via Web UI** (Recommended for ad-hoc runs):

1. Go to `/admin/enrichment/start`
2. Configure actor selection:
   - Set number of actors to process
   - Set minimum popularity (0 = all actors)
   - Check "recent only" for deaths in last 2 years
3. Set cost limits:
   - Max total cost (prevents runaway spending)
   - Max per-actor cost (optional, skips expensive actors)
4. Set confidence threshold (0.5 recommended)
5. Click "Start Enrichment Run"
6. Redirected to run details page
7. Monitor real-time progress

**Via CLI** (Recommended for scheduled runs):

```bash
cd server
npm run enrich:death-details -- \
  --limit 100 \
  --max-total-cost 10 \
  --min-popularity 5 \
  --confidence 0.5
```

Options:
- `--limit N`: Process up to N actors
- `--max-total-cost USD`: Stop when total cost reaches limit
- `--max-cost-per-actor USD`: Skip actors exceeding per-actor limit
- `--min-popularity N`: Only process actors with popularity ≥ N
- `--recent-only`: Only process deaths in last 2 years
- `--confidence N`: Minimum confidence threshold (0.0-1.0)
- `--dry-run`: Preview without making changes

### Monitoring a Running Enrichment

1. Go to `/admin/enrichment/runs`
2. Click on the running enrichment (shows "Running" badge)
3. View real-time progress:
   - Progress bar and percentage
   - Current actor being processed
   - Elapsed and estimated time remaining
   - Actors processed and enriched
   - Running cost total
4. **Stop if needed**: Click "Stop Run" button

### Viewing Historical Runs

1. Go to `/admin/enrichment/runs`
2. Use filters to narrow down:
   - Date range (start date, end date)
   - Exit reason (completed, cost_limit, error, interrupted)
3. Click any run ID to view details
4. View per-actor results and source performance

### Understanding Status Badges

- **Running** (Blue): Currently processing actors
- **Completed** (Green): Successfully finished all actors
- **Cost Limit** (Yellow): Stopped due to reaching cost limit
- **Error** (Red): Fatal error occurred
- **Interrupted** (Gray): Manually stopped by admin
- **Errors** (Red): Completed but had non-fatal errors

### Interpreting Source Performance

The source performance table shows which data sources are most effective:

- **Attempts**: How many times the source was queried
- **Success**: How many queries returned valid data
- **Rate**: Success percentage (higher is better)
- **Cost**: Total API costs for this source
- **Avg Cost**: Average cost per query

Use this data to:
- Identify most reliable sources
- Detect sources with low success rates
- Monitor API costs per source
- Optimize source priority order

## API Endpoints

All admin endpoints require authentication (valid JWT in cookie).

### Authentication
- `POST /admin/api/auth/login` - Login with password
- `POST /admin/api/auth/logout` - Logout and clear session
- `GET /admin/api/auth/check` - Verify session validity

### Dashboard
- `GET /admin/api/dashboard/stats` - System health and statistics

### Enrichment Runs
- `GET /admin/api/enrichment/runs` - List runs with filters
- `GET /admin/api/enrichment/runs/:id` - Run details
- `GET /admin/api/enrichment/runs/:id/actors` - Per-actor results
- `GET /admin/api/enrichment/runs/:id/progress` - Real-time progress
- `GET /admin/api/enrichment/runs/:id/source-stats` - Source performance
- `POST /admin/api/enrichment/start` - Start new run
- `POST /admin/api/enrichment/runs/:id/stop` - Stop running enrichment

### Source Performance (Global)
- `GET /admin/api/enrichment/sources/performance` - All-time source stats

### Review Workflow (Stage 4 - In Development)
- `GET /admin/api/enrichment/pending-review` - List pending enrichments
- `GET /admin/api/enrichment/review/:id` - Review detail
- `POST /admin/api/enrichment/review/:id/approve` - Approve enrichment
- `POST /admin/api/enrichment/review/:id/reject` - Reject enrichment
- `POST /admin/api/enrichment/review/:id/edit` - Edit before approval
- `POST /admin/api/enrichment/runs/:id/commit` - Commit approved enrichments

## Database Schema

### Core Tables

- **`admin_audit_log`**: Audit trail of all admin actions
- **`enrichment_runs`**: Metadata for each enrichment run
- **`enrichment_run_actors`**: Per-actor results and source performance

### Staging Tables (Stage 4)

- **`actor_enrichment_staging`**: Staged death info before production
- **`actor_death_circumstances_staging`**: Staged detailed death info
- **`enrichment_review_decisions`**: Review decisions audit trail

### Views

- **`enrichment_pending_review`**: Pending enrichments with confidence scores

## Troubleshooting

### Cannot Login

**Symptoms**: "Invalid password" error when password is correct

**Solutions**:
1. Verify `ADMIN_PASSWORD_HASH` is set in `.env`
2. Regenerate hash (might have copy/paste error)
3. Check server logs for errors
4. Verify bcrypt version matches (should be 10 rounds)

### Session Expired Immediately

**Symptoms**: Redirected to login right after successful login

**Solutions**:
1. Verify `JWT_SECRET` is set in `.env`
2. Check browser allows cookies
3. Verify clock sync on server (JWT uses timestamps)
4. Check for HTTPS in production (required for secure cookies)

### Real-Time Progress Not Updating

**Symptoms**: Progress stays at 0% when enrichment is running

**Solutions**:
1. Verify enrichment is actually running (check server logs)
2. Check database connection (progress stored in DB)
3. Refresh page
4. Check browser console for errors

### High Costs

**Symptoms**: Enrichment runs spending more than expected

**Solutions**:
1. Lower `--max-total-cost` limit
2. Set `--max-cost-per-actor` to skip expensive actors
3. Increase `--min-popularity` to focus on notable actors
4. Use `--recent-only` for smaller batches
5. Check source performance to identify expensive sources

### Low Fill Rates

**Symptoms**: Few actors getting enriched

**Solutions**:
1. Lower `--confidence` threshold (default 0.5)
2. Check error_count in run details
3. Review source performance (some sources may be failing)
4. Check actor popularity (obscure actors have less info available)
5. Verify API keys are valid for all sources

## Development

### Running Admin Section Locally

1. **Set environment variables**:
   ```bash
   # In .env
   ADMIN_PASSWORD_HASH=$(node -e "console.log(require('bcrypt').hashSync('dev', 10))")
   JWT_SECRET=dev_secret_change_in_production
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Navigate to admin**:
   ```
   http://localhost:5173/admin/login
   ```

4. **Login with password**: `dev` (or whatever you set in step 1)

### Testing

Tests are located alongside source files:

```bash
# Frontend tests
npm test

# Backend tests
cd server && npm test

# Specific test suites
npm test -- admin
```

### Adding New Features

See the phase documentation:
- Stage 1-3: Basic monitoring (complete)
- Stage 4: Review workflow (in development) - see `docs/ADMIN_ENRICHMENT_PHASE4.md`
- Stage 5: Advanced analytics (planned)

## Security Checklist

Before deploying to production:

- [ ] Strong admin password (16+ characters)
- [ ] Unique JWT_SECRET (64+ hex characters)
- [ ] HTTPS enabled (required for secure cookies)
- [ ] `.env` file secured (proper file permissions)
- [ ] `.env` file excluded from version control
- [ ] Admin password not shared with others
- [ ] Audit logging enabled and monitored
- [ ] Regular password rotation schedule
- [ ] Backup of `.env` file in secure location

## Further Reading

- **Architecture**: `docs/ADMIN_ENRICHMENT_PHASE3.md` - Stage 3 implementation details
- **Review Workflow**: `docs/ADMIN_ENRICHMENT_PHASE4.md` - Stage 4 review system
- **Database Schema**: See migration files in `server/migrations/`
- **API Documentation**: See inline JSDoc in `server/src/routes/admin/`
