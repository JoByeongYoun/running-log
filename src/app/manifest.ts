import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '우리들의 러닝일지',
    short_name: '러닝일지',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'ko-KR',
    orientation: 'any',
    theme_color: '#0f172a',
    background_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
