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
  --namespace=dead-on-film \
  --from-literal=TMDB_API_TOKEN=your_tmdb_token \
  --from-literal=ANTHROPIC_API_KEY=your_anthropic_key \
  --from-literal=DATABASE_URL=your_database_url \
  --from-literal=NEW_RELIC_LICENSE_KEY=your_newrelic_key
```

Or update existing secret:

```bash
kubectl patch secret dead-on-film-secrets -n dead-on-film \
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

## Troubleshooting

### Backend agent not starting

1. Check `NEW_RELIC_LICENSE_KEY` is set: `kubectl exec -it <pod> -n dead-on-film -- printenv | grep NEW_RELIC`
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
