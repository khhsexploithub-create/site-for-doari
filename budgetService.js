import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";

import { auth, db } from "../firebase.js";

export async function createBudgetRequest({
  clubName,
  requesterName,
  purpose,
  amount,
  description
}) {
  const user = auth.currentUser;

  const docRef = await addDoc(
    collection(db, "budgetRequests"),
    {
      requesterUid: user?.uid ?? "",
      clubName: clubName.trim(),
      requesterName: requesterName.trim(),
      purpose: purpose.trim(),
      amount: Number(amount),
      description: description.trim(),
      status: "pending",
      adminMemo: "",
      createdAt: serverTimestamp(),
      reviewedAt: null
    }
  );

  return docRef.id;
}

// 모든 구성원이 올린 예산 기록을 함께 본다.
export function subscribeToAllBudgetRequests(onUpdate, onError) {
  return onSnapshot(
    collection(db, "budgetRequests"),
    (snapshot) => onUpdate(toSortedBudgetRequests(snapshot)),
    onError
  );
}

export function subscribeToMyBudgetRequests(uid, onUpdate, onError) {
  const budgetRequestsQuery = query(
    collection(db, "budgetRequests"),
    where("requesterUid", "==", uid)
  );

  return onSnapshot(
    budgetRequestsQuery,
    (snapshot) => onUpdate(toSortedBudgetRequests(snapshot)),
    onError
  );
}

function toSortedBudgetRequests(snapshot) {
  return snapshot.docs
    .map((budgetRequestDoc) => ({
      id: budgetRequestDoc.id,
      ...budgetRequestDoc.data()
    }))
    .sort((first, second) => getTimestamp(second.createdAt) - getTimestamp(first.createdAt));
}

function getTimestamp(timestamp) {
  if (timestamp && typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}
