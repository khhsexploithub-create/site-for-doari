import "../styles/site.css";
import "../styles/legacy-calendar.css";
import "../styles/neoul/calendar.css";

import { guardPage } from "../pageGuard.js";
import { EXECUTIVE_ROLE } from "../userRole.js";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

import { db } from "../firebase.js";
import { initEventPromo } from "../eventPromo/eventPromo.js";
import { getEventUrl } from "../eventPromo/eventService.js";
import { subscribeToUnionEvents } from "../unionEvents/unionEventService.js";
import { mountPageBell } from "../notifications/bell.js";

const SCHEDULES_COLLECTION = "clubSchedules";
const calendarHeading = document.querySelector("#calendarHeading");
const calendarGrid = document.querySelector("#calendarGrid");
const calendarStatus = document.querySelector("#calendarStatus");
const previousMonthButton = document.querySelector("#previousMonthButton");
const nextMonthButton = document.querySelector("#nextMonthButton");
const todayButton = document.querySelector("#todayButton");
const scheduleForm = document.querySelector("#scheduleForm");
const clubNameInput = document.querySelector("#scheduleClubName");
const dateInput = document.querySelector("#scheduleDate");
const endDateInput = document.querySelector("#scheduleEndDate");
const dateSelectionMessage = document.querySelector("#scheduleDateSelectionMessage");
const submitButton = document.querySelector("#scheduleSubmitButton");
const authMessage = document.querySelector("#scheduleAuthMessage");
const formMessage = document.querySelector("#scheduleFormMessage");
const scheduleDialog = document.querySelector("#scheduleDialog");
const dialogCloseButton = document.querySelector("#scheduleDialogClose");
const scheduleFormSection = document.querySelector("#scheduleFormSection");
const calendarHint = document.querySelector("#calendarHint");
const agendaEyebrow = document.querySelector("#agendaEyebrow");
const agendaHeading = document.querySelector("#agendaHeading");
const agendaList = document.querySelector("#agendaList");

// 오른쪽(모바일은 아래) '그날 일정'에 보여 줄 날짜. 처음엔 오늘.
let agendaDateKey = formatDateKey(new Date());
let displayedMonth = startOfMonth(new Date());
let schedules = [];
let currentUser = null;
let currentRole = "";
let isSubmitting = false;
let selectedDates = new Set();
let dragStartDateKey = "";
let dragCurrentDateKey = "";
let isDraggingDates = false;
let didDragDates = false;
let clubEvents = [];
let unionEvents = [];

previousMonthButton.addEventListener("click", () => changeMonth(-1));
nextMonthButton.addEventListener("click", () => changeMonth(1));
todayButton.addEventListener("click", () => {
  displayedMonth = startOfMonth(new Date());
  agendaDateKey = formatDateKey(new Date());
  renderCalendar();
});

dialogCloseButton.addEventListener("click", () => scheduleDialog.close());
scheduleDialog.addEventListener("click", (event) => {
  if (event.target === scheduleDialog) scheduleDialog.close();
});

dateInput.addEventListener("change", syncSelectionFromDateInputs);
endDateInput.addEventListener("change", syncSelectionFromDateInputs);

