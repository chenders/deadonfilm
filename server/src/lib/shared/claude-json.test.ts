import { describe, it, expect, vi } from "vitest"
import { callClaudeForJson } from "./claude-json.js"

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
  const opts = { model: "claude-sonnet-4-20250514", maxTokens: 1024, prompt: "Return JSON" }

  it("parses valid JSON response (prefill prepends opening brace)", async () => {
    const client = mockClient('"name": "John", "age": 30}')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ name: "John", age: 30 })
    expect(result.error).toBeUndefined()
    expect(result.inputTokens).toBe(100)
    expect(result.outputTokens).toBe(50)
  })

  it("sends assistant prefill in messages", async () => {
    const client = mockClient('"ok": true}')
    await callClaudeForJson(client, opts)

    const call = client.messages.create.mock.calls[0][0]
    expect(call.messages).toEqual([
      { role: "user", content: "Return JSON" },
      { role: "assistant", content: "{" },
    ])
    expect(call.model).toBe("claude-sonnet-4-20250514")
    expect(call.max_tokens).toBe(1024)
  })

  it("passes system parameter when provided", async () => {
    const client = mockClient('"ok": true}')
    await callClaudeForJson(client, { ...opts, system: "You are a JSON bot" })

    const call = client.messages.create.mock.calls[0][0]
    expect(call.system).toBe("You are a JSON bot")
  })

  it("omits system parameter when not provided", async () => {
    const client = mockClient('"ok": true}')
    await callClaudeForJson(client, opts)

    const call = client.messages.create.mock.calls[0][0]
    expect(call.system).toBeUndefined()
  })

  it("strips markdown code fences before parsing", async () => {
    const client = mockClient('```json\n"narrative": "test"}\n```')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ narrative: "test" })
    expect(result.error).toBeUndefined()
  })

  it("repairs minor JSON issues via jsonrepair", async () => {
    const client = mockClient('"name": "John", "age": 30,}')
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

  it("handles response that already starts with { (Claude ignores prefill)", async () => {
    const client = mockClient('{"name": "John", "age": 30}')
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toEqual({ name: "John", age: 30 })
    expect(result.error).toBeUndefined()
  })

  it("returns error when API call fails", async () => {
    const client = mockClientError(new Error("Rate limit exceeded"))
    const result = await callClaudeForJson(client, opts)

    expect(result.data).toBeNull()
    expect(result.error).toBe("Claude API error: Rate limit exceeded")
    expect(result.inputTokens).toBe(0)
    expect(result.outputTokens).toBe(0)
  })

  it("returns token counts from response usage", async () => {
    const client = mockClient('"ok": true}', { input: 3000, output: 1200 })
    const result = await callClaudeForJson(client, opts)

    expect(result.inputTokens).toBe(3000)
    expect(result.outputTokens).toBe(1200)
  })
})
