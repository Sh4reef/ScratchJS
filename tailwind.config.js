/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#1e1e2e',
        surface: '#252538',
        surfaceHover: '#2d2d44',
        border: '#313244',
        primary: '#89b4fa',
        brand: '#F7DF1E',
        text: '#cdd6f4',
        textMuted: '#a6adc8',
        accent: '#cba6f7',
        success: '#a6e3a1',
        error: '#f38ba8',
        warning: '#f9e2af'
      }
    }
  },
  plugins: []
}
