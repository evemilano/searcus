/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './it/index.html',
    './en/index.html',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        void: '#0A0A0F',
        obsidian: '#111117',
        slate: '#1A1A24',
        wire: '#2A2A3A',
        chalk: '#E8E6F0',
        mist: '#9896A8',
        signal: '#6366F1',
        flare: '#818CF8',
        ember: '#F59E0B',
        verified: '#10B981',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    }
  },
  plugins: [],
}
