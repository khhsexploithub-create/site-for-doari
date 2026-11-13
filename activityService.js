import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";


import { db } from "../firebase.js";

const ACTIVITY_RECORDS_COLLECTION = "activityRecords";

// 같은 계정은 30분에 한 번만 조회수가 올라간다.
export const VIEW_COOLDOWN_MS = 30 * 60 * 1000;

export async function createActivityRecord({ clubName, title, content }) {
  await addDoc(collection(db, ACTIVITY_RECORDS_COLLECTION), {
    clubName: clubName.trim(),
    title: title.trim(),
    content: content.trim(),
    viewCount: 0,
    createdAt: serverTimestamp()
  });
}

export async function getActivityRecords() {
  const snapshot = await getDocs(collection(db, ACTIVITY_RECORDS_COLLECTION));

  return snapshot.docs
    .map((activityRecordDoc) => ({
      id: activityRecordDoc.id,
      viewCount: 0,
      ...activityRecordDoc.data()
    }))
    .sort((first, second) => getTimestamp(second.createdAt) - getTimestamp(first.createdAt));
}

// 30분 쿨다운을 확인하고, 지났을 때만 조회수를 1 올린다.
// 조회수가 실제로 올라갔으면 true 를 돌려준다.
export async function registerActivityView(recordId, uid) {
  const viewReference = doc(db, ACTIVITY_RECORDS_COLLECTION, recordId, "views", uid);
  const snapshot = await getDoc(viewReference);

  if (snapshot.exists()) {
    const data = snapshot.data();
    const lastViewedAt = Number(data.lastViewedAtMs) || getTimestamp(data.lastViewedAt);

    if (lastViewedAt && Date.now() - lastViewedAt < VIEW_COOLDOWN_MS) {
      return false;
    }
  }

  await setDoc(viewReference, {
    lastViewedAt: serverTimestamp(),
    lastViewedAtMs: Date.now()
  });

  await updateDoc(doc(db, ACTIVITY_RECORDS_COLLECTION, recordId), {
    viewCount: increment(1)
  });

  return true;
}

// ========================================
// 댓글
// ========================================

export function subscribeToActivityComments(recordId, onUpdate, onError) {
  return onSnapshot(
    collection(db, ACTIVITY_RECORDS_COLLECTION, recordId, "comments"),
    (snapshot) => {
      const comments = snapshot.docs
        .map((commentDoc) => ({ id: commentDoc.id, ...commentDoc.data() }))
        .sort((first, second) => getTimestamp(first.createdAt) - getTimestamp(second.createdAt));

      onUpdate(comments);
    },
    onError
  );
}

export async function createActivityComment(recordId, { content, authorUid, authorName }) {
  await addDoc(collection(db, ACTIVITY_RECORDS_COLLECTION, recordId, "comments"), {
    content: content.trim(),
    authorUid,
    authorName,
    createdAt: serverTimestamp()
  });
}

export async function deleteActivityComment(recordId, commentId) {
  await deleteDoc(doc(db, ACTIVITY_RECORDS_COLLECTION, recordId, "comments", commentId));
}

// ========================================
// 관리자 전용
// ========================================

export async function updateActivityRecord(id, { clubName, title, content }) {
  await updateDoc(doc(db, ACTIVITY_RECORDS_COLLECTION, id), {
    clubName: clubName.trim(),
    title: title.trim(),
    content: content.trim()
  });
}

export async function deleteActivityRecord(id) {
  await deleteDoc(doc(db, ACTIVITY_RECORDS_COLLECTION, id));
}

function getTimestamp(timestamp) {
  if (timestamp && typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}
