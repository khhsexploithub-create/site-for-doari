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


import { auth, db } from "../firebase.js";

const ACTIVITY_RECORDS_COLLECTION = "activityRecords";

// 같은 계정은 30분에 한 번만 조회수가 올라간다.
export const VIEW_COOLDOWN_MS = 30 * 60 * 1000;

export async function createActivityRecord({
  clubName, title, content, password, authorName
}) {
  const passwordSalt = createSalt();
  const user = auth.currentUser;

  await addDoc(collection(db, ACTIVITY_RECORDS_COLLECTION), {
    clubName: clubName.trim(),
    title: title.trim(),
    content: content.trim(),
    // 상세 페이지에서 '작성자 본인'인지 가리는 데 쓴다.
    authorUid: user?.uid ?? "",
    authorName: String(authorName ?? user?.email ?? "").trim(),
    // 비밀번호는 그대로 저장하지 않고, 임의의 salt 를 붙인 SHA-256 해시만 남긴다.
    passwordSalt,
    passwordHash: await hashPassword(password, passwordSalt),
    viewCount: 0,
    createdAt: serverTimestamp()
  });
}

// ========================================
// 활동 기록 비밀번호
// ========================================

function createSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, salt) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 저장된 해시와 입력한 비밀번호가 일치하는지 확인한다.
export async function isActivityPasswordCorrect(activityRecord, password) {
  if (!activityRecord?.passwordHash || !activityRecord?.passwordSalt) {
    return false;
  }

  const inputHash = await hashPassword(password, activityRecord.passwordSalt);
  return inputHash === activityRecord.passwordHash;
}

// 이 계정이 쓴 글인지. 작성자 계정이 없던 시절 글은 항상 거짓이다.
export function isActivityAuthor(activityRecord, uid) {
  return Boolean(uid) && activityRecord?.authorUid === uid;
}

export function hasActivityPassword(activityRecord) {
  return Boolean(activityRecord?.passwordHash && activityRecord?.passwordSalt);
}

// 비밀번호가 확인된 뒤에만 호출한다.
export async function deleteActivityRecordWithPassword(activityRecord, password) {
  if (!await isActivityPasswordCorrect(activityRecord, password)) {
    return false;
  }

  await deleteActivityRecord(activityRecord.id);
  return true;
}

// 상세 페이지에서 글 하나만 불러온다.
export async function getActivityRecord(recordId) {
  const snapshot = await getDoc(doc(db, ACTIVITY_RECORDS_COLLECTION, recordId));

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, viewCount: 0, ...snapshot.data() };
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
