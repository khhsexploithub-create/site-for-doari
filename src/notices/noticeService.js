// 공지. 상단 종 버튼에서 열리는 '알림 메시지' 페이지의 글이다.
// 작성 · 수정 · 삭제는 관리자와, 관리자가 공지 권한을 준 소위원장만 한다.
// 읽기는 로그인한 모든 계정.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";

import { auth, db } from "../firebase.js";

export const NOTICES_COLLECTION = "notices";

// 공지 분류. 화면의 필터와 같은 값을 쓴다.
export const NOTICE_CATEGORIES = [
  { value: "general", name: "일반" },
  { value: "event", name: "행사" },
  { value: "urgent", name: "긴급" }
];

export function getNoticeCategoryName(category) {
  return NOTICE_CATEGORIES.find(({ value }) => value === category)?.name ?? "일반";
}

export function subscribeToNotices(onUpdate, onError) {
  return onSnapshot(
    collection(db, NOTICES_COLLECTION),
    (snapshot) => {
      const notices = snapshot.docs
        .map((noticeDoc) => ({ id: noticeDoc.id, ...noticeDoc.data() }))
        .sort((first, second) => getMillis(second.createdAt) - getMillis(first.createdAt));

      onUpdate(notices);
    },
    onError
  );
}

export async function createNotice({ title, content, category, authorName }) {
  const user = auth.currentUser;

  const docRef = await addDoc(collection(db, NOTICES_COLLECTION), {
    title: String(title ?? "").trim(),
    content: String(content ?? "").trim(),
    category: normalizeCategory(category),
    authorUid: user?.uid ?? "",
    authorName: String(authorName ?? user?.email ?? "").trim(),
    createdAt: serverTimestamp()
  });

  return docRef.id;
}

export async function updateNotice(noticeId, { title, content, category }) {
  await updateDoc(doc(db, NOTICES_COLLECTION, noticeId), {
    title: String(title ?? "").trim(),
    content: String(content ?? "").trim(),
    category: normalizeCategory(category)
  });
}

export async function deleteNotice(noticeId) {
  await deleteDoc(doc(db, NOTICES_COLLECTION, noticeId));
}

function normalizeCategory(category) {
  return NOTICE_CATEGORIES.some(({ value }) => value === category) ? category : "general";
}

function getMillis(timestamp) {
  if (timestamp && typeof timestamp.toMillis === "function") return timestamp.toMillis();
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}
