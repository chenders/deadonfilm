# 07 — Graduated Language Penalty

**Priority**: P2 (Refinement)
**Impact**: 3 | **Difficulty**: 2 | **Feasibility**: 4 | **Confidence**: 3

---

## Problem

The current algorithm applies a flat **0.4× penalty** to all non-English content:

```typescript
// popularity-score.ts:186
const NON_ENGLISH_PENALTY_MULTIPLIER = 0.4
```

This creates two issues:

### Issue 1: All Non-English Content Treated Equally

A Japanese blockbuster (*Spirited Away*), a Spanish-language Netflix hit (*Money Heist*), and an obscure Romanian art film all receive the same 60% penalty. In reality, US audiences have vastly different familiarity with these:
- Japanese anime and South Korean cinema have massive US followings
- Spanish-language content has high penetration due to demographics
- Hindi Bollywood films have a niche but dedicated US audience
- Content in less common languages has genuinely low US recognition

### Issue 2: Penalty Applies to Content, Cascading to Actors

The penalty is applied at the content level (`calculateMoviePopularity` and `calculateShowPopularity`). Since actor scores derive from content scores, actors who primarily appear in non-English content are penalized. An actor famous in global cinema (e.g., someone well-known in Japanese or Korean cinema with significant US crossover appeal) gets penalized even when their actual US recognition is high.

### Note on Double Penalty

Initial analysis suspected a double penalty (applied at both content and actor level). After code review, the penalty is only applied at the content level in `popularity-score.ts`. There is no separate language penalty in the actor calculation or in `aggregate-score.ts`. However, the flat 0.4× at content level is still too aggressive for many languages.

---

## Proposed Solution

### Graduated Penalty by Language/Region

Replace the binary English/non-English multiplier with a lookup table based on actual US market penetration:

```typescript
const LANGUAGE_MULTIPLIERS: Record<string, number> = {
  'en': 1.00,   // English — baseline
  'es': 0.75,   // Spanish — large US Spanish-speaking audience
  'fr': 0.65,   // French — moderate US recognition
  'ja': 0.65,   // Japanese — strong anime/film following
  'ko': 0.65,   // Korean — Korean Wave (K-drama, K-pop crossover)
  'de': 0.55,   // German — moderate recognition
  'it': 0.55,   // Italian — moderate recognition
  'zh': 0.55,   // Chinese — growing US market
  'hi': 0.50,   // Hindi — niche but dedicated Bollywood audience
  'pt': 0.50,   // Portuguese — moderate
  'ru': 0.45,   // Russian — limited mainstream US exposure
  'sv': 0.45,   // Swedish — some recognition (Bergman, Nordic noir)
  'da': 0.45,   // Danish — some recognition (Nordic noir)
}
const DEFAULT_LANGUAGE_MULTIPLIER = 0.35  // Unknown/other languages

function getLanguageMultiplier(language: string | null): number {
  if (!language) return DEFAULT_LANGUAGE_MULTIPLIER
  return LANGUAGE_MULTIPLIERS[language.toLowerCase()] ?? DEFAULT_LANGUAGE_MULTIPLIER
}
```

### Production Country Override

A non-English film produced in the US/UK should get a reduced penalty (it likely had US theatrical distribution):

```typescript
function getEffectiveMultiplier(language: string | null, isUSUKProduction: boolean): number {
  const languageMult = getLanguageMultiplier(language)
  if (isUSUKProduction && languageMult < 0.8) {
    // US/UK production in non-English language gets a boost
    // (e.g., Mel Gibson's "Apocalypto" in Yucatec Maya)
    return Math.min(0.85, languageMult + 0.20)
  }
  return languageMult
}
```

---

## Expected Impact

- **Japanese/Korean blockbusters**: Score increase from 40% of English to 65% — better reflects their actual US audience
- **Spanish-language content**: Significant boost (0.40 → 0.75) reflecting the large US Spanish-speaking market
- **Obscure non-English content**: Slightly more penalized (0.40 → 0.35) — more accurate
- **Actors in non-English cinema**: Better differentiation — an actor famous in Korean cinema scores higher than one famous only in a smaller market

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/lib/popularity-score.ts` | Replace `NON_ENGLISH_PENALTY_MULTIPLIER` and `isEnglishLanguage()` check with graduated `getLanguageMultiplier()` function |
| `server/src/lib/popularity-score.test.ts` | Add tests for each language tier; test production country override |
| `server/scripts/scheduled-popularity-update.ts` | No changes needed (uses library functions) |

---

## Team Assessment

| Specialist | Assessment | Confidence |
|------------|-----------|------------|
| Researcher | "The flat 0.4× penalty is a blunt instrument. Language-specific multipliers better model actual US audience familiarity. The specific values should be validated against streaming/box office data for non-English content in the US market." | 3/5 |
| Mathematician | "Graduated multipliers improve accuracy but introduce a maintenance burden (the lookup table needs periodic updates as cultural penetration changes). An alternative is to derive the multiplier from data (e.g., US box office share by original language)." | 3/5 |
| Salary Specialist | "The Korean Wave and anime boom have dramatically changed US audience familiarity with non-English content since ~2015. The flat 0.4× was probably reasonable in 2010 but is outdated. Spanish-language content getting the same penalty as Finnish content is particularly wrong given US demographics." | 4/5 |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Multiplier values are subjective | Start with conservative values; validate against known crossover hits (e.g., *Parasite*, *Spirited Away*, *Money Heist*) |
| Cultural penetration changes over time | Review multipliers annually; consider deriving from data (US streaming stats by language) |
| Language codes may be inconsistent in TMDB data | Normalize to ISO 639-1 before lookup; handle common variants |
| Some films have multiple languages | Use `original_language` as primary signal (already stored); production country as secondary |
| Increases complexity of content scoring | The lookup table adds ~20 lines of code; complexity is bounded and the function signature stays the same |
