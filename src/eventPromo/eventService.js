import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";

import { auth, db } from "../firebase.js";

export const EVENTS_COLLECTION = "clubEvents";

export function getEventUrl(eventId) {
  return `/event/${encodeURIComponent(eventId)}`;
}

export async function createClubEvent({
  clubName,
  title,
  date,
  startTime,
  endTime,
  location,
  promotion,
  plan,
  posterImage
}) {
  const user = auth.currentUser;

  const docRef = await addDoc(collection(db, EVENTS_COLLECTION), {
    clubName: clubName.trim(),
    title: title.trim(),
    date,
    startTime,
    endTime,
    location: location.trim(),
    promotion: promotion.trim(),
    plan: plan.trim(),
    posterImage: posterImage ?? "",
    createdAt: serverTimestamp(),
    createdBy: user?.uid ?? ""
  });

  return docRef.id;
}

export function subscribeToClubEvents(onUpdate, onError) {
  return onSnapshot(
    collection(db, EVENTS_COLLECTION),
    (snapshot) => {
      const events = snapshot.docs
        .map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() }))
        .sort((first, second) => `${first.date ?? ""}${first.startTime ?? ""}`
          .localeCompare(`${second.date ?? ""}${second.startTime ?? ""}`));

      onUpdate(events);
    },
    onError
  );
}

export async function getClubEvent(eventId) {
  const snapshot = await getDoc(doc(db, EVENTS_COLLECTION, eventId));

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

// 관리자 화면에서 등록된 행사를 고친다.
export async function updateClubEvent(eventId, {
  clubName,
  title,
  date,
  startTime,
  endTime,
  location,
  promotion,
  plan,
  posterImage
}) {
  await updateDoc(doc(db, EVENTS_COLLECTION, eventId), {
    clubName: clubName.trim(),
    title: title.trim(),
    date,
    startTime,
    endTime,
    location: location.trim(),
    promotion: promotion.trim(),
    plan: plan.trim(),
    posterImage: posterImage ?? ""
  });
}

export async function deleteClubEvent(eventId) {
  await deleteDoc(doc(db, EVENTS_COLLECTION, eventId));
}

// ========================================
// 의견 (댓글)
// ========================================

export function subscribeToEventComments(eventId, onUpdate, onError) {
  return onSnapshot(
    collection(db, EVENTS_COLLECTION, eventId, "comments"),
    (snapshot) => {
      const comments = snapshot.docs
        .map((commentDoc) => ({ id: commentDoc.id, ...commentDoc.data() }))
        .sort((first, second) => getTimestamp(first.createdAt) - getTimestamp(second.createdAt));

      onUpdate(comments);
    },
    onError
  );
}

export async function createEventComment(eventId, { content, authorUid, authorName }) {
  await addDoc(collection(db, EVENTS_COLLECTION, eventId, "comments"), {
    content: content.trim(),
    authorUid,
    authorName,
    createdAt: serverTimestamp()
  });
}

export async function deleteEventComment(eventId, commentId) {
  await deleteDoc(doc(db, EVENTS_COLLECTION, eventId, "comments", commentId));
}

function getTimestamp(timestamp) {
  if (timestamp && typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}
