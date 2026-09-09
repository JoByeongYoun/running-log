import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { ServiceWorker } from '@/components/pwa/ServiceWorker';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

const SITE_NAME = 'Running Log';
const DESCRIPTION = '함께 달리고, 함께 기록해요. 그룹 주간 목표 러닝 기록 앱';

function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(vercel ? `https://${vercel}` : 'http://localhost:3000');
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  appleWebApp: { capable: true, statusBarStyle: 'default', title: SITE_NAME },
  icons: { icon: '/icon.png', apple: '/icons/apple-touch-icon.png' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    url: '/',
    locale: 'ko_KR',
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary',
    title: SITE_NAME,
    description: DESCRIPTION,
    images: ['/icons/icon-512.png'],
  },
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
