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
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
