// 예산 신청 종류와 긴급 신청 규칙.
//
//  일반 신청: 토요일 예산 소위원회 회의에서 심의한다.
//  긴급 신청: 다음 회의를 기다릴 수 없을 때만. 연합회장(관리자) 또는 예산 소위원장이 바로 승인한다.
//             남용을 막기 위해 아래 규칙을 둔다.
//
// ⚠ 금액 상한 · 사유 길이 · 한 달 횟수는 firestore.rules 에서도 똑같이 막는다.
//   여기 숫자를 바꾸면 firestore.rules 의 budgetRequests · budgetUrgentUsage 부분도 함께 바꾼다.

import { doc, getDoc } from "firebase/firestore";

import { db } from "../firebase.js";

export const REQUEST_TYPES = {
  normal: "일반 신청",
  urgent: "긴급 신청"
};

export const URGENT_POLICY = {
  maxAmount: 100000,      // 긴급 신청 총액 상한 (원)
  minReasonLength: 20,    // 긴급 사유 최소 글자 수
  maxReasonLength: 500,
  minApprovalMemo: 5      // 긴급 승인 때 남겨야 하는 승인 사유 최소 글자 수
  // 동아리마다 한 달에 1번 (budgetUrgentUsage 문서가 한 달에 하나만 생길 수 있다)
};

// 토요일 회의. 금요일 18시까지 낸 신청이 그 주 토요일 회의에 올라간다.
export const MEETING = {
  weekday: 6,       // 토요일
  cutoffHour: 18    // 전날(금) 18시 마감
};

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 이 시각에 낸 일반 신청이 심의될 토요일 회의 날짜.
export function getMeetingDate(from = new Date()) {
  const meeting = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  meeting.setDate(meeting.getDate() + ((MEETING.weekday - meeting.getDay() + 7) % 7));

  const cutoff = new Date(meeting);
  cutoff.setDate(cutoff.getDate() - 1);
  cutoff.setHours(MEETING.cutoffHour, 0, 0, 0);

  if (from >= cutoff) meeting.setDate(meeting.getDate() + 7);
  return meeting;
}

export function toDateKey(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey ?? "").split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return Number.isNaN(date.getTime()) || !year ? null : date;
}

// "10/24(토)"
export function formatShortDate(dateOrKey) {
  const date = typeof dateOrKey === "string" ? parseDateKey(dateOrKey) : dateOrKey;
  if (!date) return "날짜 미정";
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAY_NAMES[date.getDay()]})`;
}

// 한 달 횟수를 세는 열쇠. 규칙(firestore.rules)이 서버 시각(UTC)으로 같은 값을 만들어 대조한다.
export function getUrgentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
}

export function getUrgentUsageId(clubName, date = new Date()) {
  return `${clubName}_${getUrgentMonthKey(date)}`;
}

// 이 동아리가 이번 달 긴급 신청을 이미 썼는지.
// 서버 보안 규칙이 옛 버전이면 이 기록을 읽을 수 없다 → "rules-not-deployed" 오류
export async function hasUsedUrgentThisMonth(clubName) {
  if (!clubName) return false;

  try {
    const snapshot = await getDoc(doc(db, "budgetUrgentUsage", getUrgentUsageId(clubName)));
    return snapshot.exists();
  } catch (error) {
    if (error?.code === "permission-denied") throw new Error("rules-not-deployed");
    throw error;
  }
}

// 긴급 신청서 검사. 문제가 없으면 빈 문자열.
export function validateUrgentRequest({ amount, reason, neededBy, now = new Date() }) {
  if (amount > URGENT_POLICY.maxAmount) {
    return `긴급 신청은 총액 ${URGENT_POLICY.maxAmount.toLocaleString("ko-KR")}원까지예요. 일반 신청으로 내주세요.`;
  }

  const neededDate = parseDateKey(neededBy);
  if (!neededBy || !neededDate) return "필요한 날짜를 골라주세요.";

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (neededDate < today) return "필요한 날짜가 이미 지났어요.";

  // 다음 회의 전에 꼭 필요한 경우만 긴급이다.
  const meeting = getMeetingDate(now);
  if (neededDate >= meeting) {
    return `${formatShortDate(meeting)} 회의에서 심의받을 수 있는 날짜예요. 일반 신청으로 내주세요.`;
  }

  const reasonLength = String(reason ?? "").trim().length;
  if (reasonLength < URGENT_POLICY.minReasonLength) {
    return `긴급한 이유를 ${URGENT_POLICY.minReasonLength}자 이상 적어주세요. (지금 ${reasonLength}자)`;
  }

  return "";
}

export function getRequestType(budgetRequest) {
  return budgetRequest?.requestType === "urgent" ? "urgent" : "normal";
}
