// 휴대폰 · PC 푸시 알림 (Firebase Cloud Messaging).
//
// 1) 사용자가 '푸시 알림 켜기'를 누르면 브라우저 권한을 받고 FCM 토큰을 만든다.
// 2) 토큰은 users/{uid}/fcmTokens/{토큰 해시} 에 저장한다. 기기마다 하나씩 생긴다.
// 3) 실제 발송은 functions/index.js 의 Cloud Functions 가 한다.

import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";

import { app, db } from "../firebase.js";

// 웹 푸시 공개 키 (VAPID).
// 비워 두면 Firebase SDK 에 들어 있는 기본 키를 쓴다. 대부분 그대로 동작한다.
// 프로젝트 전용 키를 쓰고 싶으면: Firebase 콘솔 → 프로젝트 설정 → 클라우드 메시징
// → 웹 푸시 인증서 → '키 쌍 생성' → 나온 공개 키를 여기에 넣는다.
const VAPID_KEY = "";

const SW_URL = "/firebase-messaging-sw.js";
const ENABLED_KEY = "neoul-push-token";

// ========================================
// 지원 여부
// ========================================

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

// 콘솔 값(VAPID 공개 키 · appId)을 아직 안 넣었으면 알림을 켤 수 없다.
export function isPushConfigured() {
  return !String(app.options.appId ?? "").includes("REPLACE");
}

// { ok: true } 또는 { ok: false, reason: "not-configured" | "ios-browser" | "unsupported" }
export async function checkPushSupport() {
  if (!isPushConfigured()) {
    console.warn("푸시 알림 설정 필요: src/firebase.js · public/firebase-messaging-sw.js 의 appId (docs/PUSH_SETUP.md 참고)");
    return { ok: false, reason: "not-configured" };
  }

  // 아이폰은 Safari 에서 '홈 화면에 추가'한 앱 안에서만 웹 푸시를 받을 수 있다.
  if (isIos() && !isStandalone()) return { ok: false, reason: "ios-browser" };

  const hasApis = "serviceWorker" in navigator && "Notification" in window && "PushManager" in window;
  if (!hasApis) return { ok: false, reason: "unsupported" };

  try {
    return (await isSupported()) ? { ok: true } : { ok: false, reason: "unsupported" };
  } catch {
    return { ok: false, reason: "unsupported" };
  }
}

// 이 기기에서 알림을 켜 둔 상태인지.
export function isPushEnabledHere() {
  return Notification.permission === "granted" && Boolean(readSavedToken());
}

// ========================================
// 켜기 · 끄기
// ========================================

export async function enablePush(user) {
  if (!user) throw new Error("로그인이 필요합니다.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("알림 권한이 거부되었습니다. 브라우저(앱) 설정에서 알림을 허용해주세요.");
  }

  const registration = await getAppServiceWorker();
  const token = await getToken(getMessaging(app), {
    ...(VAPID_KEY ? { vapidKey: VAPID_KEY } : {}),
    serviceWorkerRegistration: registration
  });

  if (!token) throw new Error("알림 토큰을 받지 못했습니다. 잠시 후 다시 시도해주세요.");

  await setDoc(doc(db, "users", user.uid, "fcmTokens", await hashToken(token)), {
    token,
    platform: describePlatform(),
    updatedAt: serverTimestamp()
  });

  saveToken(token);
}

export async function disablePush(user) {
  const token = readSavedToken();

  try {
    await deleteToken(getMessaging(app));
  } catch (error) {
    console.error("알림 토큰 삭제 오류:", error);
  }

  if (user && token) {
    await deleteDoc(doc(db, "users", user.uid, "fcmTokens", await hashToken(token)));
  }

  saveToken("");
}

// 로그아웃할 때 부른다. 다른 사람이 같은 기기로 로그인해도 앞 사람 알림이 오지 않게 한다.
export async function clearPushOnSignOut(user) {
  if (!readSavedToken()) return;
  await disablePush(user);
}

// ========================================
// 앱을 보고 있을 때 온 알림
// ========================================

// 앱이 화면에 떠 있으면 서비스 워커 대신 여기로 메시지가 온다.
// 그대로 두면 아무 표시가 없으므로 직접 알림을 띄운다.
export async function listenForegroundMessages() {
  if (Notification.permission !== "granted") return;
  if (!(await checkPushSupport()).ok) return;

  const registration = await getAppServiceWorker();

  onMessage(getMessaging(app), (payload) => {
    const title = payload.notification?.title ?? "너울 알림";
    registration.showNotification(title, {
      body: payload.notification?.body ?? "",
      icon: "/icons/icon-192.png",
      tag: payload.data?.tag,
      data: { link: payload.data?.link ?? "/notices.html" }
    });
  });
}

// ========================================
// 내부 도우미
// ========================================

export async function getAppServiceWorker() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active?.scriptURL.endsWith(SW_URL)) return existing;

  await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  return navigator.serviceWorker.ready;
}

// 토큰 자체는 길고 문서 번호로 쓰기 어색하므로 SHA-256 해시를 문서 번호로 쓴다.
async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function describePlatform() {
  const kind = isIos() ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "desktop";
  return `${kind}${isStandalone() ? "-app" : "-web"}`;
}

function readSavedToken() {
  try {
    return localStorage.getItem(ENABLED_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveToken(token) {
  try {
    if (token) localStorage.setItem(ENABLED_KEY, token);
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    // 사생활 보호 모드 등에서는 저장이 안 될 수 있다. 알림 자체에는 영향 없음.
  }
}
