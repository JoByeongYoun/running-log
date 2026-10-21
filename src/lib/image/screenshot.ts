/**
 * 이 기기 화면 해상도와 픽셀 크기가 같으면 스크린샷으로 본다.
 * 다른 기기에서 찍은 스크린샷은 못 잡지만, 대표 사진(셀카) 기본값을 고르는 데는 충분하다.
 */
export function looksLikeScreenshot(w: number, h: number, screenW: number, screenH: number): boolean {
  const same = (a: number, b: number) => Math.abs(a - b) <= 2;
  return (same(w, screenW) && same(h, screenH)) || (same(w, screenH) && same(h, screenW));
}
