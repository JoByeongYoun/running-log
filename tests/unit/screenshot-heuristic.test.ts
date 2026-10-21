import { describe, it, expect } from 'vitest';
import { looksLikeScreenshot } from '@/lib/image/screenshot';

describe('looksLikeScreenshot', () => {
  const screen = { w: 1179, h: 2556 }; // iPhone 15 물리 해상도
  it('화면 해상도와 같으면 스크린샷', () => {
    expect(looksLikeScreenshot(1179, 2556, screen.w, screen.h)).toBe(true);
    expect(looksLikeScreenshot(2556, 1179, screen.w, screen.h)).toBe(true);
    expect(looksLikeScreenshot(1180, 2555, screen.w, screen.h)).toBe(true);
  });
  it('카메라 사진 크기는 스크린샷이 아니다', () => {
    expect(looksLikeScreenshot(3024, 4032, screen.w, screen.h)).toBe(false);
    expect(looksLikeScreenshot(1080, 1920, screen.w, screen.h)).toBe(false);
  });
});
