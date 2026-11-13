import "../style.css";

import { guardPage } from "../pageGuard.js";
import {
  createBudgetRequest,
  subscribeToAllBudgetRequests,
  subscribeToMyBudgetRequests
} from "./budgetService.js";

const form = document.querySelector("#budgetRequestForm");
const submitButton = document.querySelector("#budgetSubmitButton");
const resultMessage = document.querySelector("#budgetResultMessage");
const clubNameInput = document.querySelector("#clubName");
const requesterNameInput = document.querySelector("#requesterName");
const purposeInput = document.querySelector("#purpose");
const amountInput = document.querySelector("#amount");
const descriptionInput = document.querySelector("#description");

const authMessage = document.querySelector("#budgetAuthMessage");
const myRequestsList = document.querySelector("#myBudgetRequestsList");
const budgetTotalAllocated = document.querySelector("#budgetTotalAllocated");
const budgetUsedAmount = document.querySelector("#budgetUsedAmount");
const budgetRemainingAmount = document.querySelector("#budgetRemainingAmount");
const budgetRecordList = document.querySelector("#budgetRecordList");

let isSubmitting = false;
let unsubscribeFromMyBudgetRequests = null;
let unsubscribeFromAllBudgetRequests = null;

guardPage({
  requireExecutive: true,
  onReady: ({ user }) => {
    unsubscribeFromMyBudgetRequests?.();
    unsubscribeFromAllBudgetRequests?.();

    submitButton.disabled = false;
    authMessage.textContent = `로그인 계정: ${user.email ?? "이메일 정보 없음"}`;

    subscribeToBudgetRequests(user.uid);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmitting) {
    return;
  }

  const budgetRequest = {
    clubName: clubNameInput.value,
    requesterName: requesterNameInput.value,
    purpose: purposeInput.value,
    amount: amountInput.value,
    description: descriptionInput.value
  };

  if (!isValidBudgetRequest(budgetRequest)) {
    resultMessage.textContent = "모든 필수 항목을 입력해주세요.";
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "신청 중...";
  resultMessage.textContent = "";

  try {
    await createBudgetRequest(budgetRequest);
    resultMessage.textContent = "예산 신청이 완료되었습니다.";
    form.reset();
  } catch (error) {
    console.error(error);
    resultMessage.textContent = "예산 신청 중 오류가 발생했습니다.";
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "예산 신청";
  }
});

function isValidBudgetRequest({
  clubName,
  requesterName,
  purpose,
  amount,
  description
}) {
  const parsedAmount = Number(amount);

  return Boolean(
    clubName.trim() &&
    requesterName.trim() &&
    purpose.trim() &&
    description.trim() &&
    amount !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0
  );
}

function subscribeToBudgetRequests(uid) {
  myRequestsList.textContent = "내 예산 신청을 불러오는 중...";
  budgetRecordList.textContent = "예산 기록을 불러오는 중...";

  // 내 예산 신청 (본인 것만)
  unsubscribeFromMyBudgetRequests = subscribeToMyBudgetRequests(
    uid,
    renderMyBudgetRequests,
    (error) => {
      console.error("내 예산 신청 조회 오류:", error);
      myRequestsList.textContent = "내 예산 신청을 불러오지 못했습니다.";
    }
  );

  // 예산 현황과 최근 기록 (모든 구성원의 기록)
  unsubscribeFromAllBudgetRequests = subscribeToAllBudgetRequests(
    renderBudgetDashboard,
    (error) => {
      console.error("전체 예산 기록 조회 오류:", error);
      resetBudgetDashboard("예산 기록을 불러오지 못했습니다.");
    }
  );
}

function renderBudgetDashboard(budgetRequests) {
  const totalAllocated = sumAmounts(budgetRequests, "approved", "completed");
  const usedAmount = sumAmounts(budgetRequests, "completed");

  budgetTotalAllocated.textContent = formatAmount(totalAllocated);
  budgetUsedAmount.textContent = formatAmount(usedAmount);
  budgetRemainingAmount.textContent = formatAmount(Math.max(totalAllocated - usedAmount, 0));

  renderRecentBudgetRecords(
    budgetRequests
      .filter(({ status }) => ["approved", "completed", "assembly"].includes(status))
      .sort((first, second) => getTimestamp(second.reviewedAt ?? second.createdAt) - getTimestamp(first.reviewedAt ?? first.createdAt))
      .slice(0, 8)
  );
}

function renderRecentBudgetRecords(budgetRequests) {
  budgetRecordList.textContent = "";

  if (budgetRequests.length === 0) {
    budgetRecordList.textContent = "승인 · 사용 완료 · 본 회의 안건 상정 기록이 없습니다.";
    return;
  }

  budgetRequests.forEach((budgetRequest) => {
    const item = document.createElement("li");
    item.className = `budget-record-item status-${budgetRequest.status ?? "approved"}`;
    const details = document.createElement("div");
    const purpose = document.createElement("strong");
    const metadata = document.createElement("span");
    const amount = document.createElement("b");

    purpose.textContent = budgetRequest.purpose ?? "사용 목적 없음";

    const statusBadge = document.createElement("span");
    statusBadge.className = `budget-record-badge status-${budgetRequest.status ?? "approved"}`;
    statusBadge.textContent = getStatusName(budgetRequest.status);
    purpose.appendChild(statusBadge);
    metadata.textContent = `${budgetRequest.clubName ?? "동아리명 없음"} · ${budgetRequest.requesterName ?? "신청자 미상"} · ${formatDate(budgetRequest.reviewedAt ?? budgetRequest.createdAt)}`;
    amount.textContent = formatAmount(budgetRequest.amount);
    details.append(purpose, metadata);
    item.append(details, amount);
    budgetRecordList.appendChild(item);
  });
}

function sumAmounts(budgetRequests, ...statuses) {
  return budgetRequests
    .filter(({ status }) => statuses.includes(status))
    .reduce((total, { amount }) => total + (Number(amount) || 0), 0);
}

function resetBudgetDashboard(message = "예산 기록을 불러오지 못했습니다.") {
  budgetTotalAllocated.textContent = formatAmount(0);
  budgetUsedAmount.textContent = formatAmount(0);
  budgetRemainingAmount.textContent = formatAmount(0);
  budgetRecordList.textContent = message;
}

function renderMyBudgetRequests(budgetRequests) {
  myRequestsList.textContent = "";

  if (budgetRequests.length === 0) {
    myRequestsList.textContent = "아직 제출한 예산 신청이 없습니다.";
    return;
  }

  budgetRequests.forEach((budgetRequest) => {
    const item = document.createElement("li");
    item.className = `my-budget-request status-${budgetRequest.status ?? "pending"}`;

    const heading = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = budgetRequest.clubName ?? "동아리명 없음";
    const purpose = document.createElement("span");
    purpose.textContent = budgetRequest.purpose ?? "사용 목적 없음";
    heading.append(title, purpose);

    const details = document.createElement("div");
    details.className = "my-budget-request-details";
    details.append(
      createDetail("신청 금액", formatAmount(budgetRequest.amount)),
      createDetail("상세 설명", budgetRequest.description ?? "상세 설명 없음"),
      createDetail("신청일", formatDate(budgetRequest.createdAt)),
      createDetail("처리 상태", getStatusName(budgetRequest.status)),
      createDetail("관리자 의견", budgetRequest.adminMemo?.trim() || "등록된 의견이 없습니다.")
    );

    item.append(heading, details);
    myRequestsList.appendChild(item);
  });
}

function createDetail(label, value) {
  const paragraph = document.createElement("p");
  const labelElement = document.createElement("b");
  labelElement.textContent = `${label}: `;
  paragraph.append(labelElement, document.createTextNode(value));
  return paragraph;
}

function getStatusName(status) {
  return ({
    approved: "승인됨",
    completed: "사용 완료",
    rejected: "반려됨",
    assembly: "본 회의 안건 상정",
    pending: "승인 대기"
  })[status] ?? "승인 대기";
}

function formatAmount(amount) {
  const parsedAmount = Number(amount);
  return Number.isFinite(parsedAmount) ? `${parsedAmount.toLocaleString("ko-KR")}원` : "금액 정보 없음";
}

function formatDate(timestamp) {
  if (!timestamp) return "신청일 정보 없음";
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "신청일 정보 없음" : date.toLocaleString("ko-KR");
}

function getTimestamp(timestamp) {
  if (timestamp && typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}
