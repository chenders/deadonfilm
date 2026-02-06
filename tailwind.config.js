/** @type {import('tailwindcss').Config} */

function colorVar(cssVar) {
  return `color-mix(in srgb, var(${cssVar}) calc(<alpha-value> * 100%), transparent)`
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core surfaces
        cream: colorVar('--surface-base'),
        beige: colorVar('--surface-muted'),
        'surface-elevated': colorVar('--surface-elevated'),
        'surface-inset': colorVar('--surface-inset'),

        // Browns (structural)
        'brown-dark': colorVar('--brown-dark'),
        'brown-medium': colorVar('--brown-medium'),
        'brown-light': colorVar('--brown-light'),

        // Accent / Deceased
        accent: colorVar('--deceased-primary'),

        // Text
        'text-primary': colorVar('--text-primary'),
        'text-muted': colorVar('--text-muted'),

        // Living actors - antique gold palette
        living: {
          DEFAULT: colorVar('--living-primary'),
          light: colorVar('--living-light'),
          dark: colorVar('--living-dark'),
          muted: colorVar('--living-muted'),
          bg: colorVar('--living-bg'),
          border: colorVar('--living-border'),
        },

        // Lifespan indicators
        'lifespan-early': colorVar('--lifespan-early'),
        'lifespan-longer': colorVar('--lifespan-longer-fill'),
        'lifespan-longer-text': colorVar('--lifespan-longer-text'),
        'lifespan-track': colorVar('--lifespan-early-track'),

        // Years lost text
        'years-lost': colorVar('--years-lost'),

        // Status (toasts)
        'status-success': colorVar('--status-success'),
        'status-success-border': colorVar('--status-success-border'),
        'status-error': colorVar('--status-error'),
        'status-error-border': colorVar('--status-error-border'),
        'status-warning': colorVar('--status-warning'),
        'status-warning-border': colorVar('--status-warning-border'),
        'status-info': colorVar('--status-info'),
        'status-info-border': colorVar('--status-info-border'),

        // Confidence indicators
        'confidence-high': colorVar('--confidence-high'),
        'confidence-medium': colorVar('--confidence-medium'),
        'confidence-low': colorVar('--confidence-low'),
        'confidence-disputed': colorVar('--confidence-disputed'),
        'confidence-inactive': colorVar('--confidence-inactive'),

        // Warning banner
        'warning-bg': colorVar('--warning-bg'),
        'warning-border': colorVar('--warning-border'),
        'warning-text-strong': colorVar('--warning-text-strong'),
        'warning-text': colorVar('--warning-text'),
        'warning-icon': colorVar('--warning-icon'),

        // Disabled state
        disabled: colorVar('--disabled-bg'),
        'disabled-text': colorVar('--disabled-text'),

        // Overlays
        overlay: colorVar('--overlay'),
        'overlay-text': colorVar('--overlay-text'),

        // Admin theme colors - reference CSS variables (UNCHANGED)
        admin: {
          'surface-base': 'var(--admin-surface-base)',
          'surface-elevated': 'var(--admin-surface-elevated)',
          'surface-overlay': 'var(--admin-surface-overlay)',
          'surface-inset': 'var(--admin-surface-inset)',
          'border': 'var(--admin-surface-border)',
          'border-subtle': 'var(--admin-surface-border-subtle)',
          'text-primary': 'var(--admin-text-primary)',
          'text-secondary': 'var(--admin-text-secondary)',
          'text-muted': 'var(--admin-text-muted)',
          'text-inverse': 'var(--admin-text-inverse)',
          'interactive': 'var(--admin-interactive-primary)',
          'interactive-hover': 'var(--admin-interactive-primary-hover)',
          'interactive-active': 'var(--admin-interactive-primary-active)',
          'interactive-secondary': 'var(--admin-interactive-secondary)',
          'interactive-secondary-hover': 'var(--admin-interactive-secondary-hover)',
          'success': 'var(--admin-success)',
          'success-muted': 'var(--admin-success-muted)',
          'success-bg': 'var(--admin-success-bg)',
          'warning': 'var(--admin-warning)',
          'warning-muted': 'var(--admin-warning-muted)',
          'warning-bg': 'var(--admin-warning-bg)',
          'danger': 'var(--admin-danger)',
          'danger-muted': 'var(--admin-danger-muted)',
          'danger-bg': 'var(--admin-danger-bg)',
          'info': 'var(--admin-info)',
          'info-muted': 'var(--admin-info-muted)',
          'info-bg': 'var(--admin-info-bg)',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'admin-sm': 'var(--admin-shadow-sm)',
        'admin-md': 'var(--admin-shadow-md)',
        'admin-lg': 'var(--admin-shadow-lg)',
      },
    },
  },
  plugins: [],
}
