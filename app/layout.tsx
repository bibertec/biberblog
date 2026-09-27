import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import '@styles/globals.css';
import BiberblogEditor from '@/src/system/components/BiberblogEditor';

const geistMono = Geist_Mono({
  variable: '--font-primary-family',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'biberblog',
  description: 'ready to rock!',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${geistMono.variable} antialiased`}>
      <body>
        {children}
        <BiberblogEditor className="px-6" />
      </body>
    </html>
  );
}
