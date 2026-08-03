import { describe, it, expect, vi } from "vitest"
import { callClaudeForJson, extractClaudeText } from "./claude-json.js"
import { CLAUDE_MODELS } from "../claude-models.js"

/** Mirrors a response from a model with extended thinking enabled. */
function mockClientWithThinking(textResponse: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          { type: "thinking", thinking: "Let me work through the sources...", signature: "abc" },
          { type: "text", text: textResponse },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as any
}

function mockClient(textResponse: string, tokens?: { input?: number; output?: number }) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: textResponse }],
        usage: {
          input_tokens: tokens?.input ?? 100,
          output_tokens: tokens?.output ?? 50,
        },
      }),
    },
  } as any
}

function mockClientNoText() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "image", source: {} }],
        usage: { input_tokens: 100, output_tokens: 0 },
      }),
    },
  } as any
}

function mockClientError(error: Error) {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(error),
    },
  } as any
}

describe("callClaudeForJson", () => {
  const opts = { model: CLAUDE_MODELS.sonnet.id, maxTokens: 1024, prompt: "Return JSON" }

  it("parses a valid JSON response", async () => {
    const client = mockClient('{"name": "John", "age": 30}')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ name: "John", age: 30 })
    expect(result.error).toBeUndefined()
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it("sends a single user message with no assistant prefill", async () => {
    const client = mockClient('{"ok": true}')
    await callClaudeForJson(client, opts)

    const call = client.messages.create.mock.calls[0][0]
    // Models from the 4.6 generation onward reject assistant prefill with a 400.
    expect(call.messages).toEqual([{ role: "user", content: "Return JSON" }])
    expect(call.model).toBe(CLAUDE_MODELS.sonnet.id)
    expect(call.max_tokens).toBe(1024)
  })

  it("passes system parameter when provided", async () => {
    const client = mockClient('{"ok": true}')
    await callClaudeForJson(client, { ...opts, system: "You are a JSON bot" })

    const call = client.messages.create.mock.calls[0][0]
    expect(call.system).toBe("You are a JSON bot")
  })

  it("omits system parameter when not provided", async () => {
    const client = mockClient('{"ok": true}')
    await callClaudeForJson(client, opts)

    const call = client.messages.create.mock.calls[0][0]
    expect(call.system).toBeUndefined()
  })

  it("strips markdown code fences before parsing", async () => {
    const client = mockClient('```json\n{"narrative": "test"}\n```')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ narrative: "test" })
    expect(result.error).toBeUndefined()
  })

  it("repairs minor JSON issues via jsonrepair", async () => {
    const client = mockClient('{"name": "John", "age": 30,}')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ name: "John", age: 30 })
    expect(result.error).toBeUndefined()
  })

  it("returns error when no text block in response", async () => {
    const client = mockClientNoText()
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toBe("No text response from Claude")
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(0)
  })

  it("returns error with rawSnippet when response is completely unparseable", async () => {
    const client = mockClient("Looking at the sources, I can see that...")
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toContain("Failed to parse")
    expect(result.rawSnippet).toBe("Looking at the sources, I can see that...")
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it("recovers the object when the model wraps it in prose", async () => {
    const client = mockClient('Here is the biography:\n{"name": "John", "age": 30}\nLet me know!')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ name: "John", age: 30 })
    expect(result.error).toBeUndefined()
  })

  it("reports a parse failure when the model returns no JSON object", async () => {
    const client = mockClient("I could not find enough information.")
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toContain("no JSON object")
    expect(result.rawSnippet).toBe("I could not find enough information.")
  })

  it("returns error when API call fails", async () => {
    const client = mockClientError(new Error("Rate limit exceeded"))
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toBe("Claude API error: Rate limit exceeded")
    expect(result.inputTokens).toBe(0)
    expect(result.outputTokens).toBe(0)
  })

  it("skips a leading thinking block and parses the text block", async () => {
    const client = mockClientWithThinking('{"narrative": "test", "ok": true}')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ narrative: "test", ok: true })
    expect(result.error).toBeUndefined()
  })

  it("rejects prose that jsonrepair would coerce into an array", async () => {
    // jsonrepair turns this into ["Looking at the sources", "I can see that..."],
    // which parses cleanly. Accepting it would write garbage as enrichment data.
    const client = mockClient("Looking at the sources, I can see that...")
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toContain("Failed to parse")
  })

  it("rejects a bare JSON array", async () => {
    const client = mockClient('["not", "an", "object"]')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    // No `{` at all, so this is caught by extractJsonObject before the shape guard.
    expect(result.error).toContain("no JSON object")
  })

  it("rejects an array of objects rather than silently taking the first element", async () => {
    // Brace-scanning slices `{"name": "John"}, {"name": "Jane"}`, which is not a
    // single valid object. Rejecting is correct: quietly returning the first
    // element would drop data and misrepresent what the model actually produced.
    const client = mockClient('[{"name": "John"}, {"name": "Jane"}]')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toContain("Failed to parse")
  })

  it("returns token counts from response usage", async () => {
    const client = mockClient('{"ok": true}', { input: 3000, output: 1200 })
    const result = await callClaudeForJson(client, opts)

    expect(result.inputTokens).toBe(3000)
    expect(result.outputTokens).toBe(1200)
  })
})

describe("extractClaudeText", () => {
  it("returns the text block when it is the only block", () => {
    const msg = { content: [{ type: "text", text: "hello" }] } as any
    expect(extractClaudeText(msg)).toBe("hello")
  })

  it("skips a leading thinking block", () => {
    const msg = {
      content: [
        { type: "thinking", thinking: "reasoning...", signature: "sig" },
        { type: "text", text: "the answer" },
      ],
    } as any
    expect(extractClaudeText(msg)).toBe("the answer")
  })

  it("returns an empty string when there is no text block", () => {
    const msg = { content: [{ type: "thinking", thinking: "...", signature: "s" }] } as any
    expect(extractClaudeText(msg)).toBe("")
  })

  it("returns an empty string when content is missing or malformed", () => {
    expect(extractClaudeText({} as any)).toBe("")
    expect(extractClaudeText({ content: null } as any)).toBe("")
  })
})
