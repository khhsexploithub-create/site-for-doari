import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";

import { db } from "../firebase.js";
import {
  createInfoLine,
  createStatusBadge,
  formatDateTime
} from "./adminUi.js";

const RESERVATIONS_COLLECTION = "resourceReservations";

const listElement = document.querySelector("#reservationAdminList");
const statusFilter = document.querySelector("#reservationAdminStatusFilter");
const refreshButton = document.querySelector("#reservationAdminRefreshButton");
const totalCount = document.querySelector("#reservationTotalCount");
const pendingCount = document.querySelector("#reservationPendingCount");
const approvedCount = document.querySelector("#reservationApprovedCount");
const rejectedCount = document.querySelector("#reservationRejectedCount");

let reservations = [];
let isInitialized = false;

export function initResourceAdmin() {
  if (isInitialized) return;
  isInitialized = true;

  statusFilter.addEventListener("change", renderReservations);
  refreshButton.addEventListener("click", loadResourceAdmin);
}

export async function loadResourceAdmin() {
  listElement.textContent = "예약 신청을 불러오는 중...";

  try {
    const snapshot = await getDocs(collection(db, RESERVATIONS_COLLECTION));

    reservations = snapshot.docs
      .map((reservationDoc) => ({ id: reservationDoc.id, ...reservationDoc.data() }))
      .sort(compareReservations);

    renderStats();
    renderReservations();
  } catch (error) {
    console.error("예약 신청 조회 오류:", error);
    listElement.textContent = "예약 신청을 불러오지 못했습니다.";
  }
}

// 대기 중인 신청을 먼저, 그다음 날짜순으로 보여준다.
function compareReservations(first, second) {
  const firstPending = getStatus(first) === "pending" ? 0 : 1;
  const secondPending = getStatus(second) === "pending" ? 0 : 1;

  if (firstPending !== secondPending) return firstPending - secondPending;

  return `${first.date ?? ""}${first.startTime ?? ""}`
    .localeCompare(`${second.date ?? ""}${second.startTime ?? ""}`);
}

function getStatus(reservation) {
  return reservation.status ?? "pending";
}

function renderStats() {
  totalCount.textContent = reservations.length.toLocaleString("ko-KR");
  pendingCount.textContent = countByStatus("pending");
  approvedCount.textContent = countByStatus("approved");
  rejectedCount.textContent = countByStatus("rejected");
}

function countByStatus(status) {
  return reservations.filter((reservation) => getStatus(reservation) === status).length;
}

function renderReservations() {
  const selectedStatus = statusFilter.value;
  const filtered = reservations.filter((reservation) => (
    !selectedStatus || getStatus(reservation) === selectedStatus
  ));

  listElement.textContent = "";

  if (filtered.length === 0) {
    listElement.textContent = selectedStatus
      ? "해당 상태의 예약 신청이 없습니다."
      : "아직 접수된 예약 신청이 없습니다.";
    return;
  }

  filtered.forEach((reservation) => listElement.appendChild(createReservationCard(reservation)));
}

function createReservationCard(reservation) {
  const status = getStatus(reservation);

  const card = document.createElement("article");
  card.className = `admin-card reservation-admin-card status-${status}`;

  const title = document.createElement("h2");
  title.textContent = reservation.resourceName ?? "자원명 없음";

  const clubName = createInfoLine("동아리 이름", reservation.clubName ?? "동아리명 없음");
  const category = createInfoLine("카테고리", reservation.category ?? "카테고리 없음");
  const schedule = createInfoLine(
    "사용 일시",
    `${reservation.date ?? "날짜 미정"} ${reservation.startTime ?? ""}~${reservation.endTime ?? ""}`.trim()
  );

  const purpose = createInfoLine("사용 목적", reservation.purpose ?? "입력된 내용 없음");
  purpose.classList.add("admin-card-message");

  const createdAt = createInfoLine("신청 시간", formatDateTime(reservation.createdAt));
  const badge = createStatusBadge(getStatusName(status), status);

  const memoLabel = document.createElement("label");
  memoLabel.className = "admin-memo-label";
  memoLabel.textContent = "승인 / 반려 사유";

  const memoInput = document.createElement("textarea");
  memoInput.placeholder = "승인 의견 또는 반려 사유를 입력하세요. 신청자에게만 표시됩니다.";
  memoInput.value = reservation.adminMemo ?? "";
  memoLabel.appendChild(memoInput);

  const message = document.createElement("p");
  message.className = "message admin-card-message-line";

  const actions = document.createElement("div");
  actions.className = "admin-card-actions";

  const approveButton = document.createElement("button");
  approveButton.type = "button";
  approveButton.textContent = "승인";

  const rejectButton = document.createElement("button");
  rejectButton.type = "button";
  rejectButton.className = "danger";
  rejectButton.textContent = "반려";

  approveButton.addEventListener("click", () => review("approved"));
  rejectButton.addEventListener("click", () => review("rejected"));

  async function review(nextStatus) {
    const memo = memoInput.value.trim();

    if (nextStatus === "rejected" && !memo) {
      message.textContent = "반려 사유를 입력해주세요.";
      return;
    }

    approveButton.disabled = true;
    rejectButton.disabled = true;
    message.textContent = "처리 중...";

    try {
      await updateDoc(doc(db, RESERVATIONS_COLLECTION, reservation.id), {
        status: nextStatus,
        adminMemo: memo,
        reviewedAt: serverTimestamp()
      });

      await loadResourceAdmin();
    } catch (error) {
      console.error("예약 상태 변경 오류:", error);
      message.textContent = "예약 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.";
      approveButton.disabled = false;
      rejectButton.disabled = false;
    }
  }

  actions.append(approveButton, rejectButton);
  card.append(title, clubName, category, schedule, purpose, createdAt, badge, memoLabel, actions, message);

  if (reservation.reviewedAt) {
    card.insertBefore(createInfoLine("처리 시간", formatDateTime(reservation.reviewedAt)), badge);
  }

  return card;
}

function getStatusName(status) {
  return ({
    approved: "승인됨",
    rejected: "반려됨",
    completed: "사용 완료",
    pending: "승인 대기"
  })[status] ?? "승인 대기";
}
