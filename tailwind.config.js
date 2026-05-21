/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg-main)',
        elevated: 'var(--bg-elevated)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        border: 'var(--border-default)',
        brand: 'var(--brand-primary)',
        success: 'var(--success)',
        danger: 'var(--danger)',
      },
    },
  },
}
