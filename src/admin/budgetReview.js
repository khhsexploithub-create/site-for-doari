// 01 예산 관리 — 품목 단위 심사 표.
//
// 신청서 전체를 한 번에 승인 · 반려하던 것을 품목별로 나눴다.
// 필요한 것만 승인하고 나머지는 사유를 적어 반려할 수 있다.

import { ITEM_KINDS, formatMoney } from "../budget/requestSheet.js";
import {
  getApprovedItemsKey,
  resolveReviewedStatus,
  reviewBudgetItems
} from "../budget/budgetService.js";

const ITEM_STATUS_NAME = {
  pending: "대기",
  approved: "승인",
  rejected: "반려"
};

export function getItemStatus(item) {
  const status = String(item?.status ?? "pending");
  return ITEM_STATUS_NAME[status] ? status : "pending";
}

export function getRequestStatusName(status) {
  return ({
    pending: "심사 대기",
    approved: "승인",
    partial: "부분 승인",
    rejected: "반려",
    confirmed: "연합회장 확인 완료",
    completed: "처리 완료",
    assembly: "본 회의 안건"
  })[status] ?? "심사 대기";
}

// 품목 심사 표를 만든다. canReview 가 거짓이면 보기만 한다.
//  getAdminMemo: 카드의 '관리자 의견' 칸에 지금 적힌 내용 (저장할 때 함께 보낸다)
//  beforeChange: 상태를 바꾸기 전에 확인할 것. 문제가 있으면 안내 문장을 돌려준다. (긴급 신청의 승인 사유 등)
//  onDenied: 서버 규칙에 거절됐을 때 (심사 시간이 끝났거나 심사 비밀번호가 바뀐 경우)
//  reviewerName: 처리한 사람 이름 (기록으로 남긴다)
//  headActions: 전체 승인 · 전체 반려 옆에 함께 둘 단추들 (연합회장 확인 등)
//  holdRender: 저장하는 동안 목록을 다시 그리지 않도록 잡아 두는 함수. 놓아주는 함수를 돌려준다.
export function createBudgetItemReview({
  budgetRequest,
  items,
  canReview,
  onSaved,
  getAdminMemo = () => budgetRequest.adminMemo ?? "",
  beforeChange = () => "",
  onDenied = null,
  reviewerName = "",
  headActions = [],
  holdRender = null
}) {
  // 원본을 건드리지 않도록 복사본으로 다룬다.
  let workingItems = items.map((item) => ({ ...item, status: getItemStatus(item) }));
  let isSaving = false;
  // 마지막으로 저장된 상태. 연합회장 확인 · 처리 완료를 지킬지 정할 때 쓴다.
  let savedStatus = String(budgetRequest.status ?? "pending");
  let savedApprovedKey = getApprovedItemsKey(workingItems);

  const wrap = document.createElement("div");
  wrap.className = "review-wrap";

  const head = document.createElement("div");
  head.className = "review-head";

  const summary = document.createElement("p");
  summary.className = "review-summary";

  const bulkActions = document.createElement("div");
  bulkActions.className = "review-bulk";

  if (canReview) {
    bulkActions.append(
      createButton("전체 승인", "review-bulk-approve", () => setAllStatuses("approved")),
      createButton("전체 반려", "review-bulk-reject", () => setAllStatuses("rejected"))
    );
  }

  bulkActions.append(...headActions.filter(Boolean));

  head.append(summary, bulkActions);

  const table = document.createElement("table");
  table.className = "review-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  ["#", "종류", "품목", "수량", "단가", "금액", "세부 내용", "상태"].forEach((text) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    headRow.appendChild(cell);
  });

  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  table.append(thead, tbody);

  const message = document.createElement("p");
  message.className = "message review-message";
  message.setAttribute("role", "status");

  wrap.append(head, table, message);

  function canChange() {
    const problem = beforeChange();
    message.textContent = problem;
    return !problem;
  }

  function setAllStatuses(status) {
    if (!canChange()) return;
    workingItems = workingItems.map((item) => ({
      ...item,
      status,
      reviewMemo: status === "rejected" ? item.reviewMemo ?? "" : ""
    }));
    render();
    save();
  }

  function setStatus(index, status) {
    if (!canChange()) return;
    const item = workingItems[index];
    // 같은 단추를 다시 누르면 대기로 되돌린다.
    item.status = item.status === status ? "pending" : status;
    if (item.status !== "rejected") item.reviewMemo = "";
    render();
    save();
  }

  async function save() {
    if (!canReview || isSaving) return;

    isSaving = true;
    message.textContent = "저장 중...";
    const releaseRender = holdRender?.();

    const nextStatus = resolveReviewedStatus(savedStatus, savedApprovedKey, workingItems);
    const droppedConfirm = ["confirmed", "completed"].includes(savedStatus) && nextStatus !== savedStatus;

    try {
      await reviewBudgetItems(budgetRequest.id, workingItems, getAdminMemo(), reviewerName, nextStatus);
      savedStatus = nextStatus;
      savedApprovedKey = getApprovedItemsKey(workingItems);
      message.textContent = droppedConfirm
        ? "심사 내용을 저장했습니다. 승인 품목이 바뀌어 연합회장 확인을 다시 받아야 해요."
        : "심사 내용을 저장했습니다.";
      onSaved?.(workingItems, nextStatus);
    } catch (error) {
      console.error("예산 품목 심사 오류:", error);

      if (error?.code === "permission-denied") {
        message.textContent = "저장하지 못했어요. 심사 비밀번호를 다시 넣어주세요.";
        onDenied?.();
        return;
      }

      message.textContent = "저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
    } finally {
      isSaving = false;
      // 저장 결과 문구를 잠깐 보여 준 뒤 실시간 목록을 다시 그린다.
      if (releaseRender) setTimeout(releaseRender, 700);
    }
  }

  function render() {
    tbody.textContent = "";

    let visibleNumber = 0;

    workingItems.forEach((item, index) => {
      if (!item.isShipping) visibleNumber += 1;
      tbody.appendChild(createRow(item, index, item.isShipping ? "↳" : String(visibleNumber)));
    });

    const approved = workingItems.filter((item) => item.status === "approved");
    const rejected = workingItems.filter((item) => item.status === "rejected");
    const approvedAmount = approved.reduce((total, item) => total + (Number(item.amount) || 0), 0);

    summary.textContent =
      `${getRequestStatusName(resolveReviewedStatus(savedStatus, savedApprovedKey, workingItems))}`
      + ` · 승인 ${approved.length}건 ${formatMoney(approvedAmount)}원`
      + ` · 반려 ${rejected.length}건`
      + ` · 대기 ${workingItems.length - approved.length - rejected.length}건`;
  }

  function createRow(item, index, numberLabel) {
    const row = document.createElement("tr");
    row.className = `review-row is-${item.status}${item.isShipping ? " is-shipping" : ""}`;

    row.appendChild(cell(numberLabel, "review-cell-number"));

    // --- 종류 ---
    const kindCell = document.createElement("td");
    const kindTag = document.createElement("span");
    const kindIndex = ITEM_KINDS.indexOf(item.kind);
    kindTag.className = `budget-kind-chip is-${kindIndex >= 0 ? kindIndex + 1 : 1}`;
    kindTag.textContent = item.kind || "재료";
    kindCell.appendChild(kindTag);
    row.appendChild(kindCell);

    // --- 품목 (구매 링크가 있으면 링크로) ---
    const nameCell = document.createElement("td");
    nameCell.className = "review-cell-name";
    const label = item.isShipping ? `┗ ${item.itemName}` : (item.itemName || "물품 이름 없음");

    if (item.purchaseLink) {
      const link = document.createElement("a");
      link.href = withProtocol(item.purchaseLink);
      link.textContent = label;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      nameCell.appendChild(link);
    } else {
      nameCell.textContent = label;
    }

    row.appendChild(nameCell);

    row.appendChild(cell(formatMoney(item.quantity), "review-cell-number"));
    row.appendChild(cell(formatMoney(item.unitPrice), "review-cell-money"));
    row.appendChild(cell(formatMoney(item.amount), "review-cell-money is-total"));
    row.appendChild(cell(item.description || "-", "review-cell-description"));

    // --- 상태 · 처리 단추 ---
    const statusCell = document.createElement("td");
    statusCell.className = "review-cell-status";

    const badge = document.createElement("span");
    badge.className = `review-status is-${item.status}`;
    badge.textContent = ITEM_STATUS_NAME[item.status];
    statusCell.appendChild(badge);

    if (canReview) {
      const actions = document.createElement("div");
      actions.className = "review-actions";
      actions.append(
        createButton("승인", "review-approve", () => setStatus(index, "approved")),
        createButton("반려", "review-reject", () => setStatus(index, "rejected"))
      );
      statusCell.appendChild(actions);
    }

    row.appendChild(statusCell);

    // 반려한 품목에는 사유를 적는 줄을 하나 더 붙인다.
    if (item.status === "rejected") {
      const memoRow = document.createElement("tr");
      memoRow.className = "review-memo-row";

      const memoCell = document.createElement("td");
      memoCell.colSpan = 8;

      const memoInput = document.createElement("input");
      memoInput.type = "text";
      memoInput.className = "review-memo-input";
      memoInput.placeholder = "반려 사유 (신청자에게 보입니다)";
      memoInput.value = item.reviewMemo ?? "";
      memoInput.readOnly = !canReview;
      memoInput.addEventListener("change", () => {
        item.reviewMemo = memoInput.value;
        save();
      });

      memoCell.appendChild(memoInput);
      memoRow.appendChild(memoCell);

      // 행 두 개를 이어 붙이기 위해 조각으로 돌려준다.
      const fragment = document.createDocumentFragment();
      fragment.append(row, memoRow);
      return fragment;
    }

    return row;
  }

  render();
  return wrap;
}

function cell(text, className) {
  const element = document.createElement("td");
  element.className = className;
  element.textContent = text;
  return element;
}

function createButton(text, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

// http 를 빼고 적은 주소도 열리게 한다. (javascript: 같은 주소는 https:// 가 붙어 실행되지 않는다)
export function withProtocol(link) {
  const text = String(link ?? "").trim();
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}
