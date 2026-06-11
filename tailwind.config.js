/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neko-bg': '#0f0f11',
        'neko-panel': '#18181b',
        'neko-accent': '#a78bfa',
      }
    },
  },
  plugins: [],
}