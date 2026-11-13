import "../style.css";

import { guardPage } from "../pageGuard.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp
} from "firebase/firestore";

import { db } from "../firebase.js";
import {
  PRINTER_RESOURCE_NAME,
  PRINTER_TRAINING_MESSAGE,
  resourceList
} from "./resourceList.js";

const reservationForm = document.querySelector("#reservationForm");
const clubNameInput = document.querySelector("#reservationClubName");
const resourceSelect = document.querySelector("#reservationResource");
const dateInput = document.querySelector("#reservationDate");
const startTimeInput = document.querySelector("#reservationStartTime");
const endTimeInput = document.querySelector("#reservationEndTime");
const purposeInput = document.querySelector("#reservationPurpose");
const submitButton = document.querySelector("#reservationSubmitButton");
const authMessage = document.querySelector("#reservationAuthMessage");
const formMessage = document.querySelector("#reservationFormMessage");
const resourceTabs = document.querySelectorAll(".resource-tab");
const resourceListElement = document.querySelector("#resourceList");
const categoryFilter = document.querySelector("#reservationCategoryFilter");
const searchInput = document.querySelector("#reservationSearchInput");
const reservationList = document.querySelector("#reservationList");
const myReservationList = document.querySelector("#myReservationList");
const trainingNotice = document.querySelector("#reservationTrainingNotice");

const RESERVATIONS_COLLECTION = "resourceReservations";
let activeCategory = "공간";
let currentUser = null;
let reservations = [];
let isSubmitting = false;
let hasPrinterAccess = false;

renderResources();
populateResourceSelect();

resourceTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeCategory = tab.dataset.category;
    resourceTabs.forEach((button) => {
      const isActive = button === tab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    renderResources();
  });
});

categoryFilter.addEventListener("change", renderReservations);
searchInput.addEventListener("input", renderReservations);

guardPage({
  requireExecutive: true,
  onReady: async ({ user, profile }) => {
    currentUser = user;
    hasPrinterAccess = profile.printerAccess === true;
    submitButton.disabled = false;
    authMessage.textContent = `로그인 계정: ${user.email ?? "이메일 정보 없음"}`;

    updateTrainingNotice();
    await loadReservations();
  }
});

resourceSelect.addEventListener("change", updateTrainingNotice);

// 교육 이수가 필요한 자원을 고르면 안내 문구를 띄우고 신청을 막는다.
function updateTrainingNotice() {
  const selectedResource = resourceList.find(({ name }) => name === resourceSelect.value);
  const needsTraining = Boolean(selectedResource?.requiresTraining) && !hasPrinterAccess;

  trainingNotice.hidden = !needsTraining;
  trainingNotice.textContent = needsTraining ? PRINTER_TRAINING_MESSAGE : "";
  submitButton.disabled = needsTraining || !currentUser;

  if (needsTraining) {
    formMessage.textContent = "";
  }
}

reservationForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || isSubmitting) return;

  const selectedResource = resourceList.find(({ name }) => name === resourceSelect.value);
  const reservation = {
    clubName: clubNameInput.value.trim(),
    category: selectedResource?.category ?? "",
    resourceName: resourceSelect.value,
    date: dateInput.value,
    startTime: startTimeInput.value,
    endTime: endTimeInput.value,
    purpose: purposeInput.value.trim()
  };

  if (reservation.resourceName === PRINTER_RESOURCE_NAME && !hasPrinterAccess) {
    trainingNotice.hidden = false;
    trainingNotice.textContent = PRINTER_TRAINING_MESSAGE;
    return;
  }

  if (!isValidReservation(reservation)) {
    formMessage.textContent = "모든 항목을 입력하고 종료 시간을 시작 시간보다 늦게 선택해주세요.";
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "신청 중...";
  formMessage.textContent = "";

  try {
    const latestReservations = await getReservations();
    const hasConflict = latestReservations
      .filter((savedReservation) => savedReservation.status !== "rejected")
      .some((savedReservation) => isTimeOverlapping(reservation, savedReservation));

    if (hasConflict) {
      formMessage.textContent = "선택한 자원은 해당 시간에 이미 예약되어 있습니다. 다른 시간을 선택해주세요.";
      return;
    }

    await addDoc(collection(db, RESERVATIONS_COLLECTION), {
      ...reservation,
      status: "pending",
      adminMemo: "",
      reviewedAt: null,
      uid: currentUser.uid,
      createdAt: serverTimestamp()
    });
    reservationForm.reset();
    populateResourceSelect();
    updateTrainingNotice();
    formMessage.textContent = "예약 신청이 완료되었습니다.";
    await loadReservations();
  } catch (error) {
    console.error("자원 예약 처리 오류:", error);
    formMessage.textContent = "예약 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "예약 신청";
  }
});

function renderResources() {
  resourceListElement.textContent = "";
  resourceList
    .filter(({ category }) => category === activeCategory)
    .forEach((resource) => {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      const description = document.createElement("span");
      name.textContent = resource.name;
      description.textContent = resource.description;
      item.append(name, description);

      if (resource.requiresTraining) {
        const badge = document.createElement("span");
        badge.className = "resource-training-badge";
        badge.textContent = "사전 교육 필요";
        item.appendChild(badge);
      }
      resourceListElement.appendChild(item);
    });
}

