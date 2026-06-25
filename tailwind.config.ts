import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  // Scan this app's source AND the @fretwork/lib BUILT output (it's now a git
  // dependency, not a workspace package), so Tailwind classes used by lib's
  // components are present in the final CSS bundle.
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@fretwork/lib/dist/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        charcoal: {
          DEFAULT: 'hsl(var(--charcoal) / <alpha-value>)',
          deep: 'hsl(var(--charcoal-deep) / <alpha-value>)',
          raised: 'hsl(var(--charcoal-raised) / <alpha-value>)',
        },
        rosewood: {
          DEFAULT: 'hsl(var(--rosewood) / <alpha-value>)',
          dark: 'hsl(var(--rosewood-dark) / <alpha-value>)',
          light: 'hsl(var(--rosewood-light) / <alpha-value>)',
        },
        nickel: 'hsl(var(--nickel) / <alpha-value>)',
        pearl: 'hsl(var(--pearl) / <alpha-value>)',

        'degree-root': 'hsl(var(--degree-root) / <alpha-value>)',
        'degree-third': 'hsl(var(--degree-third) / <alpha-value>)',
        'degree-fifth': 'hsl(var(--degree-fifth) / <alpha-value>)',
        'degree-tone': 'hsl(var(--degree-tone) / <alpha-value>)',

        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        'card-foreground': 'hsl(var(--card-foreground) / <alpha-value>)',
        popover: 'hsl(var(--popover) / <alpha-value>)',
        'popover-foreground': 'hsl(var(--popover-foreground) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        secondary: 'hsl(var(--secondary) / <alpha-value>)',
        'secondary-foreground': 'hsl(var(--secondary-foreground) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-foreground': 'hsl(var(--accent-foreground) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'marker-pop': {
          '0%': { transform: 'scale(0.7)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'marker-pop': 'marker-pop 160ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [animate],
};

export default config;
