import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MortalityScore from './MortalityScore'

describe('MortalityScore', () => {
  it('displays mortality percentage', () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 7,
      livingCount: 3,
      mortalityPercentage: 70,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText('70%')).toBeInTheDocument()
  })

  it('displays deceased count', () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 7,
      livingCount: 3,
      mortalityPercentage: 70,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('deceased')).toBeInTheDocument()
  })

  it('displays living count', () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 7,
      livingCount: 3,
      mortalityPercentage: 70,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('living')).toBeInTheDocument()
  })

  it('displays total cast count', () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 7,
      livingCount: 3,
      mortalityPercentage: 70,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('total')).toBeInTheDocument()
  })

  it('handles 0% mortality', () => {
    const stats = {
      totalCast: 5,
      deceasedCount: 0,
      livingCount: 5,
      mortalityPercentage: 0,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('handles 100% mortality', () => {
    const stats = {
      totalCast: 12,
      deceasedCount: 12,
      livingCount: 0,
      mortalityPercentage: 100,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('displays the correct description text', () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 5,
      livingCount: 5,
      mortalityPercentage: 50,
    }

    render(<MortalityScore stats={stats} />)

    expect(screen.getByText('of the cast has passed away')).toBeInTheDocument()
  })

  it('renders mortality bar with correct width', () => {
    const stats = {
      totalCast: 10,
      deceasedCount: 6,
      livingCount: 4,
      mortalityPercentage: 60,
    }

    const { container } = render(<MortalityScore stats={stats} />)

    // Find the inner bar that shows mortality percentage
    const mortalityBar = container.querySelector('[style*="width: 60%"]')
    expect(mortalityBar).toBeInTheDocument()
  })
})
