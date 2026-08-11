/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Placeholder brand palette - to be refined with final Vintex identity
        brand: {
          50: '#f5f7f2',
          100: '#e6ebdd',
          300: '#b9c7a0',
          500: '#5c7a4a',
          700: '#3c5230',
          900: '#22301b',
        },
      },
    },
  },
  plugins: [],
};
