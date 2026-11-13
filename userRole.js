import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

import { db } from "./firebase.js";

export const EXECUTIVE_ROLE = "executive";
export const GENERAL_ROLE = "general";

// 소위원회 정의 (관리자 페이지의 어떤 항목을 열 수 있는지 함께 관리한다)
export const SUBCOMMITTEES = [
  {
    id: "resource",
    name: "공간·자원 배정 소위원회",
    description: "자원 예약 신청을 확인하고 승인 또는 반려합니다.",
    section: "resourceManagement",
    sectionName: "03 자원 예약 관리"
  },
  {
    id: "supplies",
    name: "공용물품 관리 소위원회",
    description: "공용물품 관리 기능은 준비 중입니다.",
    section: "",
    sectionName: "준비 중"
  },
  {
    id: "budget",
    name: "예산 관리 소위원회",
    description: "예산 신청을 확인하고 승인 또는 반려합니다.",
    section: "budgetManagement",
    sectionName: "01 예산 신청 관리"
  }
];

// 관리자 계정 (firestore.rules 의 isAdmin() 과 동일하게 유지)
export const ADMIN_EMAILS = [
  "a33272708@gmail.com",
  "khhsexploithub@gmail.com"
];

export function isAdminEmail(email) {
  return Boolean(email) && ADMIN_EMAILS.includes(email.toLowerCase());
}

export function getRoleName(role) {
  return role === EXECUTIVE_ROLE ? "연합회 임원" : "일반";
}

export function getSubcommittee(id) {
  return SUBCOMMITTEES.find((subcommittee) => subcommittee.id === id) ?? null;
}

const ADMIN_PROFILE = {
  role: EXECUTIVE_ROLE,
  printerAccess: true,
  subcommittees: SUBCOMMITTEES.map(({ id }) => id)
};

// 로그인한 계정의 권한 정보를 불러온다. 프로필이 없으면 '일반'으로 새로 만든다.
export async function resolveUserProfile(user) {
  if (!user) {
    return { role: GENERAL_ROLE, printerAccess: false, subcommittees: [] };
  }

  if (isAdminEmail(user.email)) {
    ensureProfileDocument(user);
    return { ...ADMIN_PROFILE };
  }

  const profileReference = doc(db, "users", user.uid);

  try {
    const snapshot = await getDoc(profileReference);

    if (!snapshot.exists()) {
      await setDoc(profileReference, {
        email: user.email ?? "",
        role: GENERAL_ROLE,
        createdAt: serverTimestamp()
      });

      return { role: GENERAL_ROLE, printerAccess: false, subcommittees: [] };
    }

    const data = snapshot.data();

    return {
      role: data.role === EXECUTIVE_ROLE ? EXECUTIVE_ROLE : GENERAL_ROLE,
      printerAccess: data.printerAccess === true,
      subcommittees: Array.isArray(data.subcommittees) ? data.subcommittees : []
    };
  } catch (error) {
    console.error("계정 권한 확인 오류:", error);
    return { role: GENERAL_ROLE, printerAccess: false, subcommittees: [] };
  }
}

export async function resolveUserRole(user) {
  const profile = await resolveUserProfile(user);
  return profile.role;
}

// 관리자 계정도 '계정 권한 관리' 목록에 보이도록 프로필 문서를 만들어 둔다.
async function ensureProfileDocument(user) {
  try {
    const profileReference = doc(db, "users", user.uid);
    const snapshot = await getDoc(profileReference);

    if (!snapshot.exists()) {
      await setDoc(profileReference, {
        email: user.email ?? "",
        role: GENERAL_ROLE,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("계정 프로필 생성 오류:", error);
  }
}
