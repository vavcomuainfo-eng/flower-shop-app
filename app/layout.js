import './globals.css';

export const metadata = {
  title: 'BaB',
  description: 'Облік залишків, букетів, продажів і постачальників',
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
