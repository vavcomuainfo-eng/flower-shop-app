/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F6F7F2',      // фон
        ink: '#1F2A24',        // основний текст
        forest: '#2F5233',     // основний зелений (навігація, заголовки)
        sage: '#8A9A8E',       // другорядний текст / межі
        rose: '#D46A6A',       // акцент дій (кнопки, активні стани)
        leaf: '#4C7A57',       // успіх / достатньо на складі
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
