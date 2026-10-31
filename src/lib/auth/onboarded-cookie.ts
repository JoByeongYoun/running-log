/**
 * 온보딩 완료 여부 캐시 쿠키. proxy 가 매 요청마다 profiles 를 조회하지 않게 한다.
 * 값은 사용자 id 라서 같은 브라우저에서 다른 계정으로 로그인하면 자동으로 무효가 된다.
 */
export const ONBOARDED_COOKIE = 'rl_onboarded';
export const ONBOARDED_COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 30 } as const;
