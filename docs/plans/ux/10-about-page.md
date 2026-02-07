# 10: Add About/Explanation Page

**Priority:** #10 (Medium)
**Confidence:** 6/10
**Effort:** Small (1-2 days)
**Dependencies:** Site Navigation (#03) -- to add the About link to nav/footer

## Problem

The site uses specialized metrics -- Curse Score, Years Lost, Expected Deaths -- that are domain-specific and not self-explanatory. There is no page explaining:

- What these metrics mean and how they're calculated
- Where the data comes from (TMDB, SSA actuarial tables, Wikidata)
- What the site's purpose is beyond the tagline
- How "obscure" filtering works

The home page `SearchBar` component contains a brief explanation of curse scores, but it's buried in the search UI and not discoverable from other pages.

## Solution

### UX Design

Create an `/about` page with clear, accessible explanations. Match the site's dark humor tone while being genuinely informative.

### Page Structure

```
/about

# About Dead on Film

Brief intro: what the site does and why

## How It Works
- We track every actor in every movie and TV show
- When an actor dies, we record it
- We calculate how "cursed" each production is

## The Numbers

### Curse Score
What it means, how it's calculated
Formula: (Actual Deaths - Expected Deaths) / Expected Deaths

### Expected Deaths
Based on SSA actuarial life tables
Each actor's age at filming → probability of dying by now

### Years Lost
Expected lifespan minus actual lifespan
Positive = died earlier than expected

## Data Sources
- TMDB (The Movie Database) - cast, crew, and production data
- SSA Actuarial Life Tables - mortality probabilities
- Wikidata / Wikipedia - death details and causes

## What's Excluded
- Archived footage (actors who died 3+ years before release)
- Obscure content (low popularity, no poster, tiny cast)

## FAQ
Q: Why is [movie] so cursed?
Q: How accurate are the death predictions?
Q: Where do cause of death details come from?
```

## Technical Implementation

### New Page Component

**File:** `src/pages/AboutPage.tsx` (new)

Static content page. No API calls needed -- all content is hardcoded explanatory text.

Use the existing page layout patterns:
- `max-w-3xl mx-auto` for content width
- Tailwind typography classes for readable text
- Section headers with anchors for deep linking

```tsx
export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-display italic text-brown-dark mb-6">
        About Dead on Film
      </h1>

      <section className="prose prose-brown">
        {/* Content sections */}
      </section>
    </div>
  )
}
```

### Route Registration

**File:** `src/App.tsx`

Add route:

```tsx
<Route path="/about" element={<AboutPage />} />
```

### Navigation Links

**File:** `src/components/layout/Footer.tsx`

Add "About" link to footer (after Site Navigation #03 is implemented, also add to mobile menu).

### SEO

Add appropriate meta tags:

```tsx
<Helmet>
  <title>About - Dead on Film</title>
  <meta name="description" content="How Dead on Film calculates curse scores, expected deaths, and years lost using SSA actuarial life tables and TMDB data." />
</Helmet>
```

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/AboutPage.tsx` (new) | About page component |
| `src/App.tsx` | Add `/about` route |
| `src/components/layout/Footer.tsx` | Add About link |
| `server/src/routes/sitemap.ts` | Add `/about` to static pages |

## Content Notes

### Tone

The about page should match the site's existing dark humor:
- **Yes**: "We track every actor who has shuffled off this mortal coil"
- **No**: "This website provides mortality statistics for entertainment industry professionals"

Keep the humor dry and factual. The data itself is morbid enough -- heavy-handed jokes would undermine credibility.

### Metric Explanations

Pull formula details from `server/src/lib/mortality-stats.ts` and the existing CLAUDE.md documentation:

| Metric | Formula | Plain English |
|--------|---------|---------------|
| Expected Deaths | Sum of P(death) per actor | How many cast members we'd expect to have died by now, based on their ages |
| Curse Score | (Actual - Expected) / Expected | How far above or below the expected death count. Positive = "cursed" |
| Years Lost | Expected Lifespan - Actual | How many years earlier than expected someone died |

## Anti-Patterns

1. **Don't write an academic paper** -- Keep explanations conversational and brief. Link to SSA tables for the technically curious.
2. **Don't explain every edge case** -- The about page is for general understanding. Implementation details belong in code comments.
3. **Don't add a FAQ section initially** -- Wait for actual user questions to accumulate. Speculative FAQs often miss the mark.
4. **Don't add a contact form** -- There's no user account system and no need for one. A GitHub link is sufficient for feedback.
