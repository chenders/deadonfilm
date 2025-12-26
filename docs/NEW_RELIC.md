# New Relic Integration

This project supports optional New Relic monitoring for both backend (APM) and frontend (Browser) performance tracking.

## Overview

- **Backend APM**: Tracks Express routes, database queries, and external API calls (TMDB, Claude, Wikidata)
- **Browser Monitoring**: Tracks page load times, JavaScript errors, and user sessions in the React SPA
- **Kubernetes Monitoring**: Tracks cluster health, pod metrics, and logs via the New Relic nri-bundle

Both are optional - the application works fine without New Relic configured.

## Backend APM Setup

### 1. Get Your License Key

1. Log in to [New Relic](https://one.newrelic.com/)
2. Click your account name (top right) > **API keys**
3. Create or copy an **Ingest - License** key

### 2. Configure Environment Variables

**Local development:** Add to `server/.env`:

```
NEW_RELIC_LICENSE_KEY=your_license_key_here
NEW_RELIC_APP_NAME=Dead on Film (Dev)
```

**Production (Kubernetes):** Add to the secrets:

```bash
kubectl create secret generic dead-on-film-secrets \
  --namespace=deadonfilm \
  --from-literal=TMDB_API_TOKEN=your_tmdb_token \
  --from-literal=ANTHROPIC_API_KEY=your_anthropic_key \
  --from-literal=DATABASE_URL=your_database_url \
  --from-literal=NEW_RELIC_LICENSE_KEY=your_newrelic_key
```

Or update existing secret:

```bash
kubectl patch secret dead-on-film-secrets -n deadonfilm \
  --type='json' \
  -p='[{"op": "add", "path": "/data/NEW_RELIC_LICENSE_KEY", "value": "'$(echo -n 'your_key' | base64)'"}]'
```

### What's Automatically Tracked

- All Express route response times (`/api/search`, `/api/movie/:id`, etc.)
- External HTTP calls (TMDB API, Wikidata SPARQL, Claude API)
- PostgreSQL database queries
- Errors and exceptions

## Browser Monitoring Setup

The frontend uses the `@newrelic/browser-agent` npm package, which is bundled with the app for better integration with React/Vite.

### 1. Create a Browser Application

1. In New Relic, go to **Add data** > **Browser monitoring**
2. Select **Copy/Paste JavaScript code** method
3. Choose **Pro + SPA** agent (for React single-page app)
4. Name your application (e.g., "Dead on Film Browser")
5. Note your **Application ID**, **Account ID**, and **Browser License Key**

### 2. Configure Environment Variables

Add to `.env.production` before building the Docker image:

```
VITE_NEW_RELIC_BROWSER_LICENSE_KEY=NRJS-xxxxxxxxxxxxxxxxxxxx
VITE_NEW_RELIC_BROWSER_APP_ID=1234567890
VITE_NEW_RELIC_BROWSER_ACCOUNT_ID=1234567
```

These values are baked into the frontend JavaScript bundle at build time (similar to Google Analytics).

Note: These are not secrets - they're visible in browser source code. This is expected and safe.

### What's Tracked

- Page load performance (LCP, FID, CLS web vitals)
- JavaScript errors
- AJAX/fetch request timing
- SPA route changes
- User sessions

## Viewing Data in New Relic

### APM (Backend)

1. Go to **APM & Services**
2. Select "Dead on Film"
3. View transactions, errors, and external services

### Browser (Frontend)

1. Go to **Browser**
2. Select "Dead on Film Browser"
3. View page views, JavaScript errors, and session traces

## Disabling New Relic

**Backend:** Remove or leave empty `NEW_RELIC_LICENSE_KEY`. The agent will log a message and skip initialization.

**Frontend:** Remove or leave empty the `VITE_NEW_RELIC_BROWSER_*` variables. No scripts will be loaded.

## Custom Instrumentation (Optional)

### Backend Custom Events

```typescript
import { recordCustomEvent, addCustomAttribute } from './lib/newrelic.js'

// Record a custom event
recordCustomEvent('MovieSearch', {
  query: searchTerm,
  resultCount: results.length
})

// Add attribute to current transaction
addCustomAttribute('movieId', movieId)
```

### Frontend Page Actions

```typescript
import { trackPageAction, trackError } from '../hooks/useNewRelicBrowser'

// Track a custom action
trackPageAction('search_performed', { query: searchTerm })

// Track an error
try {
  // ... some code
} catch (error) {
  trackError(error as Error, { context: 'search' })
}
```

## Custom Events Reference

The application tracks the following custom events automatically:

### Backend Events

| Event | Attributes | Description |
|-------|-----------|-------------|
| `Search` | query, type, resultCount, responseTimeMs | Searches performed |
| `MovieView` | tmdbId, title, releaseYear, deceasedCount, livingCount, expectedDeaths, curseScore, responseTimeMs | Movie page views |
| `ShowView` | tmdbId, name, firstAirYear, deceasedCount, livingCount, expectedDeaths, curseScore, isEnded, responseTimeMs | TV show page views |
| `ActorView` | tmdbId, name, isDeceased, filmographyCount, hasCauseOfDeath, responseTimeMs | Individual actor profile views |
| `CursedMoviesQuery` | page, fromDecade, toDecade, minDeaths, includeObscure, resultCount, totalCount, responseTimeMs | Cursed movies list queries |
| `CursedActorsQuery` | page, status, fromYear, toYear, minMovies, resultCount, totalCount, responseTimeMs | Cursed actors list queries |
| `CovidDeathsQuery` | page, includeObscure, resultCount, totalCount, responseTimeMs | COVID deaths list queries |
| `DeathsByCauseQuery` | cause, page, includeObscure, resultCount, totalCount, responseTimeMs | Deaths filtered by cause of death |
| `DeathsByDecadeQuery` | decade, page, includeObscure, resultCount, totalCount, responseTimeMs | Deaths filtered by decade |
| `AllDeathsQuery` | page, includeObscure, resultCount, totalCount, responseTimeMs | All recorded deaths list queries |
| `CauseOfDeathLookup` | personName, source, success, hasDetails | Death info lookups (source: claude/wikipedia/none) |

### Frontend Events (Page Actions)

| Event | Attributes | Description |
|-------|-----------|-------------|
| `view_death_details` | actorName, causeOfDeath | User views death details tooltip (hover/click) |

### Example NRQL Queries

```sql
-- Search analytics
SELECT count(*) FROM Search FACET type SINCE 1 day ago

-- Most viewed movies
SELECT count(*) FROM MovieView FACET title SINCE 1 week ago LIMIT 20

-- Cause of death source breakdown
SELECT count(*) FROM CauseOfDeathLookup FACET source SINCE 1 day ago

-- Average response times by endpoint
SELECT average(responseTimeMs) FROM MovieView, ShowView, Search FACET eventType SINCE 1 hour ago TIMESERIES
```

## Updating nri-bundle

Check current version:

```bash
helm list -n deadonfilm | grep newrelic
```

Update to latest:

```bash
helm repo update newrelic
helm upgrade newrelic-bundle newrelic/nri-bundle \
  -n deadonfilm \
  --values k8s/values.yaml \
  --values k8s/values-secrets.yaml
```

## Neon Database Monitoring (Optional)

Neon PostgreSQL supports OpenTelemetry for sending database metrics to New Relic.

**Prerequisite:** Requires Neon Scale or Business plan (not available on Launch plan).

### Setup

1. In Neon Console, go to your project → **Integrations** → **OpenTelemetry**
2. Configure:
   - **Telemetry to export:** Metrics + Postgres logs
   - **Connection:** HTTP
   - **Endpoint:** `https://otlp.nr-data.net`
   - **Authentication:** Bearer
   - **Bearer Token:** Your New Relic License Key
   - **Resource attributes:** `service.name: neon-deadonfilm`
3. Click **Save**

### Available Metrics

- Query latency
- Connection pool usage
- Storage consumption
- Compute utilization

See: https://neon.com/guides/newrelic-otel-neon

## Troubleshooting

### Backend agent not starting

1. Check `NEW_RELIC_LICENSE_KEY` is set: `kubectl exec -it <pod> -n deadonfilm -- printenv | grep NEW_RELIC`
2. Check server logs for "New Relic APM initialized" or error messages
3. Ensure `newrelic.cjs` exists in the server directory

### Browser data not appearing

1. Check browser console for errors during New Relic initialization
2. Verify all three `VITE_NEW_RELIC_BROWSER_*` variables are set in `.env.production`
3. Rebuild the Docker image after adding the variables (they're baked in at build time)
4. Check Network tab for requests to `bam.nr-data.net`
5. Data may take 1-2 minutes to appear in New Relic UI

### Data not showing in New Relic dashboard

1. Verify the license key is correct and active
2. Check that data is being sent (Network tab shows requests to New Relic endpoints)
3. Wait 2-3 minutes for data to propagate
4. Ensure you're looking at the correct application/account in New Relic

## Kubernetes Monitoring Setup

The project includes Helm configuration for the New Relic Kubernetes integration (`nri-bundle`), which provides cluster-level monitoring including pod metrics, events, and logs.

### 1. Create Secrets File

Copy the example secrets file and add your license key:

```bash
cp k8s/values-secrets.yaml.example k8s/values-secrets.yaml
```

Edit `k8s/values-secrets.yaml`:

```yaml
global:
  licenseKey: YOUR_NEW_RELIC_LICENSE_KEY_HERE
```

**Important:** `k8s/values-secrets.yaml` is gitignored and should never be committed.

### 2. Install the New Relic Bundle

```bash
helm repo add newrelic https://helm-charts.newrelic.com
helm repo update

helm upgrade --install newrelic-bundle newrelic/nri-bundle \
  -n deadonfilm \
  --values k8s/values.yaml \
  --values k8s/values-secrets.yaml
```

### 3. Apply Instrumentation (Optional)

For automatic APM injection into pods:

```bash
kubectl apply -f k8s/instrumentation.yaml -n deadonfilm
```

### What's Tracked

- Pod/container CPU and memory metrics
- Kubernetes events
- Container logs (via Fluent Bit)
- Prometheus metrics
- Cluster state (via kube-state-metrics)

### Updating Configuration

The main configuration is in `k8s/values.yaml`. Key settings:

- `global.cluster`: Cluster name shown in New Relic
- `global.provider`: Set to `GKE_AUTOPILOT` for GKE Autopilot clusters
- `global.lowDataMode`: Reduces data sent to save costs
- `k8s-agents-operator.enabled`: Enables automatic APM injection

### Uninstalling

```bash
helm uninstall newrelic-bundle -n deadonfilm
```

## Deployment Markers

Deployment markers appear on New Relic charts to show when deployments occurred, making it easy to correlate performance changes with releases.

A GitHub Actions workflow (`.github/workflows/nr-mark-deployment.yml`) automatically creates deployment markers after each successful deploy to GKE.

### Required GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

1. **`NEW_RELIC_API_KEY`** - A User API key (not the License key)
   - Go to [New Relic API Keys](https://one.newrelic.com/api-keys)
   - Click **Create a key**
   - Select **User** as the key type
   - Name it (e.g., "GitHub Actions Deployment Marker")
   - Copy the key value

2. **`NEW_RELIC_DEPLOYMENT_ENTITY_GUID`** - The Entity GUID for your APM application
   - Go to **APM & Services** → **Dead on Film**
   - Look at the URL - it contains the GUID: `https://one.newrelic.com/nr1-core?...&entityGuid=XXXXXXX`
   - Or click the app name, then **See metadata** to find the Entity GUID

### Viewing Deployment Markers

Once configured, deployment markers will appear:
- On APM charts as vertical lines
- In **APM & Services** → **Dead on Film** → **Deployments** tab
- Each marker includes the commit SHA, deploying user, and branch name
