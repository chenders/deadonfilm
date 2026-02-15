# 08: Add Share/Copy-Link Functionality

**Priority:** #8 (Medium)
**Confidence:** 7/10
**Effort:** Small (1-2 days)
**Dependencies:** None

## Problem

The site's content is inherently shareable -- dark humor, surprising death statistics, curse scores -- but there's no way to easily share a page. Users must manually copy the URL from the browser address bar.

This is a missed growth opportunity. Movie/show pages with high curse scores and actor pages with dramatic death details are natural conversation starters.

## Solution

### UX Design

Add a share button to detail pages (movies, shows, actors). The button uses the Web Share API on mobile (native share sheet) and clipboard copy on desktop.

**Button placement:** In the page header area, near the title. Small and unobtrusive.

```
┌─────────────────────────────────────────┐
│  The Conqueror (1956)            [🔗]   │
│  Directed by Dick Powell                 │
│  Curse Score: +3.2                       │
└─────────────────────────────────────────┘
```

**Share behavior:**

| Platform | Action | Feedback |
|----------|--------|----------|
| Mobile (Web Share API) | Opens native share sheet | Native UI |
| Desktop | Copies URL to clipboard | Toast: "Link copied!" |
| Desktop (no clipboard) | Shows URL in a tooltip to manually copy | Tooltip with URL |

**Share content:**

```
Title: "The Conqueror (1956) - Dead on Film"
Text: "6 of 48 cast members have died. Curse Score: +3.2"
URL: https://deadonfilm.com/movie/the-conqueror-1956-28466
```

## Technical Implementation

### New Component: ShareButton

**File:** `src/components/common/ShareButton.tsx` (new)

```tsx
interface ShareButtonProps {
  title: string
  text?: string
  url?: string  // defaults to window.location.href
  className?: string
}

export function ShareButton({ title, text, url }: ShareButtonProps) {
  const shareUrl = url || window.location.href

  const handleShare = async () => {
    if (navigator.share) {
      // Mobile: use native share sheet
      await navigator.share({ title, text, url: shareUrl })
    } else {
      // Desktop: copy to clipboard
      await navigator.clipboard.writeText(shareUrl)
      // Show toast notification
      toast("Link copied!")
    }
  }

  return (
    <button onClick={handleShare} aria-label="Share this page">
      <LinkIcon className="w-4 h-4" />
    </button>
  )
}
```

### Page Integrations

Add ShareButton to detail pages with contextual share text:

**Movie pages:**
```tsx
<ShareButton
  title={`${movie.title} (${year}) - Dead on Film`}
  text={`${deadCount} of ${castCount} cast members have died. Curse Score: ${curseScore}`}
/>
```

**Actor pages:**
```tsx
<ShareButton
  title={`${actor.name} - Dead on Film`}
  text={actor.deathday
    ? `${actor.name} died ${deathYear}, age ${age}. ${causeOfDeath}`
    : `${actor.name} - filmography and mortality stats`}
/>
```

**Show pages:**
```tsx
<ShareButton
  title={`${show.name} (${year}) - Dead on Film`}
  text={`${deadCount} cast members have died across ${seasonCount} seasons`}
/>
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/common/ShareButton.tsx` (new) | Share button component |
| Movie page component | Add ShareButton with movie-specific text |
| Actor page component | Add ShareButton with actor-specific text |
| Show page component | Add ShareButton with show-specific text |

## Anti-Patterns

1. **Don't add social media-specific share buttons** (Twitter, Facebook, etc.) -- The Web Share API handles this natively on mobile. Individual social buttons add clutter and maintenance burden.
2. **Don't auto-generate Open Graph images** -- OG meta tags are sufficient for link previews. Custom image generation is a separate, larger project.
3. **Don't make the share button prominent** -- It should be available but not compete with the page's primary content. A small icon button is enough.
4. **Don't share without user action** -- Never auto-copy or auto-share. Always require an explicit click.
