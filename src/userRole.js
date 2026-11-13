import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

import { db } from "./firebase.js";

export const EXECUTIVE_ROLE = "executive";
export const GENERAL_ROLE = "general";

// 학번은 숫자 다섯 자리다. (예: 10712 = 1학년 7반 12번)
export const STUDENT_ID_PATTERN = /^[0-9]{5}$/;

export function isValidStudentId(studentId) {
  return STUDENT_ID_PATTERN.test(String(studentId ?? "").trim());
}

// 학번을 '1학년 7반 12번' 처럼 풀어서 보여준다.
export function describeStudentId(studentId) {
  const value = String(studentId ?? "").trim();
  if (!isValidStudentId(value)) return "";

  const grade = Number(value.slice(0, 1));
  const classNumber = Number(value.slice(1, 3));
  const studentNumber = Number(value.slice(3, 5));

  return `${grade}학년 ${classNumber}반 ${studentNumber}번`;
}
// 소위원회 정의 (관리자 페이지의 어떤 항목을 열 수 있는지 함께 관리한다)
// sections 는 관리자 화면에서 열 수 있는 항목이다. 한 소위원회가 여러 항목을 맡을 수 있다.
export const SUBCOMMITTEES = [
  {
    id: "resource",
    name: "공간·자원 배정 소위원회",
    description: "자원 예약 신청을 확인하고 승인 또는 반려합니다.",
    sections: ["resourceManagement"],
    sectionName: "03 자원 예약 관리"
  },
  {
    id: "supplies",
    name: "공용물품 관리 소위원회",
    description: "공용물품 관리 기능은 준비 중입니다.",
    sections: [],
    sectionName: "준비 중"
  },
  {
    id: "budget",
    name: "예산 관리 소위원회",
    description: "예산 신청을 확인하고 승인 또는 반려합니다.",
    sections: ["budgetManagement"],
    sectionName: "01 예산 신청 관리"
  },
  {
    id: "event",
    name: "행사운영 소위원회",
    description: "동아리 일정과 행사 홍보를 관리하고, 연합회 행사를 등록합니다.",
    sections: ["scheduleManagement", "eventManagement"],
    sectionName: "04 일정 관리 · 05 행사 홍보 관리 · 연합회 행사 등록"
  }
];

// 관리자 계정 (firestore.rules 의 isAdmin() 과 동일하게 유지)
export const ADMIN_EMAILS = [
  "a33272708@gmail.com",
  "khhsexploithub@gmail.com",
  "111@111.com"
];

export function isAdminEmail(email) {
  return Boolean(email) && ADMIN_EMAILS.includes(email.toLowerCase());
}

// ========================================
// 소속 동아리
// ========================================
// 소속 동아리는 한 곳만 고른다. 목록 형태로 담아 두어
// 나중에 여러 곳을 허용하더라도 기록을 그대로 쓸 수 있게 한다.

export const UNION_CLUB_NAME = "연합회 공통";

export function readClubs(data) {
  return Array.isArray(data?.clubs) ? data.clubs.filter(Boolean) : [];
}

// 아직 소속 동아리를 고르지 않은 계정인지. (선택 팝업을 띄울 기준)
export function needsClubChoice(profile) {
  return Boolean(profile) && !profile.isAdmin && readClubs(profile).length === 0;
}

export function getMyClub(profile) {
  return readClubs(profile)[0] ?? "";
}

// 이 계정이 어느 동아리의 부장인지. 없으면 빈 문자열.
export function getClubLeaderOf(profile) {
  const clubName = String(profile?.clubLeaderOf ?? "").trim();
  return readClubs(profile).includes(clubName) ? clubName : "";
}

export function isClubLeader(profile) {
  return Boolean(getClubLeaderOf(profile));
}

// 이 계정이 목록에서 볼 수 있는 과제의 동아리들.
// 연합회 공통은 모두가 본다. 관리자는 전체를 보므로 따로 거르지 않는다.
export function getReadableClubNames(profile) {
  return [...new Set([...readClubs(profile), UNION_CLUB_NAME])];
}

export function getRoleName(role) {
  return role === EXECUTIVE_ROLE ? "연합회 임원" : "일반";
}

