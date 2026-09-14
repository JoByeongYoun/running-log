# 나이키 러닝 클럽(NRC) 기록 자동 연동 조사

작성일: 2026-09-14 · 상태: 보류(결정 유보). 다음에 다시 검토할 때 이 문서부터 읽는다.

## 배경

회원이 NRC로 뛴 뒤 우리 앱에 거리·사진을 따로 올리는 이중 입력을 줄이고 싶다. "NRC 데이터를 자동으로 가져올 수 없나"에서 출발해 가능한 경로를 모두 조사했다.

## 결론 요약

- NRC 데이터를 웹 앱이 자동으로 받는 정식 경로는 없다. 나이키는 공개 API를 제공하지 않는다.
- 유일한 자동 경로였던 Strava 우회는 (1) 한국 지역 NRC에 Strava 파트너가 뜨지 않고 (2) Strava API 약관상 다른 회원에게 데이터 표시가 금지되며 (3) 신규 앱은 사용자 1명 제한 + 심사가 필요해 사실상 막혔다.
- 네이티브(스토어) 앱으로 감싸면 HealthKit / Health Connect로 해결되지만 두 달 + 연 13만 원 규모라 소모임에 과하다.
- 현재 권장: **스크린샷 자동 인식(OCR)** 을 1순위, **Android 웹 공유 대상(Web Share Target)** 을 2순위로 두고, 자동 연동은 규모가 커질 때 재검토.

## 경로별 조사 결과

### 1. NRC 직접 연동
- 공개 API 없음. 비공식 토큰 추출 스크립트는 약관 위반이고 토큰 만료·엔드포인트 변경으로 불안정. 채택 불가.

### 2. Strava 허브
- NRC → Strava 자동 내보내기는 공식 기능이지만, 나이키 도움말에 "파트너 앱 목록은 위치에 따라 다르다"고 명시. 실제로 한국 계정 NRC 설정 > 파트너 목록에 Strava가 없음(2026-09 확인).
- Strava API 약관(2024-11 개정, 2026-06 갱신): 사용자의 Strava 데이터는 **그 사용자 본인에게만** 표시 가능. 그룹 달력·순위에 노출하는 우리 구조와 충돌.
- 신규 Strava 앱은 "Single Player Mode"(연결 가능 사용자 1명). 심사 통과 후에만 확대.
- 우회 가능한 형태: 연동 회원 본인 화면에만 "오늘 Strava 기록 8.2km, 이 거리로 제출할까요?" 제안 → 회원이 확인 시 우리 일반 기록으로 제출. 회색지대이며 심사도 필요. 비권장.
- 참고: [Strava 도움말 Nike and Strava](https://support.strava.com/hc/en-us/articles/216917847-Nike-and-Strava), [Nike 파트너 앱 연결](https://www.nike.com/help/a/connect-nrc-partner-apps-devices), [Strava API 약관 개정](https://press.strava.com/articles/updates-to-stravas-api-agreement), [Strava 개발자 프로그램](https://communityhub.strava.com/developers-knowledge-base-14/our-developer-program-3203), [API Agreement](https://www.strava.com/legal/api)

### 3. 기타 운동 앱/서비스
- Garmin Connect API: 기업 심사 필요, 개인 프로젝트 승인 거의 불가.
- COROS, 삼성 헬스, 아디다스 러닝, 런키퍼: 공개 API 없음.
- Terra / ROOK 등 건강 데이터 중계 서비스: 유료, 나이키 미지원.

### 4. Apple 건강 / Android Health Connect
- NRC와 삼성 헬스는 둘 다 폰 건강 저장소에 운동을 기록한다.
- 웹 브라우저(PWA)에서는 읽을 수 없다. 네이티브 코드 필요.
- iPhone 대안: **단축어(Shortcuts)** 로 건강 앱 운동을 읽어 우리 서버 URL로 POST 가능. "NRC 앱을 닫을 때" 자동화 트리거 사용. 개발자 계정·심사 불필요, 서버 수신 엔드포인트만 필요. iPhone 전용.
- Android 대안: 표준 도구 없음(MacroDroid 등 서드파티 의존).

### 5. NRC 공유 버튼 활용
- NRC 공유는 **이미지**를 내보낸다. 공개 활동 URL이 없어 링크 기반 연동은 불가.
- PWA를 **Web Share Target** 으로 등록하면 NRC 공유 목록에 Running Log가 뜨고, 이미지가 기록 등록 화면으로 바로 들어온다. OCR과 결합하면 거의 원터치.
- 제약: Android 전용(iOS Safari 미지원), 홈 화면에 설치된 PWA에서만 동작. 외부 API·약관·심사 없음. 작업 1~2일.

### 6. 스크린샷 자동 인식(OCR)
- 지금 흐름(캡처 업로드 + 관리자 승인) 유지, 업로드 시 거리·날짜를 읽어 입력칸 자동 채움.
- 회원 쪽 변화 없음, 기기 구분 없음, 외부 의존 없음. 작업 며칠.
- 미결 사항: 브라우저 내 처리(무료, 정확도 보통) vs 서버 AI 모델(건당 소액, 정확도 높음). 권장은 서버.

### 7. 스토어 앱으로 감싸기(Capacitor)
- 기존 Next.js 웹을 로드하는 네이티브 껍데기에 HealthKit / Health Connect 읽기 + 네이티브 푸시(APNs/FCM)를 얹어 앱스토어·플레이스토어 배포.
- 비용: Apple 연 99달러, Google 1회 25달러. Google 개인 계정은 테스터 20명 14일 사전 테스트 요건.
- 단계: 껍데기(1주) → 건강 연동(1~2주) → 푸시 교체(3~5일) → 스토어 자료(2~3일) → 심사(1~4주) → 회원 이전.
- 리스크: Apple 가이드라인 4.2(단순 웹 래퍼 거절) → 건강 연동을 첫 버전에 반드시 포함. Health Connect 권한 신고서 승인 대기. 껍데기 변경 시 재심사.
- 총 규모 약 두 달. PWA 설치 난이도 문제까지 함께 해결하지만 소모임엔 과함.

## PWA 설치 난이도(부수 논의)

- iPhone: 설치 버튼 없음, 사파리에서 공유 > 홈 화면에 추가를 직접 해야 하고 카카오톡 인앱 브라우저에선 불가.
- 현재 앱에 설치 배너(`src/components/pwa/InstallPrompt.tsx`)와 iOS 안내 문구는 있음.
- 푸시·공유 대상 기능이 설치 여부에 묶여 있는 것이 근본 약점.

## 비교표

| 안 | 회원이 하는 일 | 우리 작업 | 외부 의존 | 대상 |
|---|---|---|---|---|
| 스크린샷 OCR | 지금처럼 캡처 업로드, 숫자 자동 채움 | 며칠 | 없음 | 양쪽 |
| Android 공유 대상 | NRC 공유 → Running Log 선택 | 1~2일 | 없음 | Android(설치 PWA) |
| iPhone 단축어 | 단축어 1회 설치 | 며칠 | 없음 | iPhone |
| Strava | 앱 추가 설치 | 1~2주 | 약관·심사·지역 제한 | 양쪽(한국 NRC 불가) |
| 스토어 앱 | 스토어 설치 | 두 달 | 연 13만 원, 심사 | 양쪽 |

## 다시 검토할 때 확인할 것

- 회원들의 기기 구성(iPhone/Android 비율). 조합 선택의 핵심 변수.
- 한국 NRC 파트너 목록에 실제로 뜨는 앱 이름(Strava 재등장 여부).
- Strava API 약관의 타 사용자 표시 금지 조항 변경 여부.
