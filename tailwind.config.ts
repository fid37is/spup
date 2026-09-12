import type { Config } from 'tailwindcss'

// NOTE: Tailwind v4 (this project uses ^4) does not read this file
// automatically — that was v3 behavior. It needs an explicit `@config`
// import or a native `@theme` block in CSS. This project now defines the
// same tokens natively via `@theme inline` in src/app/globals.css, which is
// what actually generates the bg-brand / text-primary / rounded-btn /
// font-display utility classes used across the app. This file is kept for
// reference but has no effect on the build — edit globals.css instead.

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand:        'var(--color-brand)',
        'brand-hover':'var(--color-brand-hover)',
        'brand-dim':  'var(--color-brand-dim)',
        'brand-muted':'var(--color-brand-muted)',
        gold:         'var(--color-gold)',
        error:        'var(--color-error)',
        success:      'var(--color-success)',

        bg:           'var(--color-bg)',
        surface:      'var(--color-surface)',
        'surface-2':  'var(--color-surface-2)',
        'surface-3':  'var(--color-surface-3)',
        'surface-raised': 'var(--color-surface-raised)',

        border:       'var(--color-border)',
        'border-light':'var(--color-border-light)',

        primary:      'var(--color-text-primary)',
        secondary:    'var(--color-text-secondary)',
        muted:        'var(--color-text-muted)',
        faint:        'var(--color-text-faint)',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        btn:  '10px',
      },
      screens: {
        xs: '375px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
      },
    },
  },
  plugins: [],
}

export default config