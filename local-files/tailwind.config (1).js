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
        // ===== SEMANTIC SURFACE TOKENS =====
        // These auto-switch via CSS variables
        surface: {
          base: 'var(--surface-base)',
          elevated: 'var(--surface-elevated)',
          muted: 'var(--surface-muted)',
          inset: 'var(--surface-inset)',
        },
        
        // ===== TEXT TOKENS =====
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        
        // ===== DECEASED (MORTALITY) SEMANTIC COLORS =====
        deceased: {
          DEFAULT: 'var(--deceased-primary)',
          hover: 'var(--deceased-hover)',
          bg: 'var(--deceased-bg)',
          border: 'var(--deceased-border)',
          'tab-active': 'var(--deceased-tab-active)',
          // Static values for reference/fallback
          light: {
            DEFAULT: '#8b0000',
            hover: '#6b0000',
            bg: '#faf5f5',
            border: '#d4a5a5',
          },
          dark: {
            DEFAULT: '#e85c5c',
            hover: '#ff7070',
            bg: '#2a1f1f',
            border: '#5c3838',
          },
        },
        
        // ===== LIVING SEMANTIC COLORS =====
        living: {
          DEFAULT: 'var(--living-primary)',
          hover: 'var(--living-hover)',
          bg: 'var(--living-bg)',
          border: 'var(--living-border)',
          'tab-active': 'var(--living-tab-active)',
          // Static values for reference/fallback
          light: {
            DEFAULT: '#b8860b',
            hover: '#6b5010',
            bg: '#faf6e9',
            border: '#d4af37',
          },
          dark: {
            DEFAULT: '#e8b84a',
            hover: '#ffd666',
            bg: '#282418',
            border: '#6b5c2e',
          },
        },
        
        // ===== LIFE EXPECTANCY BAR COLORS =====
        lifespan: {
          early: 'var(--lifespan-early)',
          'early-track': 'var(--lifespan-early-track)',
          longer: 'var(--lifespan-longer)',
          'longer-track': 'var(--lifespan-longer-track)',
          expected: 'var(--lifespan-expected)',
        },
        
        // ===== DECORATIVE ELEMENTS =====
        circle: {
          bg: 'var(--circle-bg)',
          track: 'var(--circle-track)',
          progress: 'var(--circle-progress)',
          ornament: 'var(--circle-ornament)',
        },
        
        timeline: {
          line: 'var(--timeline-line)',
          dot: 'var(--timeline-dot)',
          'dot-neutral': 'var(--timeline-dot-neutral)',
        },
        
        // ===== INTERACTIVE ELEMENTS =====
        button: {
          'primary-bg': 'var(--button-primary-bg)',
          'primary-text': 'var(--button-primary-text)',
          'secondary-border': 'var(--button-secondary-border)',
          'secondary-text': 'var(--button-secondary-text)',
        },
        
        input: {
          bg: 'var(--input-bg)',
          border: 'var(--input-border)',
          'focus-border': 'var(--input-focus-border)',
        },
        
        // ===== TAGS =====
        tag: {
          bg: 'var(--tag-bg)',
          border: 'var(--tag-border)',
          text: 'var(--tag-text)',
          'hover-bg': 'var(--tag-hover-bg)',
        },
        
        // ===== TOOLTIPS =====
        tooltip: {
          bg: 'var(--tooltip-bg)',
          text: 'var(--tooltip-text)',
        },
        
        // ===== LEGACY COLORS (for gradual migration) =====
        // Keep these until all components are migrated to semantic tokens
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
      
      // ===== SHADOWS FOR DARK MODE =====
      boxShadow: {
        'card-light': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'card-dark': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'elevated-light': '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)',
        'elevated-dark': '0 4px 6px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)',
      },
      
      // ===== TRANSITIONS =====
      transitionProperty: {
        'theme': 'background-color, border-color, color, fill, stroke',
      },
    },
  },
  plugins: [],
}
