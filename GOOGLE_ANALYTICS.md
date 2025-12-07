# Google Analytics Setup

This project supports optional Google Analytics 4 (GA4) tracking. When configured, it tracks page views and user interactions.

## Setup

### 1. Create a GA4 Property

1. Go to [Google Analytics](https://analytics.google.com/)
2. Click **Admin** (gear icon)
3. Click **Create Property**
4. Enter a property name (e.g., "Dead on Film")
5. Configure your business details and click **Create**

### 2. Create a Web Data Stream

1. In your new property, go to **Data Streams**
2. Click **Add stream** > **Web**
3. Enter your website URL and stream name
4. Click **Create stream**

### 3. Get Your Measurement ID

After creating the stream, you'll see a **Measurement ID** starting with `G-` (e.g., `G-XXXXXXXXXX`).

### 4. Configure the Environment Variable

**Local development:** Add to `.env` in the project root:

```
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Production (Docker/Kubernetes):** Create a `.env.production` file before building the Docker image:

```
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

This file is copied into the Docker image at build time and is gitignored (not committed to the repository). Since `VITE_*` variables are embedded by Vite during the build, the value is baked into the frontend JavaScript bundle.

Note: The GA measurement ID is not a secret—it's visible in the browser source code. This is expected and safe.

## Events Tracked

| Event | Description | Parameters |
|-------|-------------|------------|
| `page_view` | Automatic on route changes | `page_path`, `page_title` |
| `search_select` | User selects a movie from search | `search_term`, `movie_title`, `movie_id` |
| `view_death_details` | User hovers to see cause of death details | `actor_name`, `cause_of_death` |
| `click_external_link` | User clicks Wikipedia/TMDB link | `actor_name`, `link_type`, `link_url` |

## How It Works

The implementation uses event delegation with data attributes:

- A single document-level listener captures all tracking events
- Elements use `data-track-event` and `data-track-params` attributes
- No tracking code runs if `VITE_GA_MEASUREMENT_ID` is not set

## Viewing Analytics

1. Go to [Google Analytics](https://analytics.google.com/)
2. Select your property
3. **Reports** > **Realtime** for live data
4. **Reports** > **Engagement** > **Events** for historical data

Custom events (`search_select`, `view_death_details`, `click_external_link`) appear in the Events report after users trigger them.

## Disabling Analytics

To disable analytics, simply remove or leave empty the `VITE_GA_MEASUREMENT_ID` environment variable. No tracking scripts will be loaded.
