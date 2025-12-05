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
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
