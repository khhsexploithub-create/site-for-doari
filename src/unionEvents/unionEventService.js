// 연합회가 주최하는 행사.
// 캘린더 페이지의 '행사 홍보'(clubEvents, 동아리가 올리는 행사)와는 별개의 컬렉션이다.
// 작성 · 수정 · 삭제는 행사운영 소위원장과 관리자만 한다. 읽기는 로그인한 모두.

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

export const UNION_EVENTS_COLLECTION = "unionEvents";

// 화면과 규칙에서 함께 쓰는 입력 항목
export const UNION_EVENT_FIELDS = [
  "title", "date", "startTime", "endTime",
  "location", "target", "content", "posterImage"
];

export function subscribeToUnionEvents(onUpdate, onError) {
  return onSnapshot(
    collection(db, UNION_EVENTS_COLLECTION),
    (snapshot) => {
      const unionEvents = snapshot.docs
        .map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() }))
        .sort((first, second) => `${first.date ?? ""}${first.startTime ?? ""}`
          .localeCompare(`${second.date ?? ""}${second.startTime ?? ""}`));

      onUpdate(unionEvents);
    },
    onError
  );
}

export async function createUnionEvent(unionEvent) {
  const user = auth.currentUser;

  const docRef = await addDoc(collection(db, UNION_EVENTS_COLLECTION), {
    ...cleanUnionEvent(unionEvent),
    authorUid: user?.uid ?? "",
    authorName: user?.email ?? "",
    createdAt: serverTimestamp()
  });

  return docRef.id;
}

export async function updateUnionEvent(eventId, unionEvent) {
  await updateDoc(doc(db, UNION_EVENTS_COLLECTION, eventId), cleanUnionEvent(unionEvent));
}

export async function deleteUnionEvent(eventId) {
  await deleteDoc(doc(db, UNION_EVENTS_COLLECTION, eventId));
}

function cleanUnionEvent({
  title, date, startTime, endTime, location, target, content, posterImage
}) {
  return {
    title: String(title ?? "").trim(),
    date: String(date ?? ""),
    startTime: String(startTime ?? ""),
    endTime: String(endTime ?? ""),
    location: String(location ?? "").trim(),
    target: String(target ?? "").trim(),
    content: String(content ?? "").trim(),
    posterImage: posterImage ?? ""
  };
}

// 오늘을 기준으로 다가오는 행사와 지난 행사로 나눈다.
export function splitByDate(unionEvents, todayKey) {
  const upcoming = unionEvents
    .filter((unionEvent) => (unionEvent.date ?? "") >= todayKey)
    .sort((first, second) => `${first.date}${first.startTime ?? ""}`
      .localeCompare(`${second.date}${second.startTime ?? ""}`));

  const past = unionEvents
    .filter((unionEvent) => (unionEvent.date ?? "") < todayKey)
    .sort((first, second) => `${second.date}${second.startTime ?? ""}`
      .localeCompare(`${first.date}${first.startTime ?? ""}`));

  return { upcoming, past };
}