function populateResourceSelect() {
  const currentValue = resourceSelect.value;
  resourceSelect.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "예약할 자원을 선택하세요";
  placeholder.disabled = true;
  placeholder.selected = !currentValue;
  resourceSelect.appendChild(placeholder);

  ["공간", "장비", "물품"].forEach((category) => {
    const group = document.createElement("optgroup");
    group.label = category;
    resourceList
      .filter((resource) => resource.category === category)
      .forEach((resource) => {
        const option = document.createElement("option");
        option.value = resource.name;
        option.textContent = resource.name;
        option.selected = resource.name === currentValue;
        group.appendChild(option);
      });
    resourceSelect.appendChild(group);
  });
}

async function loadReservations() {
  reservationList.textContent = "예약 내역을 불러오는 중...";
  myReservationList.textContent = "내 예약을 불러오는 중...";

  try {
    reservations = await getReservations();
    renderReservations();
    renderMyReservations();
  } catch (error) {
    console.error("예약 내역 조회 오류:", error);
    reservationList.textContent = "예약 내역을 불러오지 못했습니다.";
    myReservationList.textContent = "내 예약을 불러오지 못했습니다.";
  }
}

async function getReservations() {
  const snapshot = await getDocs(collection(db, RESERVATIONS_COLLECTION));
  return snapshot.docs
    .map((reservationDoc) => ({ id: reservationDoc.id, ...reservationDoc.data() }))
    .sort((first, second) => `${first.date ?? ""}${first.startTime ?? ""}`.localeCompare(`${second.date ?? ""}${second.startTime ?? ""}`));
}

function renderReservations() {
  const searchTerm = searchInput.value.trim().toLocaleLowerCase("ko-KR");

  // 관리자가 승인한 예약만 공개 내역에 기재한다.
  const filteredReservations = reservations.filter((reservation) => (
    ["approved", "completed"].includes(reservation.status)
    && (!categoryFilter.value || reservation.category === categoryFilter.value)
    && (!searchTerm || (reservation.resourceName ?? "").toLocaleLowerCase("ko-KR").includes(searchTerm))
  ));

  renderReservationItems(reservationList, filteredReservations, "승인된 예약 내역이 없습니다.");
}

function renderMyReservations() {
  const myReservations = reservations.filter((reservation) => reservation.uid === currentUser?.uid);
  renderReservationItems(myReservationList, myReservations, "아직 신청한 예약이 없습니다.", true, true);
}

function renderReservationItems(listElement, items, emptyMessage, showCancelButton = false, showAdminMemo = false) {
  listElement.textContent = "";
  if (items.length === 0) {
    listElement.textContent = emptyMessage;
    return;
  }

  items.forEach((reservation) => {
    const item = document.createElement("li");
    item.className = "reservation-item";
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    const status = document.createElement("span");
    title.textContent = reservation.resourceName ?? "자원명 없음";
    status.className = `reservation-status status-${reservation.status ?? "pending"}`;
    status.textContent = getStatusName(reservation.status);
    heading.append(title, status);

    const details = document.createElement("p");
    details.textContent = `${reservation.clubName ?? "동아리명 없음"} · ${reservation.category ?? "카테고리 없음"} · ${reservation.date ?? "날짜 미정"} ${reservation.startTime ?? ""}~${reservation.endTime ?? ""}`;
    const purpose = document.createElement("p");
    purpose.className = "reservation-purpose";
    purpose.textContent = `사용 목적: ${reservation.purpose ?? "입력된 내용 없음"}`;
    item.append(heading, details, purpose);

    // 승인 / 반려 사유는 신청자 본인에게만 보여준다.
    if (showAdminMemo && reservation.adminMemo) {
      const adminMemo = document.createElement("p");
      adminMemo.className = "reservation-admin-memo";
      adminMemo.textContent = `관리자 의견: ${reservation.adminMemo}`;
      item.appendChild(adminMemo);
    }

    if (showCancelButton && reservation.status === "pending") {
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "secondary reservation-cancel-button";
      cancelButton.textContent = "예약 취소";
      cancelButton.addEventListener("click", () => cancelReservation(reservation, cancelButton));
      item.appendChild(cancelButton);
    }

    listElement.appendChild(item);
  });
}

async function cancelReservation(reservation, cancelButton) {
  if (!currentUser || reservation.uid !== currentUser.uid || reservation.status !== "pending") return;
  if (!window.confirm(`'${reservation.resourceName}' 예약을 취소할까요?`)) return;

  cancelButton.disabled = true;
  cancelButton.textContent = "취소 중...";
  try {
    await deleteDoc(doc(db, RESERVATIONS_COLLECTION, reservation.id));
    await loadReservations();
  } catch (error) {
    console.error("예약 취소 오류:", error);
    cancelButton.disabled = false;
    cancelButton.textContent = "예약 취소";
    formMessage.textContent = "예약을 취소하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
}

function isValidReservation({ clubName, category, resourceName, date, startTime, endTime, purpose }) {
  return Boolean(clubName && category && resourceName && date && startTime && endTime && purpose && startTime < endTime);
}

function isTimeOverlapping(candidate, savedReservation) {
  return savedReservation.resourceName === candidate.resourceName
    && savedReservation.date === candidate.date
    && candidate.startTime < savedReservation.endTime
    && candidate.endTime > savedReservation.startTime;
}

function getStatusName(status) {
  return ({ approved: "승인됨", rejected: "반려됨", completed: "사용 완료", pending: "승인 대기" })[status] ?? "승인 대기";
}
