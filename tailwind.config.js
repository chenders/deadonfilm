/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: '#f5f0e8',
        beige: '#e8dcc8',
        'brown-dark': '#3d2914',
        'brown-medium': '#6b4423',
        'brown-light': '#8b6914',
        accent: '#8b0000',
        'text-primary': '#2c1810',
        'text-muted': '#6b5b4f',
        // Living actors - antique gold palette (replaces Tailwind greens)
        living: {
          DEFAULT: '#b8860b',   // Dark goldenrod - main accent
          light: '#daa520',     // Goldenrod - highlights
          dark: '#6b5010',      // Darker gold for text on light backgrounds (WCAG AA contrast)
          muted: '#c9a227',     // Muted gold for backgrounds
          bg: '#faf6e9',        // Very light cream-gold for cards
          border: '#d4af37',    // Gold border
        },
        // Admin theme colors - reference CSS variables
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
