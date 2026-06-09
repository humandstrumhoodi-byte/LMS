/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#f0edf9', 100:'#d8d1f0', 300:'#8f7ed5', 500:'#3B1F8C', 600:'#311a75', 700:'#26145b' }
      }
    }
  },
  plugins: []
}
