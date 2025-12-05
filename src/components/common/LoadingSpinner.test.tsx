import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingSpinner from './LoadingSpinner'

describe('LoadingSpinner', () => {
  it('displays default loading message', () => {
    render(<LoadingSpinner />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('displays custom loading message', () => {
    render(<LoadingSpinner message="Fetching movie data..." />)

    expect(screen.getByText('Fetching movie data...')).toBeInTheDocument()
  })

  it('renders the spinner element', () => {
    const { container } = render(<LoadingSpinner />)

    // Find the animated spinner div
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })
})