calendarGrid.addEventListener("pointerdown", (event) => {
  const day = event.target.closest(".calendar-day");
  if (!day || event.target.closest(".calendar-event")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  event.preventDefault();
  isDraggingDates = true;
  didDragDates = false;
  dragStartDateKey = day.dataset.dateKey;
  dragCurrentDateKey = dragStartDateKey;
  setSelectedDateRange(dragStartDateKey, dragStartDateKey);
});

document.addEventListener("pointermove", (event) => {
  if (!isDraggingDates) return;
  const day = document.elementFromPoint(event.clientX, event.clientY)?.closest(".calendar-day");
  if (!day || !calendarGrid.contains(day)) return;

  event.preventDefault();
  const dateKey = day.dataset.dateKey;
  if (dateKey === dragCurrentDateKey) return;
  dragCurrentDateKey = dateKey;
  didDragDates = dateKey !== dragStartDateKey;
  setSelectedDateRange(dragStartDateKey, dateKey);
}, { passive: false });

document.addEventListener("pointerup", finishDateDrag);
document.addEventListener("pointercancel", cancelDateDrag);

guardPage({
  allowAnonymous: true,
  onReady: ({ user, role }) => {
    currentUser = user;
    currentRole = role;

    // 일반 계정과 비로그인 방문자는 일정을 열람만 한다.
    if (role !== EXECUTIVE_ROLE) {
      scheduleFormSection?.remove();
      calendarHint.textContent = "날짜를 클릭하면 그날에 등록된 일정을 확인할 수 있습니다.";
    } else {
      submitButton.disabled = false;
      authMessage.textContent = `로그인 계정: ${user.email ?? "이메일 정보 없음"}`;
    }

    mountPageBell(user);
    watchSchedules();
    watchUnionEvents();

    initEventPromo({
      user,
      role: currentRole,
      onChange: (nextEvents) => {
        clubEvents = nextEvents;
        renderCalendar();
      }
    });
  }
});

// 연합회가 주최하는 행사(05)도 통합 캘린더에 함께 띄운다.
function watchUnionEvents() {
  subscribeToUnionEvents(
    (nextUnionEvents) => {
      unionEvents = nextUnionEvents;
      renderCalendar();
    },
    (error) => console.error("연합회 행사 조회 오류:", error)
  );
}

function watchSchedules() {
  onSnapshot(collection(db, SCHEDULES_COLLECTION), (snapshot) => {
    schedules = snapshot.docs
      .map((scheduleDoc) => ({ id: scheduleDoc.id, ...scheduleDoc.data() }))
      .sort((first, second) => `${first.date ?? ""}${first.startTime ?? ""}`.localeCompare(`${second.date ?? ""}${second.startTime ?? ""}`));
    calendarStatus.textContent = "";
    renderCalendar();
  }, (error) => {
    console.error("일정 조회 오류:", error);
    calendarStatus.textContent = "일정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    renderCalendar();
  });
}

scheduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentRole !== EXECUTIVE_ROLE) return;
  if (!currentUser) {
    formMessage.textContent = "일정을 등록하려면 먼저 로그인해주세요.";
    return;
  }
  if (isSubmitting) return;

  const formData = new FormData(scheduleForm);
  const schedule = Object.fromEntries(
    ["clubName", "title", "date", "startTime", "endTime", "location", "description"]
      .map((field) => [field, String(formData.get(field) ?? "").trim()])
  );

  if (Object.values(schedule).some((value) => !value)) {
    formMessage.textContent = "행사 진행 공지를 뺀 모든 항목을 입력해주세요.";
    return;
  }

  // 행사 진행 공지는 비워 두어도 된다.
  schedule.notice = String(formData.get("notice") ?? "").trim();
  if (schedule.endTime <= schedule.startTime) {
    formMessage.textContent = "종료 시간은 시작 시간보다 늦어야 합니다.";
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "등록 중...";
  formMessage.textContent = "";

  try {
    const selectedDateKeys = selectedDates.size
      ? Array.from(selectedDates).sort()
      : [schedule.date];

    await Promise.all(selectedDateKeys.map((date) => (
      addDoc(collection(db, SCHEDULES_COLLECTION), {
        ...schedule,
        date,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      })
    )));
    scheduleForm.reset();
    selectedDates.clear();
    endDateInput.min = "";
    updateDateSelectionMessage();
    formMessage.textContent = selectedDateKeys.length > 1
      ? `${selectedDateKeys.length}개 날짜에 일정이 등록되었습니다.`
      : "일정이 등록되었습니다.";
    displayedMonth = startOfMonth(parseLocalDate(selectedDateKeys[0]));
    renderCalendar();
  } catch (error) {
    console.error("일정 등록 오류:", error);
    formMessage.textContent = "일정 등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isSubmitting = false;
    submitButton.disabled = !currentUser;
    submitButton.textContent = "일정 등록";
  }
});

function changeMonth(offset) {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + offset, 1);
  renderCalendar();
}

