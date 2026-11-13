# 푸시 알림 · 앱 설치 설정

## 알림이 가는 경우
| 일 | 받는 사람 |
|---|---|
| 새 공지 등록 | 알림 켠 모든 사람 |
| 새 연합회 행사 등록 | 알림 켠 모든 사람 |
| 예산 신청 처리 (전체승인/일부승인/반려) | 신청한 사람 |
| 자원 예약 승인/반려 | 예약한 사람 |
| 예산 신청 들어옴 | 예산관리 소위원회 전체 (긴급이면 연합회장도) |
| 행사 홍보 올라옴 | 행사운영 소위원회 전체 |

사용자는 **알림 메시지 페이지(🔔) → 푸시 알림 켜기**로 기기마다 켠다.

## 처음 한 번 할 일
1. ~~appId~~ — 넣어 둠 (`1:700415202457:web:ae404943ef02b4cdca9408`, `src/firebase.js` · `public/firebase-messaging-sw.js`)
2. 웹 푸시 키(VAPID) — 비워 두면 Firebase 기본 키로 동작한다. 프로젝트 전용 키를 쓰고 싶을 때만
   콘솔 → 프로젝트 설정 → 클라우드 메시징 → 웹 푸시 인증서 → 키 쌍 생성 → 공개 키를 `src/push/pushService.js`의 `VAPID_KEY`에 넣는다.
3. **푸시해서 배포**: main에 푸시하면 호스팅 + 보안 규칙은 GitHub Actions가 배포한다.
4. **Functions 배포** (한 번, 그리고 functions 고칠 때마다):
   ```
   cd functions && npm install && cd ..
   npx firebase-tools login
   npx firebase-tools deploy --only functions --project site-for-dongari
   ```
5. 커스텀 도메인을 쓰면 `functions/index.js`의 `SITE_URL`을 바꾼다.

## 설치 방법
- **안드로이드**: 크롬으로 사이트 접속 → 메뉴 → "앱 설치" (APK 없이 같은 푸시가 옴)
- **아이폰 (iOS 16.4+)**: Safari → 공유 → "홈 화면에 추가" → 그 앱에서 알림 켜기
- **APK 파일이 꼭 필요하면**: https://www.pwabuilder.com 에 사이트 주소 넣고 Android 패키지 생성 →
  같이 나온 `assetlinks.json`을 `public/.well-known/assetlinks.json`에 넣고 배포
  (이게 없으면 앱 위에 주소창이 보인다). 서명 키 파일은 잃어버리면 업데이트를 못 하니 꼭 보관.

## 확인
- 콘솔 → Functions → 로그에서 `푸시 발송` 기록 확인
- 안 오면: 기기 알림 권한, `users/{uid}/fcmTokens`에 문서가 생겼는지 확인