// ========================================
// 소위원회 역할
// ========================================
// 소위원장(chair)  : 승인 · 반려 등 실제 처리 권한을 가진다. 소위원회당 1명.
// 소위원회 임원(member) : 관리 현황을 열람만 한다.
// 소속 없음(none)  : 관리 화면 자체를 열 수 없다.

export const SUBCOMMITTEE_CHAIR = "chair";
export const SUBCOMMITTEE_MEMBER = "member";
export const SUBCOMMITTEE_NONE = "none";

export const SUBCOMMITTEE_ROLE_OPTIONS = [
  { value: SUBCOMMITTEE_NONE, name: "없음", description: "관리 화면을 열 수 없습니다." },
  { value: SUBCOMMITTEE_MEMBER, name: "소위원회 임원", description: "관리 현황을 열람만 합니다." },
  { value: SUBCOMMITTEE_CHAIR, name: "소위원장", description: "승인 · 반려 등 처리 권한이 있습니다." }
];

export function getSubcommitteeRoleName(role) {
  return ({
    [SUBCOMMITTEE_CHAIR]: "소위원장",
    [SUBCOMMITTEE_MEMBER]: "소위원회 임원"
  })[role] ?? "없음";
}

// 저장된 계정 문서에서 소위원회별 역할을 읽어낸다.
// subcommitteeChairs 가 없던 시절에 저장된 계정은 전부 '소위원회 임원'으로 본다.
export function readSubcommitteeRoles(data) {
  const memberships = Array.isArray(data?.subcommittees) ? data.subcommittees : [];
  const chairs = Array.isArray(data?.subcommitteeChairs) ? data.subcommitteeChairs : [];
  const roles = {};

  SUBCOMMITTEES.forEach(({ id }) => {
    if (chairs.includes(id)) {
      roles[id] = SUBCOMMITTEE_CHAIR;
    } else if (memberships.includes(id)) {
      roles[id] = SUBCOMMITTEE_MEMBER;
    } else {
      roles[id] = SUBCOMMITTEE_NONE;
    }
  });

  return roles;
}

// 역할 표에서 저장용 배열 두 개를 만든다.
export function toSubcommitteeFields(roles) {
  const entries = Object.entries(roles ?? {});

  return {
    subcommittees: entries
      .filter(([, role]) => role === SUBCOMMITTEE_CHAIR || role === SUBCOMMITTEE_MEMBER)
      .map(([id]) => id),
    subcommitteeChairs: entries
      .filter(([, role]) => role === SUBCOMMITTEE_CHAIR)
      .map(([id]) => id)
  };
}

// 소위원회에 한 곳이라도 소속되어 있는지 (임원 · 소위원장 모두 포함)
export function hasSubcommittee(profile) {
  return Array.isArray(profile?.subcommittees) && profile.subcommittees.length > 0;
}

export function getSubcommitteeRole(profile, id) {
  return profile?.subcommitteeRoles?.[id] ?? SUBCOMMITTEE_NONE;
}

// 해당 소위원회의 소위원장인지 (관리자 계정은 항상 참)
export function isSubcommitteeChair(profile, id) {
  return getSubcommitteeRole(profile, id) === SUBCOMMITTEE_CHAIR;
}

// 한 곳이라도 소위원장인지. 공지 작성 권한을 줄 수 있는 대상인지 가리는 데 쓴다.
export function isAnySubcommitteeChair(profile) {
  return Array.isArray(profile?.subcommitteeChairs) && profile.subcommitteeChairs.length > 0;
}

// 계정 기록(users 문서)만 보고 소위원장인지 확인한다. (관리자 화면 목록용)
export function hasChairRecord(data) {
  return Array.isArray(data?.subcommitteeChairs) && data.subcommitteeChairs.length > 0;
}

// 공지 작성 권한.
// 관리자이거나, 관리자가 공지 권한을 준 소위원장만 공지를 쓸 수 있다.
export function canWriteNotice(profile) {
  if (profile?.isAdmin) return true;
  return profile?.noticeAccess === true && isAnySubcommitteeChair(profile);
}

// 연합회 행사 등록 권한. 행사운영 소위원장과 관리자.
export function canManageUnionEvent(profile) {
  return isSubcommitteeChair(profile, "event");
}

