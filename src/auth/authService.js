// 로그인 · 회원가입 · 학번 저장을 한곳에서 다룬다.
// 계정 종류(연합회 임원 / 일반)는 로그인할 때 고르지 않는다.
// 모두 '일반'으로 가입하고, 권한은 관리자가 나중에 올려준다.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { auth, db } from "../firebase.js";
import { clearPushOnSignOut } from "../push/pushService.js";
import { GENERAL_ROLE, isValidStudentId, readClubs } from "../userRole.js";

export async function signIn(email, password) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOutUser() {
  // 이 기기의 푸시 토큰을 먼저 지운다. 로그아웃 뒤에는 권한이 없어 지울 수 없다.
  try {
    await clearPushOnSignOut(auth.currentUser);
  } catch (error) {
    console.error("푸시 알림 해제 오류:", error);
  }
  await signOut(auth);
}

// 가입과 동시에 학번 · 이름 · 소속 동아리까지 계정 기록에 담는다.
export async function signUp({ email, password, studentId, name, clubs }) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = credential.user;
  const profileReference = doc(db, "users", user.uid);

  try {
    await setDoc(profileReference, {
      email: user.email ?? email.trim(),
      studentId: String(studentId).trim(),
      name: String(name).trim(),
      clubs: cleanClubs(clubs),
      role: GENERAL_ROLE,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    // 다른 화면이 먼저 빈 계정 기록을 만들어 둔 경우가 있다.
    // 그때는 새로 쓰는 대신 학번과 이름만 채워 넣는다.
    console.error("계정 기록 생성 오류, 학번·이름만 저장합니다:", error);

    await updateDoc(profileReference, {
      studentId: String(studentId).trim(),
      name: String(name).trim(),
      clubs: cleanClubs(clubs),
      updatedAt: serverTimestamp()
    });
  }

  return user;
}

// 예전에 가입해서 학번 · 이름이 비어 있는 계정이 뒤늦게 채워 넣는다.
// 규칙에서도 '비어 있을 때 한 번만' 허용하므로, 한 번 저장하면 관리자만 고칠 수 있다.
export async function saveIdentity({ studentId, name }) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }

  if (!isValidStudentId(studentId)) {
    throw new Error("학번은 숫자 5자리로 입력해주세요.");
  }

  if (!String(name).trim()) {
    throw new Error("이름을 입력해주세요.");
  }

  const profileReference = doc(db, "users", user.uid);
  const snapshot = await getDoc(profileReference);

  const payload = {
    studentId: String(studentId).trim(),
    name: String(name).trim(),
    updatedAt: serverTimestamp()
  };

  // 계정 기록이 아직 없으면 새로 만든다. (아주 예전에 가입한 계정)
  if (!snapshot.exists()) {
    await setDoc(profileReference, {
      email: user.email ?? "",
      role: GENERAL_ROLE,
      createdAt: serverTimestamp(),
      ...payload
    });
    return;
  }

  await updateDoc(profileReference, payload);
}

// 소속 동아리는 한 곳만 담는다. 목록 형태는 유지한다.
function cleanClubs(clubs) {
  const list = Array.isArray(clubs) ? clubs : [clubs];
  const first = String(list[0] ?? "").trim();
  return first ? [first] : [];
}

// 예전에 가입해서 소속 동아리가 비어 있는 계정이 뒤늦게 채워 넣는다.
// 규칙에서도 '비어 있을 때 한 번만' 허용하므로, 한 번 저장하면 관리자만 고칠 수 있다.
export async function saveClubs(clubs) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }

  const cleaned = cleanClubs(clubs);

  if (cleaned.length === 0) {
    throw new Error("소속 동아리를 골라주세요.");
  }

  const profileReference = doc(db, "users", user.uid);
  const snapshot = await getDoc(profileReference);

  if (snapshot.exists() && readClubs(snapshot.data()).length > 0) {
    throw new Error("이미 소속 동아리가 저장되어 있습니다. 바꾸려면 연합회에 문의해주세요.");
  }

  if (!snapshot.exists()) {
    await setDoc(profileReference, {
      email: user.email ?? "",
      studentId: "",
      name: "",
      clubs: cleaned,
      role: GENERAL_ROLE,
      createdAt: serverTimestamp()
    });
    return;
  }

  await updateDoc(profileReference, {
    clubs: cleaned,
    updatedAt: serverTimestamp()
  });
}

// 파이어베이스가 돌려주는 오류 부호를 사람이 읽을 말로 바꾼다.
export function getAuthErrorMessage(code) {
  return ({
    "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/wrong-password": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/user-not-found": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/email-already-in-use": "이미 가입된 이메일입니다.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
    "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
    "auth/operation-not-allowed": "이메일 로그인이 비활성화되어 있습니다. 관리자에게 문의하세요.",
    "auth/network-request-failed": "네트워크 연결을 확인해주세요."
  })[code] ?? "처리 중 오류가 발생했습니다.";
}

// 로그인한 뒤 돌아갈 주소. 다른 사이트로 튕기지 않도록 우리 주소만 받는다.
export function readNextUrl() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function buildLoginUrl(nextUrl = window.location.pathname + window.location.search) {
  return `/login.html?next=${encodeURIComponent(nextUrl)}`;
}
