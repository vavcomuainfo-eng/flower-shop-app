import './globals.css';

export const metadata = {
  title: 'BaB',
  description: 'Облік залишків, букетів, продажів і постачальників',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