// 이 소위원회가 열 수 있는 관리자 화면 항목
export function getSubcommitteeSections(subcommittee) {
  return Array.isArray(subcommittee?.sections) ? subcommittee.sections : [];
}

export function getSubcommittee(id) {
  return SUBCOMMITTEES.find((subcommittee) => subcommittee.id === id) ?? null;
}

const ADMIN_PROFILE = {
  studentId: "",
  name: "",
  // 관리자는 모든 동아리를 보므로 소속을 따로 두지 않는다.
  clubs: [],
  clubLeaderOf: "",
  role: EXECUTIVE_ROLE,
  printerAccess: true,
  noticeAccess: true,
  subcommittees: SUBCOMMITTEES.map(({ id }) => id),
  subcommitteeChairs: SUBCOMMITTEES.map(({ id }) => id),
  subcommitteeRoles: Object.fromEntries(
    SUBCOMMITTEES.map(({ id }) => [id, SUBCOMMITTEE_CHAIR])
  ),
  isAdmin: true
};

// 로그인한 계정의 권한 정보를 불러온다. 프로필이 없으면 '일반'으로 새로 만든다.
export async function resolveUserProfile(user) {
  if (!user) {
    return emptyProfile();
  }

  if (isAdminEmail(user.email)) {
    const adminData = await ensureProfileDocument(user);
    return {
      ...ADMIN_PROFILE,
      studentId: String(adminData?.studentId ?? ""),
      name: String(adminData?.name ?? ""),
      clubs: readClubs(adminData),
      clubLeaderOf: String(adminData?.clubLeaderOf ?? "")
    };
  }

  const profileReference = doc(db, "users", user.uid);

  try {
    const snapshot = await getDoc(profileReference);

    if (!snapshot.exists()) {
      await setDoc(profileReference, {
        email: user.email ?? "",
        studentId: "",
        name: "",
        role: GENERAL_ROLE,
        createdAt: serverTimestamp()
      });

      return emptyProfile();
    }

    const data = snapshot.data();
    const subcommitteeRoles = readSubcommitteeRoles(data);

    return {
      studentId: String(data.studentId ?? ""),
      name: String(data.name ?? ""),
      clubs: readClubs(data),
      clubLeaderOf: String(data.clubLeaderOf ?? ""),
      role: data.role === EXECUTIVE_ROLE ? EXECUTIVE_ROLE : GENERAL_ROLE,
      printerAccess: data.printerAccess === true,
      noticeAccess: data.noticeAccess === true,
      subcommittees: Array.isArray(data.subcommittees) ? data.subcommittees : [],
      subcommitteeChairs: Array.isArray(data.subcommitteeChairs) ? data.subcommitteeChairs : [],
      subcommitteeRoles,
      isAdmin: false
    };
  } catch (error) {
    console.error("계정 권한 확인 오류:", error);
    return emptyProfile();
  }
}

function emptyProfile() {
  return {
    studentId: "",
    name: "",
    clubs: [],
    clubLeaderOf: "",
    role: GENERAL_ROLE,
    printerAccess: false,
    noticeAccess: false,
    subcommittees: [],
    subcommitteeChairs: [],
    subcommitteeRoles: readSubcommitteeRoles(null),
    isAdmin: false
  };
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

    if (snapshot.exists()) {
      return snapshot.data();
    }

    await setDoc(profileReference, {
      email: user.email ?? "",
      studentId: "",
      name: "",
      role: GENERAL_ROLE,
      createdAt: serverTimestamp()
    });

    return null;
  } catch (error) {
    console.error("계정 프로필 생성 오류:", error);
    return null;
  }
}

// 학번과 이름이 아직 저장되지 않은 계정인지. (입력 팝업을 띄울지 가리는 기준)
export function needsIdentity(profile) {
  return !isValidStudentId(profile?.studentId) || !String(profile?.name ?? "").trim();
}

// 화면에 이름을 보여줄 때 쓰는 표시 이름.
export function getDisplayName(profile, user) {
  const name = String(profile?.name ?? "").trim();
  if (name) return name;

  const email = user?.email ?? "";
  return email ? email.split("@")[0] : "이름 미등록";
}
