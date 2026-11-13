import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc
} from "firebase/firestore";

import { db } from "../firebase.js";
import {
  createField,
  createInfoLine,
  formatDateTime,
  normalize,
  todayKey
} from "./adminUi.js";

const SCHEDULES_COLLECTION = "clubSchedules";

const listElement = document.querySelector("#scheduleAdminList");
const searchInput = document.querySelector("#scheduleAdminSearch");
const refreshButton = document.querySelector("#scheduleAdminRefreshButton");
const totalCount = document.querySelector("#scheduleTotalCount");
const upcomingCount = document.querySelector("#scheduleUpcomingCount");
const pastCount = document.querySelector("#schedulePastCount");

let schedules = [];
let isInitialized = false;

export function initScheduleAdmin() {
  if (isInitialized) return;
  isInitialized = true;

  searchInput.addEventListener("input", renderSchedules);
  refreshButton.addEventListener("click", loadScheduleAdmin);
}

export async function loadScheduleAdmin() {
  listElement.textContent = "일정을 불러오는 중...";

  try {
    const snapshot = await getDocs(collection(db, SCHEDULES_COLLECTION));

    schedules = snapshot.docs
      .map((scheduleDoc) => ({ id: scheduleDoc.id, ...scheduleDoc.data() }))
      .sort((first, second) => `${second.date ?? ""}${second.startTime ?? ""}`
        .localeCompare(`${first.date ?? ""}${first.startTime ?? ""}`));

    renderStats();
    renderSchedules();
  } catch (error) {
    console.error("일정 조회 오류:", error);
    listElement.textContent = "일정을 불러오지 못했습니다.";
  }
}

function renderStats() {
  const today = todayKey();
  const upcoming = schedules.filter((schedule) => (schedule.date ?? "") >= today).length;

  totalCount.textContent = schedules.length.toLocaleString("ko-KR");
  upcomingCount.textContent = upcoming.toLocaleString("ko-KR");
  pastCount.textContent = (schedules.length - upcoming).toLocaleString("ko-KR");
}

function renderSchedules() {
  const searchTerm = normalize(searchInput.value.trim());
  const filtered = schedules.filter((schedule) => (
    !searchTerm
    || normalize(schedule.clubName).includes(searchTerm)
    || normalize(schedule.title).includes(searchTerm)
    || normalize(schedule.date).includes(searchTerm)
  ));

  listElement.textContent = "";

  if (filtered.length === 0) {
    listElement.textContent = searchTerm
      ? "검색 결과가 없습니다."
      : "아직 등록된 일정이 없습니다.";
    return;
  }

  filtered.forEach((schedule) => listElement.appendChild(createScheduleCard(schedule)));
}

function createScheduleCard(schedule) {
  const card = document.createElement("article");
  card.className = "admin-card schedule-admin-card";

  const title = document.createElement("h2");
  title.textContent = `${schedule.date ?? "날짜 미정"} · ${schedule.title ?? "제목 없음"}`;

  const createdAt = createInfoLine("등록 시간", formatDateTime(schedule.createdAt));

  const editGrid = document.createElement("div");
  editGrid.className = "admin-edit-grid";

  const clubField = createField("동아리 이름", { value: schedule.clubName ?? "" });
  const titleField = createField("일정 제목", { value: schedule.title ?? "" });
  const dateField = createField("날짜", { type: "date", value: schedule.date ?? "" });
  const locationField = createField("장소", { value: schedule.location ?? "" });
  const startField = createField("시작 시간", { type: "time", value: schedule.startTime ?? "" });
  const endField = createField("종료 시간", { type: "time", value: schedule.endTime ?? "" });

  editGrid.append(
    clubField.label,
    titleField.label,
    dateField.label,
    locationField.label,
    startField.label,
    endField.label
  );

  const descriptionField = createField("상세 내용", {
    value: schedule.description ?? "",
    multiline: true
  });

  const message = document.createElement("p");
  message.className = "message admin-card-message-line";

  const actions = document.createElement("div");
  actions.className = "admin-card-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "수정 저장";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "삭제";

  saveButton.addEventListener("click", async () => {
    const updated = {
      clubName: clubField.input.value.trim(),
      title: titleField.input.value.trim(),
      date: dateField.input.value,
      location: locationField.input.value.trim(),
      startTime: startField.input.value,
      endTime: endField.input.value,
      description: descriptionField.input.value.trim()
    };

    if (Object.values(updated).some((value) => !value)) {
      message.textContent = "모든 항목을 입력해주세요.";
      return;
    }

    if (updated.endTime <= updated.startTime) {
      message.textContent = "종료 시간은 시작 시간보다 늦어야 합니다.";
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "저장 중...";
    message.textContent = "";

    try {
      await updateDoc(doc(db, SCHEDULES_COLLECTION, schedule.id), updated);
      await loadScheduleAdmin();
    } catch (error) {
      console.error("일정 수정 오류:", error);
      message.textContent = "일정을 수정하지 못했습니다. 잠시 후 다시 시도해주세요.";
      saveButton.disabled = false;
      saveButton.textContent = "수정 저장";
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`'${schedule.title ?? "제목 없음"}' 일정을 삭제할까요?`)) return;

    deleteButton.disabled = true;
    deleteButton.textContent = "삭제 중...";

    try {
      await deleteDoc(doc(db, SCHEDULES_COLLECTION, schedule.id));
      await loadScheduleAdmin();
    } catch (error) {
      console.error("일정 삭제 오류:", error);
      message.textContent = "일정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.";
      deleteButton.disabled = false;
      deleteButton.textContent = "삭제";
    }
  });

  actions.append(saveButton, deleteButton);
  card.append(title, createdAt, editGrid, descriptionField.label, actions, message);
  return card;
}
