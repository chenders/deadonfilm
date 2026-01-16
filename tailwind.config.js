/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Legacy colors (keep for gradual migration)
        cream: '#f5f0e8',
        beige: '#e8dcc8',
        'brown-dark': '#3d2914',
        'brown-medium': '#6b4423',
        'brown-light': '#8b6914',
        accent: '#8b0000',
        'text-primary': '#2c1810',
        'text-muted': '#6b5b4f',
        // Living actors - antique gold palette
        living: {
          DEFAULT: '#b8860b',
          light: '#daa520',
          dark: '#6b5010',
          muted: '#c9a227',
          bg: '#faf6e9',
          border: '#d4af37',
        },
        // Semantic tokens - auto-switch light/dark via CSS variables
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          elevated: 'rgb(var(--color-surface-elevated) / <alpha-value>)',
          muted: 'rgb(var(--color-surface-muted) / <alpha-value>)',
        },
        foreground: {
          DEFAULT: 'rgb(var(--color-foreground) / <alpha-value>)',
          muted: 'rgb(var(--color-foreground-muted) / <alpha-value>)',
        },
        'border-theme': 'rgb(var(--color-border-theme) / <alpha-value>)',
        'accent-adaptive': 'rgb(var(--color-accent-semantic) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
