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
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'border': 'var(--border)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'accent': 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'success': 'var(--success)',
        'warning': 'var(--warning)',
        'error': 'var(--error)',
        'level-trace': 'var(--level-trace)',
        'level-debug': 'var(--level-debug)',
        'level-info': 'var(--level-info)',
        'level-warn': 'var(--level-warn)',
        'level-error': 'var(--level-error)',
        'level-fatal': 'var(--level-fatal)',
      },
    },
  },
  plugins: [],
}
