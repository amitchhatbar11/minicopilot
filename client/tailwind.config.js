/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Workbench neutrals (warm near-black).
        base: '#0a0a0b',
        surface: '#111113',
        raised: '#17171a',
        line: '#26262b',
        ink: '#e8e6e1',
        muted: '#8b8a84',
        faint: '#5c5b56',
        // Authentic Bitcoin orange as the single accent.
        orange: '#f7931a',
        // Muted schematic palette for fragment types.
        frag: {
          or: '#f7931a',
          and: '#7aa2f7',
          thresh: '#bb9af7',
          pk: '#9ece6a',
          time: '#e0af68',
          hash: '#7dcfff',
        },
        ok: '#9ece6a',
        warn: '#f7768e',
      },
      borderRadius: {
        DEFAULT: '3px',
        md: '4px',
        lg: '5px',
      },
    },
  },
  plugins: [],
};
