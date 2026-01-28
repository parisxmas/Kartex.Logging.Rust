/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0d1117',
        'bg-secondary': '#161b22',
        'bg-tertiary': '#21262d',
        'border': '#30363d',
        'text-primary': '#c9d1d9',
        'text-secondary': '#8b949e',
        'accent': '#58a6ff',
        'accent-hover': '#79b8ff',
        'success': '#3fb950',
        'warning': '#d29922',
        'error': '#f85149',
        'level-trace': '#8b949e',
        'level-debug': '#58a6ff',
        'level-info': '#3fb950',
        'level-warn': '#d29922',
        'level-error': '#f85149',
        'level-fatal': '#f85149',
      },
    },
  },
  plugins: [],
}
