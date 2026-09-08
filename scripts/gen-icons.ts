import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const svg = (pad: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0f172a"/>
  <g transform="translate(${pad},${pad}) scale(${(512 - 2 * pad) / 512})">
    <path d="M120 372 L200 232 L256 300 L312 180 L400 372" fill="none" stroke="#34d399" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="312" cy="128" r="34" fill="#ffffff"/>
  </g>
</svg>`;

async function main() {
  mkdirSync('public/icons', { recursive: true });
  await sharp(Buffer.from(svg(0))).resize(192).png().toFile('public/icons/icon-192.png');
  await sharp(Buffer.from(svg(0))).resize(512).png().toFile('public/icons/icon-512.png');
  await sharp(Buffer.from(svg(0))).resize(180).png().toFile('public/icons/apple-touch-icon.png');
  await sharp(Buffer.from(svg(80))).resize(512).png().toFile('public/icons/maskable-512.png');
  console.log('icons generated');
}
main();