function renderCalendar() {
  calendarHeading.textContent = `${displayedMonth.getFullYear()}년 ${displayedMonth.getMonth() + 1}월`;
  calendarGrid.textContent = "";

  const mondayIndex = (displayedMonth.getDay() + 6) % 7;
  const gridStart = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1 - mondayIndex);
  const todayKey = formatDateKey(new Date());

  for (let offset = 0; offset < 42; offset += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset);
    const dateKey = formatDateKey(date);
    const daySchedules = schedules.filter((schedule) => schedule.date === dateKey);
    const dayEvents = clubEvents.filter((clubEvent) => clubEvent.date === dateKey);
    const dayUnionEvents = unionEvents.filter((unionEvent) => unionEvent.date === dateKey);
    const day = document.createElement("div");
    day.className = "calendar-day";
    day.classList.toggle("is-outside", date.getMonth() !== displayedMonth.getMonth());
    day.classList.toggle("is-today", dateKey === todayKey);
    day.classList.toggle("is-selected", selectedDates.has(dateKey));
    day.dataset.dateKey = dateKey;
    day.setAttribute("role", "gridcell");
    day.setAttribute("tabindex", "0");
    day.setAttribute(
      "aria-label",
      `${formatKoreanDate(date)}`
      + `${daySchedules.length ? `, 일정 ${daySchedules.length}개` : ""}`
      + `${dayEvents.length ? `, 행사 ${dayEvents.length}개` : ""}`
      + `${dayUnionEvents.length ? `, 연합회 행사 ${dayUnionEvents.length}개` : ""}`
    );
    day.addEventListener("click", (event) => {
      if (event.detail === 0) selectSingleDate(dateKey);
    });
    day.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectSingleDate(dateKey);
      }
    });

    const dateNumber = document.createElement("span");
    dateNumber.className = "calendar-date";
    dateNumber.textContent = String(date.getDate());
    const events = document.createElement("div");
    events.className = "calendar-events";
    daySchedules.forEach((schedule) => events.appendChild(createScheduleButton(schedule)));
    dayEvents.forEach((clubEvent) => events.appendChild(createEventLink(clubEvent)));
    dayUnionEvents.forEach((unionEvent) => events.appendChild(createUnionEventLink(unionEvent)));
    day.classList.toggle("has-events", events.childElementCount > 0);
    day.append(dateNumber, events);
    calendarGrid.appendChild(day);
  }

  renderAgenda();
}

function renderAgenda() {
  if (!agendaList) return;

  const isToday = agendaDateKey === formatDateKey(new Date());
  agendaEyebrow.textContent = isToday ? "오늘" : "선택한 날";
  agendaHeading.textContent = formatKoreanDate(parseLocalDate(agendaDateKey));

  const items = [
    ...schedules.filter((schedule) => schedule.date === agendaDateKey).map(createScheduleButton),
    ...clubEvents.filter((clubEvent) => clubEvent.date === agendaDateKey).map(createEventLink),
    ...unionEvents.filter((unionEvent) => unionEvent.date === agendaDateKey).map(createUnionEventLink)
  ];

  agendaList.textContent = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "agenda-empty";
    empty.textContent = "등록된 일정이 없어요.";
    agendaList.appendChild(empty);
    return;
  }

  items.forEach((element) => {
    const item = document.createElement("li");
    item.appendChild(element);
    agendaList.appendChild(item);
  });
}

function createScheduleButton(schedule) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "calendar-event";
  button.title = `${schedule.clubName ?? "동아리명 없음"} · ${schedule.title ?? "제목 없음"}`;

  const club = document.createElement("span");
  const title = document.createElement("strong");
  const time = document.createElement("span");
  club.textContent = schedule.clubName ?? "동아리명 없음";
  title.textContent = schedule.title ?? "제목 없음";
  time.textContent = `${schedule.startTime ?? "시간 미정"}${schedule.endTime ? `–${schedule.endTime}` : ""}`;
  button.append(club, title, time);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    showScheduleDetail(schedule);
  });
  button.addEventListener("keydown", (event) => event.stopPropagation());
  return button;
}

// 행사는 눌렀을 때 상세 페이지로 이동한다.
function createEventLink(clubEvent) {
  const link = document.createElement("a");
  link.className = "calendar-event is-promo";
  link.href = getEventUrl(clubEvent.id);
  link.title = `${clubEvent.clubName ?? "동아리명 없음"} · ${clubEvent.title ?? "행사 이름 없음"}`;

  const club = document.createElement("span");
  const title = document.createElement("strong");
  const time = document.createElement("span");

  club.textContent = `홍보 · ${clubEvent.clubName ?? "동아리명 없음"}`;
  title.textContent = clubEvent.title ?? "행사 이름 없음";
  time.textContent = `${clubEvent.startTime ?? "시간 미정"}${clubEvent.endTime ? `–${clubEvent.endTime}` : ""}`;

  link.append(club, title, time);
  link.addEventListener("click", (event) => event.stopPropagation());
  link.addEventListener("pointerdown", (event) => event.stopPropagation());

  return link;
}

