import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { ServiceWorker } from '@/components/pwa/ServiceWorker';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

export const metadata: Metadata = {
  title: { default: 'Running Log', template: '%s · Running Log' },
  description: '그룹 주간 목표 러닝 기록',
  applicationName: 'Running Log',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Running Log' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#2b2f36',
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
