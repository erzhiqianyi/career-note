import type { Metadata } from 'next';
import './globals.css';
import { LocaleProvider } from '@/components/locale-provider';
export const metadata: Metadata = {
  title: '就职手帖 · 日本求职准备',
  description: '公司研究、投递跟进、履历资料与每日求职准备。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
