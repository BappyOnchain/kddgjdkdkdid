/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cyan: {
          50: '#ECFEFF', 100: '#CFFAFE', 200: '#A5F3FC', 300: '#67E8F9',
          400: '#00F0FF', DEFAULT: '#00F0FF', 500: '#00D4E8', 600: '#0891B2',
          700: '#0E7490', 800: '#155E75', 900: '#164E63', 950: '#083344',
        },
        violet: {
          50: '#F5F3FF', 100: '#EDE9FE', 200: '#DDD6FE', 300: '#C4B5FD',
          400: '#A78BFA', 500: '#8B5CF6', DEFAULT: '#8B5CF6', 600: '#7C3AED',
          700: '#6D28D9', 800: '#5B21B6', 900: '#4C1D95', 950: '#2E1065',
        },
        dark: {
          bg: '#0B0E14',
          card: '#131720',
          border: '#1E2433',
          sidebar: '#0D1018',
        },
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-cyan-violet': 'linear-gradient(135deg, #00F0FF, #8B5CF6)',
      },
    },
  },
  plugins: [],
}
