import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { ServiceWorker } from '@/components/pwa/ServiceWorker';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

export const metadata: Metadata = {
  title: { default: '우리들의 러닝일지', template: '%s · 러닝일지' },
  description: '그룹 주간 목표 러닝 기록',
  applicationName: '우리들의 러닝일지',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '러닝일지' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko-KR">
      <body className="min-h-dvh bg-white text-slate-900">
        <ToastProvider>
          {children}
          <ServiceWorker />
          <InstallPrompt />
        </ToastProvider>
      </body>
    </html>
  );
}
