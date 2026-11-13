// 모든 페이지에서 불러온다.
// - 서비스 워커를 등록해 '앱으로 설치'와 푸시 알림이 가능하게 한다.
// - 앱을 보고 있을 때 온 푸시도 알림으로 띄운다.

import { getAppServiceWorker, listenForegroundMessages } from "./push/pushService.js";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await getAppServiceWorker();
      await listenForegroundMessages();
    } catch (error) {
      console.error("서비스 워커 등록 오류:", error);
    }
  });
}
