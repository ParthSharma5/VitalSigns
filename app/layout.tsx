import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'VitalSigns: real-user Core Web Vitals', template: '%s · VitalSigns' },
  description:
    'Paste one tiny script tag and see how fast your site really is for real visitors: LCP, INP and CLS by page, device and country, with regression alerts.',
  // The app ships its own dark theme; this tells the Dark Reader extension not
  // to restyle it (its injected attributes otherwise break React hydration).
  other: { 'darkreader-lock': '' },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // Extensions also stamp attributes onto <html>; ignore mismatches on this element only.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
