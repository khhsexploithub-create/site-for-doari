// 항목별 '읽음' 시각을 계정마다 저장한다.
// users/{uid}/readState/{sectionId} 문서 하나에 lastReadAt 만 담는다.
// 기기를 바꿔 로그인해도 읽음 상태가 그대로 따라온다.

import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

import { auth, db } from "../firebase.js";

// 빨간 표시를 붙일 항목들
export const NOTIFICATION_SECTIONS = {
  notices: { id: "notices", name: "공지" },
  unionEvents: { id: "unionEvents", name: "연합회 행사" },
  budget: { id: "budget", name: "내 예산 신청" },
  resources: { id: "resources", name: "내 자원 예약" }
};

function readStateCollection(uid) {
  return collection(db, "users", uid, "readState");
}

// 지금 이 항목을 읽은 것으로 남긴다.
export async function markSectionRead(sectionId, uid = auth.currentUser?.uid) {
  if (!uid || !NOTIFICATION_SECTIONS[sectionId]) return;

  try {
    await setDoc(
      doc(db, "users", uid, "readState", sectionId),
      { lastReadAt: serverTimestamp() },
      { merge: true }
    );
  } catch (error) {
    // 읽음 표시는 부가 기능이다. 실패해도 화면은 그대로 쓸 수 있어야 한다.
    console.error("읽음 표시 저장 오류:", error);
  }
}

// 모든 항목을 한 번에 읽음 처리한다.
export async function markAllSectionsRead(uid = auth.currentUser?.uid) {
  await Promise.all(
    Object.keys(NOTIFICATION_SECTIONS).map((sectionId) => markSectionRead(sectionId, uid))
  );
}

// 항목별 마지막 읽은 시각(ms)을 계속 지켜본다.
export function subscribeToReadState(uid, onUpdate, onError) {
  if (!uid) {
    onUpdate({});
    return () => {};
  }

  return onSnapshot(
    readStateCollection(uid),
    (snapshot) => {
      const lastReadAt = {};

      snapshot.docs.forEach((stateDoc) => {
        lastReadAt[stateDoc.id] = toMillis(stateDoc.data()?.lastReadAt);
      });

      onUpdate(lastReadAt);
    },
    (error) => {
      console.error("읽음 상태 조회 오류:", error);
      onError?.(error);
      onUpdate({});
    }
  );
}

export function toMillis(timestamp) {
  if (!timestamp) return 0;

  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}

// 처음 로그인한 계정에는 예전 글이 전부 '새 글'로 보인다.
// 그래서 읽은 적이 없으면 계정을 만든 시각을 기준으로 삼는다.
export function getBaseline(lastReadAt, sectionId, fallbackMillis = 0) {
  const saved = lastReadAt?.[sectionId] ?? 0;
  return saved > 0 ? saved : fallbackMillis;
}
