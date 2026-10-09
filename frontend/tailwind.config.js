/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mission: {
          bg: '#0A0E17',
          surface: '#0D1527',
          card: 'rgba(13, 21, 39, 0.85)',
          border: 'rgba(0, 240, 255, 0.2)',
          cyan: '#00F0FF',
          magenta: '#FF2FD0',
          amber: '#FFB400',
          lime: '#B6FF00',
          purple: '#9D00FF',
          muted: '#6B7A99',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Space Mono"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 15px rgba(0, 240, 255, 0.35)',
        'glow-magenta': '0 0 15px rgba(255, 47, 208, 0.35)',
        'glow-amber': '0 0 15px rgba(255, 180, 0, 0.35)',
        'glow-lime': '0 0 15px rgba(182, 255, 0, 0.35)',
        'panel': '0 8px 32px 0 rgba(0, 0, 0, 0.65)',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.15)', opacity: '0.4' },
        },
        flashHighlight: {
          '0%': { backgroundColor: 'rgba(0, 240, 255, 0.25)' },
          '100%': { backgroundColor: 'transparent' },
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash': 'flashHighlight 0.8s ease-out',
      }
    },
  },
  plugins: [],
}
