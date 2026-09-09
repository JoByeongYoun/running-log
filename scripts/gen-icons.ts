import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'assets/app-icon.png';

async function main() {
  mkdirSync('public/icons', { recursive: true });
  const base = sharp(SRC).resize(1024, 1024, { fit: 'cover' });
  await base.clone().resize(192).png().toFile('public/icons/icon-192.png');
  await base.clone().resize(512).png().toFile('public/icons/icon-512.png');
  await base.clone().resize(180).png().toFile('public/icons/apple-touch-icon.png');
  // maskable: 안전 영역(중앙 80%) 안에 원본을 두고 바깥은 원본 배경색으로 채움
  const inner = await base.clone().resize(410, 410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 246, g: 241, b: 232, alpha: 1 } } })
    .composite([{ input: inner, left: 51, top: 51 }])
    .png().toFile('public/icons/maskable-512.png');
  await base.clone().resize(32).png().toFile('src/app/favicon.png');
  console.log('icons generated from', SRC);
}
main();
