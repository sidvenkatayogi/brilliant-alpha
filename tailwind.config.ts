import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand: a calm slate base with a confident indigo accent.
        ink: '#0f172a',
        accent: {
          DEFAULT: '#6366f1',
          soft: '#818cf8',
        },
        good: '#10b981',
        bad: '#f43f5e',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
