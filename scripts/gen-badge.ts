import sharp from 'sharp';

/**
 * Android 상태바용 단색 배지 아이콘 (Notification.badge).
 * 상태바는 알파 채널만 사용하므로 흰색 실루엣 + 투명 배경으로 만든다.
 * 앱 아이콘은 입체 그림자가 있어 실루엣으로 뽑으면 지저분하므로, 달리는 사람 글리프를 직접 그린다.
 * (Material Symbols "directions_run", Apache-2.0)
 */
const OUT = 'public/icons/badge-96.png';
const RUNNER = 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24"><path fill="#fff" d="${RUNNER}"/></svg>`;

sharp(Buffer.from(svg)).png().toFile(OUT).then(() => console.log('badge generated at', OUT));