// 연합회 행사는 눌렀을 때 05 연합회 행사 페이지로 이동한다.
function createUnionEventLink(unionEvent) {
  const link = document.createElement("a");
  link.className = "calendar-event is-union";
  link.href = "/union-events.html";
  link.title = `연합회 행사 · ${unionEvent.title ?? "행사 제목 없음"}`;

  const label = document.createElement("span");
  const title = document.createElement("strong");
  const time = document.createElement("span");

  label.textContent = "연합회 행사";
  title.textContent = unionEvent.title ?? "행사 제목 없음";
  time.textContent = `${unionEvent.startTime ?? "시간 미정"}${unionEvent.endTime ? `–${unionEvent.endTime}` : ""}`;

  link.append(label, title, time);
  link.addEventListener("click", (event) => event.stopPropagation());
  link.addEventListener("pointerdown", (event) => event.stopPropagation());

  return link;
}

function finishDateDrag() {
  if (!isDraggingDates) return;
  isDraggingDates = false;

  if (!didDragDates) {
    selectSingleDate(dragStartDateKey);
  } else {
    focusRegistrationForm();
  }
}

function cancelDateDrag() {
  isDraggingDates = false;
}

function selectSingleDate(dateKey, { focusForm = true } = {}) {
  agendaDateKey = dateKey;
  setSelectedDateRange(dateKey, dateKey);
  displayedMonth = startOfMonth(parseLocalDate(dateKey));
  renderCalendar();
  if (focusForm) focusRegistrationForm();
}

function syncSelectionFromDateInputs() {
  const startDateKey = dateInput.value || endDateInput.value;
  if (!startDateKey) {
    selectedDates.clear();
    endDateInput.min = "";
    updateDateSelectionMessage();
    updateSelectedDayStyles();
    return;
  }

  const endDateKey = endDateInput.value || startDateKey;
  setSelectedDateRange(startDateKey, endDateKey);
  displayedMonth = startOfMonth(parseLocalDate(Array.from(selectedDates).sort()[0]));
  renderCalendar();
}

function setSelectedDateRange(startDateKey, endDateKey) {
  selectedDates = new Set(getDateRangeKeys(startDateKey, endDateKey));
  const sortedDates = Array.from(selectedDates).sort();
  dateInput.value = sortedDates[0] ?? "";
  endDateInput.value = sortedDates.length > 1 ? sortedDates.at(-1) : "";
  endDateInput.min = sortedDates[0] ?? "";
  updateDateSelectionMessage();
  updateSelectedDayStyles();
}

function getDateRangeKeys(startDateKey, endDateKey) {
  const start = parseLocalDate(startDateKey);
  const end = parseLocalDate(endDateKey);
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const dateKeys = [];

  for (let date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    dateKeys.push(formatDateKey(date));
  }
  return dateKeys;
}

function updateSelectedDayStyles() {
  calendarGrid.querySelectorAll(".calendar-day").forEach((day) => {
    day.classList.toggle("is-selected", selectedDates.has(day.dataset.dateKey));
  });
}

function updateDateSelectionMessage() {
  const sortedDates = Array.from(selectedDates).sort();
  if (!sortedDates.length) {
    dateSelectionMessage.textContent = "날짜를 클릭하거나 드래그해 선택하세요.";
    return;
  }
  if (sortedDates.length === 1) {
    dateSelectionMessage.textContent = `선택한 날짜: ${sortedDates[0]}`;
    return;
  }
  dateSelectionMessage.textContent = `선택한 기간: ${sortedDates[0]} ~ ${sortedDates.at(-1)} (${sortedDates.length}일)`;
}

function focusRegistrationForm() {
  // 일반 계정에는 등록 폼이 없다.
  if (currentRole !== EXECUTIVE_ROLE || !scheduleForm.isConnected) return;

  scheduleForm.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => clubNameInput.focus({ preventScroll: true }), 350);
}

function showScheduleDetail(schedule) {
  document.querySelector("#scheduleDetailClub").textContent = schedule.clubName ?? "동아리명 없음";
  document.querySelector("#scheduleDetailTitle").textContent = schedule.title ?? "제목 없음";
  document.querySelector("#scheduleDetailDate").textContent = schedule.date ? formatKoreanDate(parseLocalDate(schedule.date)) : "날짜 미정";
  document.querySelector("#scheduleDetailStartTime").textContent = schedule.startTime ?? "시간 미정";
  document.querySelector("#scheduleDetailEndTime").textContent = schedule.endTime ?? "시간 미정";
  document.querySelector("#scheduleDetailLocation").textContent = schedule.location ?? "장소 미정";
  document.querySelector("#scheduleDetailDescription").textContent = schedule.description ?? "입력된 내용이 없습니다.";
  document.querySelector("#scheduleDetailNotice").textContent =
    schedule.notice?.trim() || "등록된 진행 공지가 없습니다.";
  scheduleDialog.showModal();
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatKoreanDate(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

renderCalendar();
