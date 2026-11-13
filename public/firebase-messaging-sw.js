// 푸시 알림을 받는 서비스 워커.
//
// public/ 에 있어서 vite 가 묶지 않고 그대로 /firebase-messaging-sw.js 로 나간다.
// 그래서 src/firebase.js 를 import 할 수 없어 설정을 여기에 한 번 더 적는다.
// src/firebase.js 의 설정을 바꾸면 여기도 같이 바꿔야 한다.
// 아래 SDK 버전은 package.json 의 firebase 버전과 맞춘다.

importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD408PqmVurTYBmK1JDeb49oMNVCd_No6k",
  authDomain: "site-for-dongari.firebaseapp.com",
  projectId: "site-for-dongari",
  storageBucket: "site-for-dongari.firebasestorage.app",
  messagingSenderId: "700415202457",
  appId: "1:700415202457:web:ae404943ef02b4cdca9408"
});

// 앱이 꺼져 있거나 뒤에 있을 때 온 알림은 SDK 가 알아서 띄운다.
// (Cloud Functions 가 notification 을 담아 보내기 때문)
firebase.messaging();

// 앱을 보고 있을 때 온 알림은 페이지(src/pwa.js)가 직접 띄우고,
// 그 알림을 누르면 여기서 해당 페이지를 연다.
// SDK 가 띄운 알림에는 data.link 가 없으므로 SDK 처리와 겹치지 않는다.
self.addEventListener("notificationclick", (event) => {
  const link = event.notification?.data?.link;
  if (!link) return;

  event.notification.close();
  event.waitUntil(openOrFocus(new URL(link, self.location.origin).href));
});

async function openOrFocus(url) {
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const sameOrigin = windows.find((client) => new URL(client.url).origin === self.location.origin);

  if (sameOrigin) {
    await sameOrigin.focus();
    return sameOrigin.navigate(url);
  }

  return clients.openWindow(url);
}
