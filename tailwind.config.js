/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#FFFFFF',      // фон — білий
        ink: '#1A1A1A',        // основний текст
        forest: '#B91C1C',     // основний бренд-колір (навігація, заголовки, кнопки) — червоний
        sage: '#9A9A9A',       // другорядний текст / межі — нейтральний сірий
        rose: '#DC2626',       // акцент дій (кнопки, активні стани) — яскравий червоний
        leaf: '#4C7A57',       // успіх / достатньо на складі / прибуток (залишено зеленим для читабельності)
        amber: '#C98A3B',      // попередження / мало на складі
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
};
