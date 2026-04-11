/**
 * Tests for prerender data-fetcher description builders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildActorDescription } from "./data-fetchers.js"

describe("buildActorDescription", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-11T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("builds description for deceased actor with cause and age", () => {
    const result = buildActorDescription({
      name: "James Dean",
      birthday: "1931-02-08",
      deathday: "1955-09-30",
      age_at_death: 24,
      cause_of_death: "car accident",
    })
    expect(result).toBe(
      "James Dean died in 1955 at age 24. Cause of death: car accident. See complete filmography and mortality statistics."
    )
  })

  it("builds description for deceased actor without cause", () => {
    const result = buildActorDescription({
      name: "John Smith",
      birthday: "1920-01-01",
      deathday: "1990-06-15",
      age_at_death: 70,
      cause_of_death: null,
    })
    expect(result).toBe(
      "John Smith died in 1990 at age 70. See complete filmography and mortality statistics."
    )
  })

  it("builds description for deceased actor without age or cause", () => {
    const result = buildActorDescription({
      name: "Unknown Actor",
      birthday: null,
      deathday: "2000-01-01",
      age_at_death: null,
      cause_of_death: null,
    })
    expect(result).toBe(
      "Unknown Actor died in 2000. See complete filmography and mortality statistics."
    )
  })

  it("builds description for living actor with birthday", () => {
    const result = buildActorDescription({
      name: "Helen Mirren",
      birthday: "1945-07-26",
      deathday: null,
      age_at_death: null,
      cause_of_death: null,
    })
    expect(result).toBe(
      "Helen Mirren is alive at age 80. See filmography and which co-stars have passed away."
    )
  })

  it("builds description for living actor without birthday", () => {
    const result = buildActorDescription({
      name: "Mystery Actor",
      birthday: null,
      deathday: null,
      age_at_death: null,
      cause_of_death: null,
    })
    expect(result).toBe(
      "Mystery Actor is alive. See filmography and which co-stars have passed away."
    )
  })

  it("handles age_at_death of 0 correctly", () => {
    const result = buildActorDescription({
      name: "Baby Actor",
      birthday: "2000-01-01",
      deathday: "2000-01-01",
      age_at_death: 0,
      cause_of_death: null,
    })
    expect(result).toContain("at age 0")
  })

  it("handles Date objects from pg driver", () => {
    const result = buildActorDescription({
      name: "Test Actor",
      birthday: new Date("1945-07-26T00:00:00Z"),
      deathday: new Date("2020-03-15T00:00:00Z"),
      age_at_death: 74,
      cause_of_death: "natural causes",
    })
    expect(result).toBe(
      "Test Actor died in 2020 at age 74. Cause of death: natural causes. See complete filmography and mortality statistics."
    )
  })
})
