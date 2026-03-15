/**
 * AI-assisted Wikipedia section selection using Claude Haiku 4.5.
 *
 * Replaces the Gemini-based section selector with Anthropic's Haiku model,
 * keeping the AI vendor consolidated. Returns an `AsyncSectionFilter` callback
 * compatible with debriefer's WikipediaOptions.
 *
 * The filter receives section titles and the full article text, so it can
 * determine the subject and context without needing the actor name upfront.
 *
 * Cost: ~$0.0001 per query using Haiku 4.5
 */

import Anthropic from "@anthropic-ai/sdk"
import type { WikipediaSection, AsyncSectionFilter } from "@debriefer/sources"

const HAIKU_MODEL = "claude-haiku-4-5-20251001"

function buildPrompt(sectionTitles: string[], articleIntro: string): string {
  const formatted = sectionTitles.map((title, i) => `${i + 1}. ${title}`).join("\n")

  return `You are analyzing Wikipedia sections to find death/health/incident information.

Article introduction:
${articleIntro}

Available sections:
${formatted}

Select ALL sections that might contain:
- Death circumstances, date, location, funeral, memorials
- Health conditions, illnesses, medical history, hospitalizations
- Accidents, incidents, injuries (including non-fatal ones that relate to health)
- Assassination attempts, attacks, violence
- Controversies that involved physical harm or health impacts
- Notable incidents that may relate to their eventual death or health decline
- Any section mentioning specific medical conditions, surgeries, or treatments

Return JSON only:
{"sections": ["Section Title 1", "Section Title 2", ...]}

Be inclusive - it's better to include a section that turns out irrelevant than miss important information.
For example, "Hunting and Fishing" might contain info about a hunting accident, "Personal life" might mention health struggles.

IMPORTANT: Return section titles EXACTLY as they appear in the list above. Case matters.`
}

function stripNumberPrefix(title: string): string {
  return title.replace(/^\d+\.\s*/, "")
}

function parseResponse(text: string): string[] | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed.sections)) return null

    return parsed.sections
      .filter((s: unknown): s is string => typeof s === "string")
      .map(stripNumberPrefix)
  } catch {
    return null
  }
}

/**
 * Create an asyncSectionFilter that uses Claude Haiku to select
 * death/health-relevant Wikipedia sections.
 *
 * Uses the article introduction text (first 500 chars) for context
 * instead of requiring the actor name, so it can be shared across
 * subjects in a single orchestrator instance.
 *
 * @param maxSections - Maximum sections to return (default: 10)
 * @returns AsyncSectionFilter callback for WikipediaOptions
 */
export function createHaikuSectionFilter(maxSections = 10): AsyncSectionFilter {
  return async (sections: WikipediaSection[], articleText: string): Promise<WikipediaSection[]> => {
    if (sections.length === 0) return []

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return sections // No API key — return all sections as fallback

    const sectionTitles = sections.map((s) => s.title)
    // Use the first 500 chars of article text as intro context
    const articleIntro = articleText.slice(0, 500)
    const prompt = buildPrompt(sectionTitles, articleIntro)

    try {
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 500,
        temperature: 0.1,
        messages: [{ role: "user", content: prompt }],
      })

      const responseText = response.content[0]?.type === "text" ? response.content[0].text : ""

      const selectedTitles = parseResponse(responseText)
      if (!selectedTitles || selectedTitles.length === 0) return sections

      // Match selected titles back to WikipediaSection objects (case-insensitive)
      const matched = selectedTitles
        .map((selected) => sections.find((s) => s.title.toLowerCase() === selected.toLowerCase()))
        .filter((s): s is WikipediaSection => s !== undefined)

      return matched.slice(0, maxSections)
    } catch {
      // AI failure is non-fatal — return all sections as fallback
      return sections
    }
  }
}
