import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Running Log',
    short_name: 'Running Log',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'ko-KR',
    orientation: 'any',
    theme_color: '#2b2f36',
    background_color: '#f6f1e8',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
