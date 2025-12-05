import { describe, it, expect } from 'vitest'
import { isVagueCause } from './claude.js'

describe('isVagueCause', () => {
  it('returns true for null', () => {
    expect(isVagueCause(null)).toBe(true)
  })

  it('returns true for "disease"', () => {
    expect(isVagueCause('disease')).toBe(true)
  })

  it('returns true for "illness"', () => {
    expect(isVagueCause('illness')).toBe(true)
  })

  it('returns true for "natural causes"', () => {
    expect(isVagueCause('natural causes')).toBe(true)
  })

  it('returns true for "natural cause"', () => {
    expect(isVagueCause('natural cause')).toBe(true)
  })

  it('returns true for "unspecified"', () => {
    expect(isVagueCause('unspecified')).toBe(true)
  })

  it('returns true for "unknown"', () => {
    expect(isVagueCause('unknown')).toBe(true)
  })

  it('returns true for case-insensitive matches', () => {
    expect(isVagueCause('DISEASE')).toBe(true)
    expect(isVagueCause('Natural Causes')).toBe(true)
    expect(isVagueCause('UNKNOWN')).toBe(true)
  })

  it('returns true when vague cause is part of string', () => {
    expect(isVagueCause('died of disease')).toBe(true)
    expect(isVagueCause('natural causes at age 90')).toBe(true)
    expect(isVagueCause('cause unknown')).toBe(true)
  })

  it('returns false for specific causes', () => {
    expect(isVagueCause('lung cancer')).toBe(false)
    expect(isVagueCause('heart attack')).toBe(false)
    expect(isVagueCause('myocardial infarction')).toBe(false)
    expect(isVagueCause('complications from diabetes')).toBe(false)
    expect(isVagueCause('stroke')).toBe(false)
    expect(isVagueCause('pneumonia')).toBe(false)
    expect(isVagueCause('COVID-19')).toBe(false)
    expect(isVagueCause('car accident')).toBe(false)
    expect(isVagueCause('suicide')).toBe(false)
    expect(isVagueCause('overdose')).toBe(false)
  })

  it('returns false for detailed medical causes', () => {
    expect(isVagueCause('pancreatic cancer')).toBe(false)
    expect(isVagueCause('amyotrophic lateral sclerosis')).toBe(false)
    expect(isVagueCause('kidney failure')).toBe(false)
    expect(isVagueCause('liver cirrhosis')).toBe(false)
  })
})

// Note: We don't test getCauseOfDeathFromClaude directly because it requires
// actual API calls. In a production setting, you would mock the Anthropic client
// to test the parsing and error handling logic.
