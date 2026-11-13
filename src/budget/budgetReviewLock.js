// 예산 심사 비밀번호 (예산관리소위원회 공통).
//
// 승인 · 반려 같은 처리를 하려면 먼저 '심사 시작'에서 비밀번호를 넣어야 한다.
// 맞으면 budgetReviewSessions/{uid} 가 생기고 12시간 동안 처리할 수 있다.
// 비밀번호가 맞는지는 서버 규칙(firestore.rules)이 대조한다. 정답 해시는 화면 쪽에서 볼 수 없다.

import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

import { auth, db } from "../firebase.js";

const REVIEW_SALT = "neoul-budget-review";

// 규칙은 12시간까지 허용한다. 기기 시계가 조금 빨라도 거절되지 않게 조금 짧게 잡는다.
const SESSION_MS = 11.5 * 60 * 60 * 1000;

export async function hashReviewPassword(password) {
  const encoded = new TextEncoder().encode(`${REVIEW_SALT}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionRef() {
  return doc(db, "budgetReviewSessions", auth.currentUser?.uid ?? "_");
}

// 아직 유효한 심사 세션이 있으면 끝나는 시각(Date), 없으면 null.
export async function readReviewSession() {
  if (!auth.currentUser) return null;

  try {
    const snapshot = await getDoc(sessionRef());
    const expiresAt = snapshot.exists() ? snapshot.data().expiresAt?.toDate?.() : null;
    return expiresAt && expiresAt > new Date() ? expiresAt : null;
  } catch {
    return null;
  }
}

// 서버 보안 규칙(firestore.rules)이 새 버전인지 확인한다.
// 새 규칙은 내 심사 세션 문서를 읽게 해 주고, 옛 규칙은 이 컬렉션을 몰라서 거절한다.
export async function hasReviewRules() {
  try {
    await getDoc(sessionRef());
    return true;
  } catch (error) {
    return error?.code !== "permission-denied";
  }
}

// 비밀번호가 틀리면 규칙에서 거절된다 → null
// 규칙 자체가 아직 배포되지 않았으면 "rules-not-deployed" 오류를 던진다.
export async function startReviewSession(password) {
  const expiresAt = new Date(Date.now() + SESSION_MS);

  try {
    await setDoc(sessionRef(), {
      passwordHash: await hashReviewPassword(password),
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: serverTimestamp()
    });
    return expiresAt;
  } catch (error) {
    if (error?.code !== "permission-denied") throw error;
    if (!(await hasReviewRules())) throw new Error("rules-not-deployed");
    return null;
  }
}

export async function endReviewSession() {
  try {
    await deleteDoc(sessionRef());
  } catch (error) {
    console.error("심사 세션 종료 오류:", error);
  }
}

// 관리자 전용. 심사 비밀번호를 바꾼다. 바꾸면 기존 심사 세션은 모두 끝난다.
export async function saveReviewPassword(password) {
  await setDoc(doc(db, "settings", "budgetReview"), {
    passwordHash: await hashReviewPassword(password),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid ?? ""
  });
}
