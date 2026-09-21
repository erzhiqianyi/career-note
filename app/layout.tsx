import type { Metadata } from 'next';
import './globals.css';
import { AppearanceProvider } from '@/components/appearance-provider';
import { LocaleProvider } from '@/components/locale-provider';
export const metadata: Metadata = {
  metadataBase: new URL('https://career.erzhiqian.cc'),
  title: '就职手帖 · 日本求职准备',
  description: '公司研究、投递跟进、履历资料与每日求职准备。',
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: 'https://career.erzhiqian.cc/', siteName: '就职手帖 · Career Note', title: '就职手帖 · 日本求职准备', description: '公司研究、投递跟进、履历资料与每日求职准备。', locale: 'zh_CN' },
  twitter: { card: 'summary', title: '就职手帖 · 日本求职准备', description: '公司研究、投递跟进、履历资料与每日求职准备。' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`} />
            <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}',{anonymize_ip:true});` }} />
          </>
        ) : null}
        <AppearanceProvider><LocaleProvider>{children}</LocaleProvider></AppearanceProvider>
      </body>
    </html>
  );
}
